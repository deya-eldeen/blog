---
layout: post
hidden: true
title: "Writing Custom Reactive Extensions"
date: "2026-05-27"
last_modified_at: "2026-05-27"
permalink: /rxswift-custom-reactive-extensions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, RxCocoa, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
---
RxCocoa covers UIKit's controls, but every app has types RxCocoa has never heard of: a custom rating control, a download manager with a delegate, a Bluetooth scanner, a gauge view drawn by hand. Wrapping each one in ad hoc subjects works, and spreads RxSwift plumbing through the codebase. The better approach is the one RxCocoa itself uses: give the type an `rx` namespace and expose its events as observables and its properties as binders, so that `downloader.rx.progress` and `gauge.rx.value` read like `textField.rx.text`.

This article builds each kind of extension RxCocoa provides, for types of its own: observable properties, `Binder`s, `ControlProperty` and `ControlEvent` for a custom control, and a `DelegateProxy` that turns a delegate protocol into observables while still forwarding to an existing delegate. It finishes with custom operators, including one that is easy to get wrong: an operator with state that, written the obvious way, gave its second subscriber pairs of each element with itself.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Everything here works the same on iOS; the types are plain `NSObject` subclasses rather than UIKit views, so the examples run in one `main.swift` of an executable target that depends on `RxSwift`, `RxRelay`, and `RxCocoa`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/).

<!-- check-uses: rx-record -->
```swift
import RxSwift
import RxRelay
import RxCocoa
import Foundation
```

## The `rx` namespace

`rx` is defined in RxSwift by two small types. `Reactive<Base>` is a struct holding a `base` value, and `ReactiveCompatible` is a protocol with a default `rx` property that returns `Reactive(self)`:

<!-- skip-check -->
```swift
public struct Reactive<Base> {
    public let base: Base
    public init(_ base: Base) { self.base = base }
}

public protocol ReactiveCompatible {
    associatedtype ReactiveBase
    var rx: Reactive<ReactiveBase> { get set }
}
```

`NSObject` conforms to `ReactiveCompatible`, so every Objective-C class already has `.rx`. A Swift type opts in with one line, and then any `extension Reactive where Base: YourType` adds members to its namespace:

```swift
final class StepCounter {
    fileprivate let stepsRelay = BehaviorRelay(value: 0)
    func recordStep() { stepsRelay.accept(stepsRelay.value + 1) }
}

extension StepCounter: ReactiveCompatible {}

extension Reactive where Base: StepCounter {
    /// The number of steps so far, replayed to each new subscriber.
    var steps: Observable<Int> { base.stepsRelay.asObservable() }
}

let pedometer = StepCounter()
pedometer.recordStep()
pedometer.recordStep()
assert(record(pedometer.rx.steps) == ["2"])
```

The relay is `fileprivate`, so only this file, where the extension lives, can see it. That is the pattern for exposing a type's state reactively without making the state itself public: callers see `pedometer.rx.steps`, an observable they cannot send into.

## `Binder`: a writable property

A `Binder` is the write side: an observer that applies each element to an object. Its initializer takes the object and a closure; the binder holds the object weakly and runs the closure on the main thread, scheduling it there when an element arrives elsewhere, as [RxCocoa: Binding Observables to UIKit](/rxswift-rxcocoa-uikit/#binder-writing-to-views-on-the-main-thread) measured. Here is one for a hand-drawn gauge:

```swift
final class Gauge: NSObject {
    private(set) var fraction = 0.0
    private(set) var redraws = 0
    func setFraction(_ value: Double) {
        fraction = min(max(value, 0), 1)
        redraws += 1
    }
}

extension Reactive where Base: Gauge {
    var fraction: Binder<Double> {
        Binder(base) { gauge, value in gauge.setFraction(value) }
    }
}

let gauge = Gauge()
let gaugeBinding = Observable.of(0.25, 0.5, 1.4).bind(to: gauge.rx.fraction)
assert(gauge.fraction == 1.0 && gauge.redraws == 3)          // clamped by the gauge's own setter
```

Because the binder holds its object weakly, a binding never keeps the object alive, and elements that arrive after the object is gone are dropped:

```swift
var temporaryGauge: Gauge? = Gauge()
weak var weakGauge = temporaryGauge
let levels = PublishSubject<Double>()
let levelBinding = levels.bind(to: temporaryGauge!.rx.fraction)
levels.onNext(0.3)
temporaryGauge = nil
assert(weakGauge == nil)                                      // the binding did not retain it
levels.onNext(0.6)                                            // dropped, no crash
```

For a `@MainActor` type, as every UIKit view is, the binder's closure is the right place to touch the object, because `Binder` only ever calls it on the main thread.

For a property that is simply settable, no extension is needed at all. Since RxSwift 6, `Reactive` is `@dynamicMemberLookup` and synthesizes a `Binder` for every writable property of a class through its key path. That is where `label.rx.text` and `view.rx.isHidden` come from:

```swift
final class Banner: NSObject {
    var message = ""
}

let banner = Banner()
let bannerBinding = Observable.of("Saving…", "Saved").bind(to: banner.rx.message)
assert(banner.message == "Saved")
```

The gauge needed its own binder only because its `fraction` has a private setter and clamping logic; when the property is `var` and assigning it is all a binding should do, the synthesized binder is enough.

Like every RxCocoa binding, a `Binder` treats an error as a programmer error, and a debug build stops with `fatalError("Binding error: ...")`. Bind `Driver`s to binders.

## A custom control: `ControlProperty` and `ControlEvent`

A control has both directions: it reports user changes and accepts values from code. RxCocoa's `ControlProperty<T>` packages an observable of values and an observer for setting them, with the contract that the observable emits the current value on subscription, never errors, and delivers on the main thread. `ControlEvent<T>` packages an observable of events with the same guarantees, minus the initial value.

Here is a star-rating control with a callback-based API, the shape of many hand-written controls:

```swift
final class RatingControl: NSObject {
    private(set) var rating = 0
    var onRatingChanged: ((Int) -> Void)?
    var onCleared: (() -> Void)?

    /// Called by the control's own gesture handling when the user taps a star.
    func userTapped(star: Int) {
        rating = star
        onRatingChanged?(star)
    }
    func userCleared() {
        rating = 0
        onRatingChanged?(0)
        onCleared?()
    }
    /// Programmatic changes do not call back, like UIKit controls.
    func setRating(_ value: Int) { rating = value }
}
```

The reactive extension wraps the callbacks in `Observable.create`, starts with the current value, and pairs that with a binder for the setter:

```swift
extension Reactive where Base: RatingControl {
    var rating: ControlProperty<Int> {
        let control = base
        let userChanges = Observable<Int>.create { [weak control] observer in
            guard let control else {
                observer.onCompleted()
                return Disposables.create()
            }
            observer.onNext(control.rating)                     // the current value first
            control.onRatingChanged = { observer.onNext($0) }
            return Disposables.create { [weak control] in control?.onRatingChanged = nil }
        }
        .take(until: control.rx.deallocated)                    // complete when the control goes away
        let setter = Binder(control) { control, value in control.setRating(value) }
        return ControlProperty(values: userChanges, valueSink: setter)
    }

    var cleared: ControlEvent<Void> {
        let control = base
        let events = Observable<Void>.create { [weak control] observer in
            control?.onCleared = { observer.onNext(()) }
            return Disposables.create { [weak control] in control?.onCleared = nil }
        }
        .take(until: control.rx.deallocated)
        return ControlEvent(events: events)
    }
}

let stars = RatingControl()
var ratings: [Int] = []
var clears = 0
let ratingSubscription = stars.rx.rating.subscribe(onNext: { ratings.append($0) })
let clearedSubscription = stars.rx.cleared.subscribe(onNext: { clears += 1 })

stars.userTapped(star: 4)
let setRating = Observable.just(2).bind(to: stars.rx.rating)    // a value from code
stars.userCleared()
assert(ratings == [0, 4, 0])                                    // the programmatic 2 is not echoed
assert(stars.rating == 0 && clears == 1)
```

The property behaves like `UITextField.rx.text`: it emitted the current rating on subscription, then the user's changes, and not the value bound from code, so binding it in both directions cannot loop. The `take(until: control.rx.deallocated)` makes both streams complete with the control, like RxCocoa's `ControlEvent`s.

This implementation has a limitation worth stating: a callback property holds one closure, so a second subscriber to `stars.rx.rating` would replace the first one's callback. RxCocoa's controls avoid that with target-action, which supports many targets. For a callback-based control, either share the stream (`share(replay: 1)` on `userChanges`) or keep a list of callbacks. That one-slot problem is exactly what delegates have too, and what delegate proxies solve.

## `DelegateProxy`: delegates as observables

A delegate is a single slot. If RxCocoa simply set itself as a table view's delegate, it would replace yours. A **delegate proxy** is an object that becomes the delegate, turns the delegate calls into observables, and forwards every call to a *forward delegate*, the delegate that was there before. It relies on the Objective-C runtime to intercept calls, so the delegate protocol must be `@objc`.

Here is a download manager with an `@objc` delegate protocol and a logger already installed as its delegate:

```swift
@objc protocol DownloaderDelegate: AnyObject {
    @objc optional func downloader(_ downloader: Downloader, didReceive bytes: Int)
    @objc optional func downloaderDidFinish(_ downloader: Downloader)
}

final class Downloader: NSObject {
    weak var delegate: DownloaderDelegate?

    func simulate(chunks: [Int]) {
        for chunk in chunks { delegate?.downloader?(self, didReceive: chunk) }
        delegate?.downloaderDidFinish?(self)
    }
}

final class DownloadLogger: NSObject, DownloaderDelegate {
    var entries: [String] = []
    func downloader(_ downloader: Downloader, didReceive bytes: Int) { entries.append("logger: \(bytes) bytes") }
    func downloaderDidFinish(_ downloader: Downloader) { entries.append("logger: finished") }
}
```

The proxy is a subclass of `DelegateProxy` that conforms to the delegate protocol and to `DelegateProxyType`, which tells RxCocoa how to create a proxy for a given object. `HasDelegate` on the downloader tells it where the delegate lives:

```swift
extension Downloader: HasDelegate {
    typealias Delegate = DownloaderDelegate
}

final class RxDownloaderDelegateProxy: DelegateProxy<Downloader, DownloaderDelegate>,
                                       DelegateProxyType, DownloaderDelegate {
    init(downloader: Downloader) {
        super.init(parentObject: downloader, delegateProxy: RxDownloaderDelegateProxy.self)
    }

    static func registerKnownImplementations() {
        register { RxDownloaderDelegateProxy(downloader: $0) }
    }
}
```

The observables come from `methodInvoked(_:)`, which emits the arguments of each call to a selector, as an array of `Any`, *after* the forward delegate has handled it. `sentMessage(_:)` is the same, but *before*:

```swift
extension Reactive where Base: Downloader {
    var delegate: DelegateProxy<Downloader, DownloaderDelegate> {
        RxDownloaderDelegateProxy.proxy(for: base)
    }

    var receivedBytes: Observable<Int> {
        delegate.methodInvoked(#selector(DownloaderDelegate.downloader(_:didReceive:)))
            .map { arguments in arguments[1] as! Int }
    }

    var finished: Observable<Void> {
        delegate.methodInvoked(#selector(DownloaderDelegate.downloaderDidFinish(_:))).map { _ in () }
    }

    var bytesBeforeDelegate: Observable<Int> {
        delegate.sentMessage(#selector(DownloaderDelegate.downloader(_:didReceive:)))
            .map { arguments in arguments[1] as! Int }
    }
}
```

With the logger installed first, the proxy takes its place and forwards to it. The log shows the order of every call:

```swift
let downloader = Downloader()
let logger = DownloadLogger()
downloader.delegate = logger                                   // an existing delegate

let rxBag = DisposeBag()
downloader.rx.bytesBeforeDelegate
    .subscribe(onNext: { logger.entries.append("sentMessage: \($0) bytes") }).disposed(by: rxBag)
downloader.rx.receivedBytes
    .subscribe(onNext: { logger.entries.append("methodInvoked: \($0) bytes") }).disposed(by: rxBag)
downloader.rx.finished
    .subscribe(onNext: { logger.entries.append("methodInvoked: finished") }).disposed(by: rxBag)

downloader.simulate(chunks: [512, 1_024])

assert(downloader.delegate is RxDownloaderDelegateProxy)       // the proxy took the slot
assert(logger.entries == [
    "sentMessage: 512 bytes", "logger: 512 bytes", "methodInvoked: 512 bytes",
    "sentMessage: 1024 bytes", "logger: 1024 bytes", "methodInvoked: 1024 bytes",
    "logger: finished", "methodInvoked: finished",
])
```

The logger kept receiving every call, with `sentMessage` observers before it and `methodInvoked` observers after it. That is how `tableView.rx.itemSelected` coexists with a delegate set earlier.

Two limits come with the mechanism. Delegate methods that *return* a value, such as `tableView(_:heightForRowAt:)`, cannot be observed with `methodInvoked`, because an observable cannot supply the return value; the proxy has to implement them, typically by holding a closure or a relay with the answer. And setting the object's delegate directly *after* the proxy is installed replaces the proxy. Measured with a second logger assigned to `downloader.delegate` after the subscriptions above, the new logger received every call and the three observables received nothing, with no warning, even when a new subscription was made afterwards. Set delegates before subscribing, or hand them to the proxy as its forward delegate with `RxDownloaderDelegateProxy.installForwardDelegate(_:retainDelegate:onProxyForObject:)`, which is what RxCocoa's `tableView.rx.setDelegate(_:)` does for table views.

## Custom operators

An operator is a method on `ObservableType` that returns a new observable. Most are best written by composing existing operators:

```swift
extension ObservableType {
    /// Discards the elements, keeping only the fact that something happened.
    func mapToVoid() -> Observable<Void> { map { _ in () } }

    /// Drops nil elements and unwraps the rest.
    func unwrap<Wrapped>() -> Observable<Wrapped> where Element == Wrapped? {
        compactMap { $0 }
    }
}

assert(record(Observable.of(1, 2).mapToVoid()).count == 3)
assert(record(Observable<Int?>.of(1, nil, 3).unwrap()) == ["1", "3", "|"])
```

### Operators with state

An operator that needs state, such as emitting each element paired with the previous one, has to keep that state *per subscription*. The obvious version declares a variable in the method and captures it in a closure, which looks per-call and is per-observable instead:

```swift
extension ObservableType {
    /// Wrong: the state is shared by every subscriber of the returned observable.
    func pairwiseShared() -> Observable<(Element, Element)> {
        var previous: Element?
        return compactMap { element in
            defer { previous = element }
            return previous.map { ($0, element) }
        }
    }
}

let readings = PublishSubject<Int>()
let sharedPairs = readings.pairwiseShared().map { "\($0.0)->\($0.1)" }
var first: [String] = []
var second: [String] = []
let firstPairs = sharedPairs.subscribe(onNext: { first.append($0) })
let secondPairs = sharedPairs.subscribe(onNext: { second.append($0) })
readings.onNext(1)
readings.onNext(2)

assert(first == ["1->2"])
assert(second == ["1->1", "2->2"])                              // each element paired with itself
```

The first subscriber's pairs happen to be right. The second subscriber's are nonsense: the closure runs once per subscriber per element, both subscribers share one `previous`, and by the time the second subscriber handles an element, the first has just stored that same element as "previous". With subscribers added in a different order, or a third one, a different subscriber would be the one with wrong data. The fix is to create the state inside `Observable.deferred` (or `create`), whose closure runs once per subscription:

```swift
extension ObservableType {
    /// Emits each element paired with the one before it, with state per subscription.
    func pairwise() -> Observable<(Element, Element)> {
        Observable.deferred {
            var previous: Element?
            return self.compactMap { element in
                defer { previous = element }
                return previous.map { ($0, element) }
            }
        }
    }
}

let correctPairs = readings.pairwise().map { "\($0.0)->\($0.1)" }
var third: [String] = []
var fourth: [String] = []
let thirdPairs = correctPairs.subscribe(onNext: { third.append($0) })
let fourthPairs = correctPairs.subscribe(onNext: { fourth.append($0) })
readings.onNext(3)
readings.onNext(4)

assert(third == ["3->4"] && fourth == ["3->4"])
```

The same rule applies to every stateful operator: counters, caches, "has emitted" flags, retry budgets. RxSwift's built-in operators all create their state in the sink they build per subscription, which is the property `deferred` gives a composed one.

### Operators from scratch

When composition is not enough, `Observable.create` builds an operator from first principles. It must follow the same contract as any `create` from [Creating Observables](/rxswift-creating-observables/#create-wrapping-anything): forward the grammar, never call the observer concurrently, and return a disposable that disposes the upstream subscription. Here is `takeWhileChanging`, which completes as soon as an element repeats:

```swift
extension ObservableType where Element: Equatable {
    func takeWhileChanging() -> Observable<Element> {
        Observable.create { observer in
            var previous: Element?
            return self.subscribe { event in
                switch event {
                case .next(let element):
                    if element == previous {
                        observer.onCompleted()
                    } else {
                        previous = element
                        observer.onNext(element)
                    }
                case .error(let error): observer.onError(error)
                case .completed: observer.onCompleted()
                }
            }
        }
    }
}

assert(record(Observable.of(1, 2, 3, 3, 4).takeWhileChanging()) == ["1", "2", "3", "|"])
```

The upstream subscription is the disposable returned from `create`, so disposing the output disposes the source. After `onCompleted`, the grammar-enforcing observer that `create` provides ignores the remaining source elements, and RxSwift disposes the upstream subscription for us.

Name custom operators carefully. The community library RxSwiftExt already defines `unwrap`, `pairwise`, `mapTo`, `retry(_:scheduler:)` with delays, and many others, and a project that later adds it gets ambiguous calls. Either depend on it, or prefix your own.

## Extensions in RxSwift and Combine

| RxSwift / RxCocoa | Combine |
| --- | --- |
| `extension Reactive where Base: T` | no namespace; extend the type directly |
| `Binder` | `assign(to:on:)` with a key path |
| `ControlProperty`, `ControlEvent` | no equivalent; hand-written `Publisher`s |
| `DelegateProxy` | no equivalent; a delegate object that sends into a subject |
| custom operator on `ObservableType` | custom operator on `Publisher`, often a full `Publisher` type |

Combine's custom operators have to respect demand, which makes writing them from scratch noticeably harder: an operator is a `Publisher` plus a `Subscription` type. RxSwift's `create` with a nested `subscribe` is shorter because there is no demand to forward.

```swift
withExtendedLifetime((gaugeBinding, levelBinding, bannerBinding, ratingSubscription, clearedSubscription, setRating,
                      firstPairs, secondPairs, thirdPairs, fourthPairs)) {}
```

## Summary

- `Reactive<Base>` and `ReactiveCompatible` give any type an `rx` namespace; `NSObject` subclasses have it already. Expose state through it without making the state public.
- A `Binder` writes to an object weakly and on the main thread; elements after the object is gone are dropped. Every writable property of a class already has one, synthesized through `@dynamicMemberLookup`.
- A custom `ControlProperty` emits the current value, then user changes, and accepts values from code without echoing them; `take(until: control.rx.deallocated)` completes it with the control.
- A `DelegateProxy` takes the delegate slot and forwards to the existing delegate: measured, `sentMessage` observers ran before the original delegate and `methodInvoked` observers after it.
- Stateful operators must create their state per subscription: with a captured variable, the second subscriber paired every element with itself; `deferred` fixed it.
- `Observable.create` with a nested `subscribe` builds an operator from scratch; mind name collisions with RxSwiftExt.

## Exercise

Write a `DelegateProxy` for a `TemperatureSensor` class whose `@objc` delegate protocol has `sensor(_:didMeasure:)` and a method with a return value, `sensorShouldContinue(_:) -> Bool`. Expose `rx.measurements` with `methodInvoked`, and make `rx.shouldContinue` a `Binder<Bool>` that sets the answer the proxy returns. Test that an existing delegate still receives measurements, that the binder controls whether the sensor keeps measuring, and that the `Binder` drops values after the sensor is deallocated.

## Further reading

- The [`Reactive.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxSwift/Reactive.swift) source, which defines the namespace in about 80 lines.
- [`DelegateProxy.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxCocoa/Common/DelegateProxy.swift) and [`DelegateProxyType.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxCocoa/Common/DelegateProxyType.swift) in RxCocoa, whose comments explain forwarding and proxy registration.
- [RxSwiftExt](https://github.com/RxSwiftCommunity/RxSwiftExt), the community collection of extra operators.

Previous: [MVVM with RxSwift](/rxswift-mvvm/). Next: [Testing with RxTest and RxBlocking](/rxswift-testing-rxtest-rxblocking/).

Return to the [RxSwift roadmap](/rxswift/).
