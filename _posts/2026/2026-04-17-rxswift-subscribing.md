---
layout: post
hidden: true
title: "Subscribing"
date: "2026-04-17"
last_modified_at: "2026-04-17"
permalink: /rxswift-subscribing/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
---
An observable is a description of work, and `subscribe` is the call that starts it. It is also where most RxSwift bugs are written. A missing `onError` hides failures, a strong `self` in a closure keeps a screen alive forever, a subscription made inside another subscription's closure multiplies every time the outer one fires, and a closure that runs on the wrong thread crashes in Swift 6.

This article covers every way of subscribing that RxSwift and RxCocoa offer: the four-closure `subscribe`, the event form, `subscribe(with:)`, subscribing an observer or a subject, and RxCocoa's `bind`. For each it measures what happens at the edges: the exact order of callbacks, where an unhandled error goes, what `subscribe(with:)` does when its object is deallocated, and what one debugging hook costs per subscription.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift` and `RxCocoa`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/). RxSwift is imported with `@preconcurrency`, for a reason explained [below](#unhandled-errors).

<!-- check-uses: rx-record -->
```swift
@preconcurrency import RxSwift
import RxCocoa
import Foundation
import Synchronization
```

## The four closures

The `subscribe` you will write most often takes four optional closures, one for each kind of event plus one for the end of the subscription:

```swift
var lifecycle: [String] = []
let lifecycleSubscription = Observable.of("a", "b").subscribe(
    onNext: { lifecycle.append("next \($0)") },
    onError: { lifecycle.append("error \($0)") },
    onCompleted: { lifecycle.append("completed") },
    onDisposed: { lifecycle.append("disposed") }
)
assert(lifecycle == ["next a", "next b", "completed", "disposed"])
```

`onDisposed` is the odd one out. It is not an event from the observable; it runs when the subscription ends, *however* it ends. The three ways are completion, which you just saw, an error, and an explicit `dispose()`:

```swift
var failing: [String] = []
let failingSubscription = Observable.concat(.just("a"), .error(DemoError.boom)).subscribe(
    onNext: { failing.append("next \($0)") },
    onError: { failing.append("error \($0)") },
    onCompleted: { failing.append("completed") },
    onDisposed: { failing.append("disposed") }
)
assert(failing == ["next a", "error boom", "disposed"])

let liveSource = PublishSubject<String>()
var abandoned: [String] = []
let abandonedSubscription = liveSource.subscribe(
    onNext: { abandoned.append("next \($0)") },
    onCompleted: { abandoned.append("completed") },
    onDisposed: { abandoned.append("disposed") }
)
liveSource.onNext("a")
abandonedSubscription.dispose()
liveSource.onNext("b")                                  // nobody is listening any more
assert(abandoned == ["next a", "disposed"])
```

That makes `onDisposed` the `finally` of a subscription: the right place to hide a spinner or end a background task, because it runs on success, failure, and cancellation alike, and only once.

### Where `do` fits in

The `do` operator adds side effects at a point in a chain without subscribing. It has more hooks than `subscribe`: one before and one after each event is passed on, plus hooks for subscription and disposal. Wrapping the subscriber above with every hook gives the full order:

```swift
var order: [String] = []
let orderSubscription = Observable.of(1, 2)
    .do(
        onNext: { order.append("do onNext \($0)") },
        afterNext: { order.append("do afterNext \($0)") },
        onCompleted: { order.append("do onCompleted") },
        afterCompleted: { order.append("do afterCompleted") },
        onSubscribe: { order.append("do onSubscribe") },
        onSubscribed: { order.append("do onSubscribed") },
        onDispose: { order.append("do onDispose") }
    )
    .subscribe(
        onNext: { order.append("subscriber next \($0)") },
        onCompleted: { order.append("subscriber completed") },
        onDisposed: { order.append("subscriber disposed") }
    )

assert(order == [
    "do onSubscribe", "do onSubscribed",
    "do onNext 1", "subscriber next 1", "do afterNext 1",
    "do onNext 2", "subscriber next 2", "do afterNext 2",
    "do onCompleted", "subscriber completed", "subscriber disposed",
    "do afterCompleted", "do onDispose",
])
```

Two details in that order are worth remembering. `onSubscribed` ran *before* any element, because `of` delivers its elements from a scheduled step that runs after the subscription is set up, not during it. And the subscriber's `onDisposed` ran before `do`'s `afterCompleted` and `onDispose`: the subscriber at the bottom of the chain finishes first, and the operators above it unwind afterwards. A `do(onDispose:)` that hides a spinner therefore runs after the subscriber has already seen the completion.

## The event form

`subscribe(_:)` with a single closure receives the `Event` itself. It is the most direct form, and useful when the three cases share code:

```swift
var described: [String] = []
let eventSubscription = Observable.of(1, 2).subscribe { event in
    switch event {
    case .next(let value): described.append("value \(value)")
    case .error(let error): described.append("failed with \(error)")
    case .completed: described.append("finished")
    }
}
assert(described == ["value 1", "value 2", "finished"])
```

It is also the form the `record` helper uses. Unlike the four-closure version, the event form has no `onDisposed`, and it does not consult the unhandled-error hook described next, because receiving `.error` in your own `switch` counts as handling it.

## Unhandled errors

An error ends a subscription, and the closures that would have handled later elements never run again. Errors do not only come from sources. Any operator closure that can throw, like `map`, turns a thrown error into an error event:

```swift
let parsed = Observable.of("1", "2", "x", "4").map { text -> Int in
    guard let number = Int(text) else { throw DemoError.boom }
    return number
}
assert(record(parsed) == ["1", "2", "x(boom)"])          // "4" is never parsed
```

If the subscriber passed no `onError`, RxSwift calls `Hooks.defaultErrorHandler`. In a debug build of RxSwift, the default handler prints `Unhandled error happened:` and the error to standard output. In a release build it does nothing at all, and the error vanishes.

Because the default is easy to miss, it is worth replacing at launch with a handler that cannot be missed: an `assertionFailure` in debug builds and a report to your crash or analytics service in release builds. The handler is a plain closure that RxSwift calls on whatever thread the error arrived on, so it should be written outside main-actor code, where Swift 6 would otherwise add a main-thread check to it:

```swift
final class ErrorLog: Sendable {
    private let entries = Mutex<[String]>([])
    func append(_ entry: String) { entries.withLock { $0.append(entry) } }
    var all: [String] { entries.withLock { $0 } }
}

nonisolated func installUnhandledErrorHandler(into log: ErrorLog) {
    Hooks.defaultErrorHandler = { _, error in
        log.append("\(error)")                         // and assertionFailure() in debug builds
    }
}

let unhandledErrors = ErrorLog()
installUnhandledErrorHandler(into: unhandledErrors)

let careless = parsed.subscribe(onNext: { _ in })        // no onError
assert(unhandledErrors.all == ["boom"])
```

The first argument of the handler, ignored above, is the call stack of the `subscribe` call that left the error unhandled, which is the line you would want to fix. RxSwift only records it when `Hooks.recordCallStackOnError` is `true`, and the reason it is off by default is cost. Recording means capturing `Thread.callStackSymbols` on *every* subscription, not just the failing ones:

```swift
nonisolated func secondsToSubscribe(times: Int) -> Double {
    let start = ContinuousClock.now
    for _ in 0..<times {
        _ = Observable.just(1).subscribe(onNext: { _ in })
    }
    let elapsed = ContinuousClock.now - start
    return Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18
}

Hooks.recordCallStackOnError = true
let withStacks = secondsToSubscribe(times: 2_000)
Hooks.recordCallStackOnError = false
let withoutStacks = secondsToSubscribe(times: 2_000)
print("2,000 subscriptions:", withStacks, "s with call stacks,", withoutStacks, "s without")
assert(withStacks > 10 * withoutStacks)
```

On the machine used for this article, a debug build took 0.53 seconds for 2,000 subscriptions with call stacks and 0.0044 seconds without: about 270 microseconds against 2 per subscription, a factor of about 120. That is fine while you hunt for one bug, and far too much to leave on in an app that subscribes in every table view cell.

`Hooks.recordCallStackOnError` is also why this article imports RxSwift with `@preconcurrency`. It is a mutable `static var`, and with a plain import, Swift 6 refuses to touch it:

```text
error: reference to static property 'recordCallStackOnError' is not concurrency-safe because it involves shared mutable state
```

`Hooks.defaultErrorHandler` does not have the problem, because RxSwift implements it as a computed property guarded by a lock. Set both once, at launch, before any other thread uses RxSwift.

## `subscribe(with:)`: a weak object, not a weak subscription

Closures passed to `subscribe` usually need `self`, and capturing it strongly in an object that also owns the subscription is the classic RxSwift retain cycle, measured in [Disposing and `DisposeBag`](/rxswift-disposebag/). RxSwift 6 added `subscribe(with:onNext:onError:onCompleted:onDisposed:)`, which holds the object weakly and passes it to each closure as a parameter, so there is no `[weak self]` and no optional to unwrap:

```swift
final class ProfileHeader {
    private(set) var title = ""
    func show(_ name: String) { title = name }
}

let names = PublishSubject<String>()
var namesSent = 0
var headerDisposedCalls = 0
var appWideBag = DisposeBag()                             // lives longer than the header

var header: ProfileHeader? = ProfileHeader()
weak var weakHeader = header

names
    .do(onNext: { _ in namesSent += 1 })
    .subscribe(with: header!,
               onNext: { header, name in header.show(name) },
               onDisposed: { _ in headerDisposedCalls += 1 })
    .disposed(by: appWideBag)

names.onNext("Ada")
assert(header?.title == "Ada")
```

The header is not retained by the subscription, so releasing the last strong reference deallocates it:

```swift
header = nil
assert(weakHeader == nil)
```

What `subscribe(with:)` does *not* do is end the subscription. It checks the weak reference on each event and skips the closure if the object is gone, but the subscription, and everything upstream of it, keeps running:

```swift
names.onNext("Grace")
names.onNext("Hopper")
assert(namesSent == 3)                                   // the chain still runs for a dead header

appWideBag = DisposeBag()                                // finally dispose the subscription
assert(headerDisposedCalls == 0)                         // onDisposed was skipped: no object to pass
```

With a cheap `PublishSubject` that costs little. With a chain that polls a server every 30 seconds, it means a deallocated screen keeps polling until whatever owns the disposable goes away. The fix is to put the disposable in a bag the object owns, so both end together, which is what the [`DisposeBag` article](/rxswift-disposebag/) recommends for almost every subscription. The `onDisposed` result is the other surprise: a cleanup in `onDisposed` that needs the object never runs if the object is already gone.

## Do not subscribe inside `subscribe`

When each element of one sequence should start another, the tempting code subscribes to the second sequence inside the first one's `onNext`. Here the second sequence stands in for a live database query, which keeps emitting until disposed, and a counter tracks how many queries are running:

```swift
var runningQueries = 0
@MainActor func liveDetails(for id: Int) -> Observable<String> {
    Observable.create { observer in
        runningQueries += 1
        observer.onNext("details for \(id)")
        return Disposables.create { runningQueries -= 1 }
    }
}

let selectedIDs = PublishSubject<Int>()
let screenBag = DisposeBag()
var shownDetails: [String] = []

selectedIDs.subscribe(onNext: { id in
    liveDetails(for: id)
        .subscribe(onNext: { shownDetails.append($0) })
        .disposed(by: screenBag)
}).disposed(by: screenBag)

selectedIDs.onNext(1)
selectedIDs.onNext(2)
selectedIDs.onNext(3)
assert(runningQueries == 3)                              // every old query is still running
```

Every selection left its query running, and if those queries emitted updates, the screen would show details for items the user selected long ago. The inner subscriptions are also invisible to the outer one: disposing the outer subscription stops new queries, not old ones. The operator for this job is `flatMapLatest`, which subscribes to the inner observable for each element and disposes the previous inner subscription when the next element arrives:

```swift
runningQueries = 0
let selections = PublishSubject<Int>()
let latestDetails = selections
    .flatMapLatest { id in liveDetails(for: id) }
    .subscribe(onNext: { shownDetails.append($0) })

selections.onNext(1)
selections.onNext(2)
selections.onNext(3)
assert(runningQueries == 1)                              // only the query for 3 is running
latestDetails.dispose()
assert(runningQueries == 0)                              // and disposing the chain stops it
```

A single subscription now owns the whole operation. [Transforming Operators](/rxswift-transforming-operators/) compares `flatMapLatest` with `flatMap` and `concatMap`, which make different choices about the old inner subscription.

## The `Disposable` you get back

`subscribe` returns a `Disposable`, and ignoring it is a compiler warning:

```text
warning: result of call to 'subscribe(onNext:onError:onCompleted:onDisposed:)' is unused
```

Writing `_ =` silences the warning but does not change what happens. For an observable that finishes on its own, like the `just` in the timing loop above, nothing leaks: the subscription disposes itself after the terminal event. For one that never finishes, a subject, a timer, or a UI event, the subscription now runs until the process ends, and there is no handle left to stop it. The next article, [Disposing and `DisposeBag`](/rxswift-disposebag/), is about giving every subscription an owner.

## Which thread the closures run on

Subscribing does not choose a thread. The closures run on whatever thread the event is sent on: the subscribing thread for a synchronous source like `of`, the main thread for a UI event, and a background thread for a wrapped callback or `AsyncSequence.asObservable()`, as [Creating Observables](/rxswift-creating-observables/#which-thread-the-events-arrive-on) measured. In Swift 6 that matters more than it used to. Closures written in main-actor code are isolated to the main actor and crash if RxSwift calls them on another thread, so a chain that might deliver on a background thread needs `observe(on: MainScheduler.instance)` before the `subscribe`. [Schedulers](/rxswift-schedulers/) covers it in depth.

## Subscribing an observer, or a subject

`subscribe` also accepts any `ObserverType`, including a subject. That forwards every event from the source into the subject, and "every event" includes the terminal one:

```swift
let selection = PublishSubject<Int>()
var selected: [String] = []
let selectionWatcher = selection.subscribe(
    onNext: { selected.append("\($0)") },
    onCompleted: { selected.append("|") }
)

let firstBinding = Observable.of(1, 2).subscribe(selection)   // forwards the completion too
selection.onNext(3)                                            // ignored: the subject has completed
assert(selected == ["1", "2", "|"])
```

A finite source subscribed to a shared subject ends the subject for everyone. That is the main reason RxRelay exists: a relay accepts only elements, so binding a finite source to it cannot complete it. [Relays](/rxswift-relays/) measures the difference.

## `bind`: subscribing when failure is a bug

RxCocoa adds `bind(to:)` and `bind(onNext:)`. They look like `subscribe` with fewer options, and they mean something stronger: *this chain cannot fail*. They are meant for UI bindings, where there is no sensible way to show an error after the fact:

```swift
var labelText = ""
let titleBinding = Observable.of("Inbox", "Inbox (1)").bind(onNext: { labelText = $0 })
assert(labelText == "Inbox (1)")
```

When an error does arrive, `bind` treats it as a programmer error. A debug build of RxCocoa stops the process with `fatalError("Binding error: ...")`, and a release build prints the message and carries on:

<!-- skip-check -->
```swift
// Crashes in a debug build: bind treats an error as a programmer error
let parsedBinding = parsed.bind(onNext: { print($0) })
```

That is the intended design. A chain bound to the UI should handle its errors before the `bind`, typically with `catchAndReturn` or by converting it to a `Driver`, which cannot error at all. [Error Handling](/rxswift-error-handling/) and [Driver and Signal](/rxswift-driver-signal/) show how.

## Compared with Combine

| RxSwift | Combine | Difference |
| --- | --- | --- |
| `subscribe(onNext:onError:onCompleted:onDisposed:)` | `sink(receiveCompletion:receiveValue:)` | Combine has no `onDisposed`; use `handleEvents(receiveCancel:)` |
| missing `onError` | `sink(receiveValue:)` only when `Failure == Never` | Combine checks at compile time; RxSwift calls a runtime hook |
| `subscribe(with:)` | `sink { [weak self] in ... }` | |
| `bind(to:)` | `assign(to:on:)`, `assign(to:)` | both require a source that cannot fail; Combine enforces it in types |
| `do(onNext:...)` | `handleEvents(receiveOutput:...)` | |

The second row is the deepest difference. Combine will not let you call `sink(receiveValue:)` on a publisher that can fail, so the unhandled error measured above is a compile error there. RxSwift's untyped errors push the same check to runtime, which is why its default handler is worth replacing. [`sink` and `assign`](/combine-sink-assign/) covers the Combine side.

```swift
withExtendedLifetime((lifecycleSubscription, failingSubscription, orderSubscription,
                      eventSubscription, careless, selectionWatcher, firstBinding,
                      titleBinding)) {}
```

## Summary

- `subscribe` takes optional `onNext`, `onError`, `onCompleted`, and `onDisposed` closures. `onDisposed` runs once however the subscription ends, which makes it the place for cleanup.
- Measured order with `do`: `onSubscribe`, `onSubscribed`, then for each element `onNext`, the subscriber, `afterNext`; at the end `onCompleted`, the subscriber's completion and `onDisposed`, then `afterCompleted` and `onDispose`.
- A throwing operator closure turns into an error event. A subscriber without `onError` sends the error to `Hooks.defaultErrorHandler`, which prints in debug and does nothing in release; replace it at launch.
- `Hooks.recordCallStackOnError` made each subscription about 120 times slower in a debug build, and in Swift 6 it is only reachable with `@preconcurrency import RxSwift`.
- `subscribe(with:)` holds its object weakly but keeps the subscription running after the object is gone, and skips `onDisposed`.
- Subscribing inside `onNext` leaks inner subscriptions; `flatMapLatest` replaces it with one owned chain.
- Subscribing a subject forwards completion and ends the subject. `bind` crashes debug builds on error by design.

## Exercise

Write a `subscribeLogged` extension on `ObservableType` that behaves like `subscribe(onNext:onError:onCompleted:onDisposed:)` but records, in a `Sendable` log, the file and line it was called from (use `#fileID` and `#line` default arguments) and passes them to your error handler when the subscriber did not provide `onError`. Measure its cost per subscription against plain `subscribe` and against `Hooks.recordCallStackOnError = true`, and explain why capturing two literals is cheaper than capturing a call stack.

## Further reading

- [Getting Started: Disposing and error handling](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/GettingStarted.md#disposing) in the RxSwift documentation.
- [Subscribe](https://reactivex.io/documentation/operators/subscribe.html) and [Do](https://reactivex.io/documentation/operators/do.html) on ReactiveX.io.
- The [`ObservableType+Extensions.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxSwift/ObservableType%2BExtensions.swift) source file, which shows how `subscribe(with:)` and the error hooks are implemented.
- [`sink` and `assign`](/combine-sink-assign/), for the Combine counterparts.

Previous: [Creating Observables: `just`, `of`, `from`, and `create`](/rxswift-creating-observables/). Next: [Disposing and `DisposeBag`](/rxswift-disposebag/).

Return to the [RxSwift roadmap](/rxswift/).
