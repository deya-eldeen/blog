---
layout: post
hidden: true
title: "Relays: PublishRelay and BehaviorRelay"
date: "2026-05-01"
last_modified_at: "2026-05-01"
permalink: /rxswift-relays/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
---
Subjects have a flaw for UI work: they can end. One `onCompleted()` from anywhere, or one error that reaches a subject through `subscribe(subject)`, and every screen bound to it stops updating, permanently, with no crash and no log. For a stream of button taps or the text of a label, ending is never correct. The stream should live exactly as long as the object that owns it.

**Relays** are subjects with the ending removed. `PublishRelay`, `BehaviorRelay`, and `ReplayRelay` wrap the corresponding subjects and expose only `accept(_:)`, which sends an element. There is no way to send a completion or an error, so a relay cannot be ended by accident. They live in the RxRelay library, and they are what most RxSwift view models use for their state and events. This article measures what relays guarantee, what they do when a binding tries to end them, and the one bug they make easier to write: a read-modify-write on `BehaviorRelay.value` that, measured from eight threads, kept barely more than one in five of its updates.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift`, `RxRelay`, and `RxCocoa`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/). RxRelay is a separate module, so it needs its own `@preconcurrency` import alongside RxSwift's for the threading section; with only RxSwift's import marked, Swift 6 still warns when a `BehaviorRelay` is captured in a `@Sendable` closure.

<!-- check-uses: rx-record -->
```swift
@preconcurrency import RxSwift
@preconcurrency import RxRelay
import RxCocoa
import Foundation
```

## Three relays, one method

Each relay behaves like its subject for subscribers, and replaces `onNext` with `accept`:

```swift
let refreshRequests = PublishRelay<Void>()                // events: like PublishSubject
let username = BehaviorRelay(value: "guest")              // state: like BehaviorSubject
let recentSearches = ReplayRelay<String>.create(bufferSize: 3)  // history: like ReplaySubject

var refreshes = 0
let refreshSubscription = refreshRequests.subscribe(onNext: { refreshes += 1 })
refreshRequests.accept(())
assert(refreshes == 1)

username.accept("ada")
assert(username.value == "ada")                          // a plain property, not a throwing method
assert(record(username) == ["ada"])

for query in ["swift", "rx", "combine", "actors"] { recentSearches.accept(query) }
assert(record(recentSearches) == ["rx", "combine", "actors"])
```

There is no `onCompleted`, `onError`, or `dispose` to call, and the records above show no `|` at the end: a relay never sends a terminal event. Two consequences follow directly.

`BehaviorRelay.value` is a non-throwing property. A `BehaviorSubject`'s `value()` throws because the subject might have failed or been disposed, as [`BehaviorSubject`](/rxswift-behaviorsubject/#value-throws) measured; a relay can be in neither state, so its value is always available.

And a relay's observable can be handed out without the risk described in [`PublishSubject`](/rxswift-publishsubject/#keep-it-private). Even if a caller held the relay itself, the worst it could do is send an element. The usual pattern still keeps the relay private and exposes `asObservable()`, or a `Driver`, so that only the owner sends.

## Binding cannot end a relay

`bind(to:)` with a relay forwards elements and drops the completion. A finite source bound to a relay ends its *binding*, not the relay:

```swift
let status = PublishRelay<String>()
var statusUpdates: [String] = []
let statusSubscription = status.subscribe(
    onNext: { statusUpdates.append($0) },
    onCompleted: { statusUpdates.append("|") }
)

let finiteBinding = Observable.of("connecting", "connected").bind(to: status)
status.accept("syncing")                                  // the relay still works
assert(statusUpdates == ["connecting", "connected", "syncing"])
```

Compare [Subscribing](/rxswift-subscribing/#subscribing-an-observer-or-a-subject), where the same two elements subscribed directly into a `PublishSubject` completed it, and the third element was ignored.

Errors are a different matter. A relay has nowhere to put an error, so `bind(to:)` treats one as a programmer error, the same way RxCocoa's `bind(onNext:)` does. In a debug build of RxRelay the process stops; in a release build the error is printed and the binding ends, leaving the relay unchanged:

<!-- skip-check -->
```swift
// Crashes in a debug build: RxRelay calls fatalError("Binding error to publish relay: boom")
let failingBinding = Observable<String>.error(DemoError.boom).bind(to: status)
```

That is deliberate, and it shapes how relays are used. Anything bound to a relay must handle its errors first, by converting them into elements or into nothing:

```swift
let loadResult = Observable<String>.error(DemoError.timeout)
let safeBinding = loadResult
    .catch { error in .just("failed: \(error)") }          // errors become state
    .bind(to: status)
assert(statusUpdates.last == "failed: timeout")
```

The relay's own subscribers are never told that something failed upstream; they only see the element the error was converted into. That is the model relays push you toward, and it is the right one for UI: a screen does not have a "failed" lifecycle, it has a state in which it shows an error message. [Error Handling](/rxswift-error-handling/) covers `catch` and its relatives.

## The read-modify-write trap

`BehaviorRelay.value` makes one pattern very easy to write: read the current value, compute a new one, accept it. For a list that is

```swift
let cart = BehaviorRelay<[String]>(value: [])
cart.accept(cart.value + ["apple"])
cart.accept(cart.value + ["pear"])
assert(cart.value == ["apple", "pear"])
```

Each `value` read and each `accept` is individually thread-safe; the relay protects them with a lock. The *pair* is not atomic. Between one thread reading the value and the same thread accepting the new array, another thread can accept its own update, which the first thread's `accept` then overwrites. Measured from eight threads, each adding 1,000 items:

```swift
nonisolated func addFromEightThreads() -> Int {
    let items = BehaviorRelay<[Int]>(value: [])
    DispatchQueue.concurrentPerform(iterations: 8) { thread in
        for index in 0..<1_000 {
            items.accept(items.value + [thread * 1_000 + index])    // read, then write
        }
    }
    return items.value.count
}

let surviving = addFromEightThreads()
print("items kept out of 8,000:", surviving)
assert(surviving < 8_000)
```

Across six runs, the relay ended with between 1,552 and 1,764 of the 8,000 items. About four in five updates were silently lost, with no crash and no data race: a Thread Sanitizer build of the same test reported nothing (and kept 1,414 items that time), because every individual access was properly locked. The debug build also printed "Synchronization anomaly" warnings, because the concurrent `accept` calls delivered overlapping events to the relay's subscribers.

On the main thread alone the pattern is safe, which is why it survives code review: most view model code runs on the main thread. It breaks when one of the writes moves to a callback on a background queue.

### A single writer

The fix is to have one place where the state changes, and to send it *intentions* instead of new values. Each intention is an element on a `PublishRelay`; `observe(on:)` with a serial scheduler delivers them one at a time; `scan` folds them into the state; and the result is bound to the `BehaviorRelay` that the rest of the app reads:

```swift
enum CartAction {
    case add(Int)
    case removeAll
}

/// Every stored property is a `let` holding a type that RxSwift synchronizes internally.
final class CartStore: @unchecked Sendable {
    let actions = PublishRelay<CartAction>()
    let items = BehaviorRelay<[Int]>(value: [])
    private let bag = DisposeBag()

    init() {
        actions
            .observe(on: SerialDispatchQueueScheduler(qos: .userInitiated))  // one at a time
            .scan(into: [Int]()) { items, action in
                switch action {
                case .add(let item): items.append(item)
                case .removeAll: items.removeAll()
                }
            }
            .bind(to: items)
            .disposed(by: bag)
    }
}

nonisolated func addThroughStore() -> Int {
    let store = CartStore()
    DispatchQueue.concurrentPerform(iterations: 8) { thread in
        for index in 0..<1_000 { store.actions.accept(.add(thread * 1_000 + index)) }
    }
    while store.items.value.count < 8_000 { usleep(1_000) }  // let the serial queue drain
    return store.items.value.count
}

assert(addThroughStore() == 8_000)
```

All 8,000 items arrived. `scan` is the only code that ever computes a new cart, and the serial scheduler guarantees it never runs twice at once, so there is nothing to race. It is the same structure as a reducer in The Composable Architecture or Redux, built from four RxSwift pieces. [Transforming Operators](/rxswift-transforming-operators/) covers `scan`, and [Schedulers](/rxswift-schedulers/) covers serial schedulers.

## Relays are not magic

Because relays wrap subjects, they inherit every behavior the subject articles measured except termination:

- A `BehaviorRelay` emits every `accept`, including repeated values; add `distinctUntilChanged()` where duplicates are noise.
- Concurrent `accept` calls deliver overlapping events to subscribers, exactly like concurrent `onNext` calls on a subject.
- A subscriber that accepts into the relay it is observing creates the re-entrant, depth-first delivery described in [`BehaviorSubject`](/rxswift-behaviorsubject/#feedback-loops-and-stale-subscribers), with the same stale-value result.
- Subscribers beyond the 31st are called in an order that changes between launches.

What relays add is the guarantee that the stream never ends, which removes a class of silent failures, and in exchange they force every error to be dealt with before it reaches them.

## `Variable`, for older code

Codebases written before RxSwift 5 use `Variable`, which was RxSwift's original relay-like type: a `BehaviorSubject` with a non-throwing `value` property that completed when deallocated. It was deprecated in RxSwift 4.x, moved out in favor of `BehaviorRelay`, and removed from RxSwift 6. Migrating is mechanical: `Variable(x)` becomes `BehaviorRelay(value: x)`, `variable.value = y` becomes `relay.accept(y)`, and `variable.asObservable()` stays the same. The one behavioral difference is that `Variable` sent `completed` to its subscribers when it was deallocated, and a `BehaviorRelay` sends nothing, so subscriptions that relied on that completion to clean up need a `DisposeBag` instead.

## Relays in a view model

A typical RxSwift view model uses each relay for what it is good at: a `PublishRelay` for one-off events coming in from the view, a `BehaviorRelay` for state, and a `Driver` going out, so that the view binds to something that cannot fail and always delivers on the main thread:

```swift
@MainActor final class CounterViewModel {
    // Input: events from the view.
    let incrementTapped = PublishRelay<Void>()
    let resetTapped = PublishRelay<Void>()

    // Output: state for the view.
    var title: Driver<String> { count.asDriver().map { "Tapped \($0) times" } }

    private let count = BehaviorRelay(value: 0)
    private let bag = DisposeBag()

    init() {
        incrementTapped
            .withLatestFrom(count)
            .map { $0 + 1 }
            .bind(to: count)
            .disposed(by: bag)
        resetTapped
            .map { 0 }
            .bind(to: count)
            .disposed(by: bag)
    }
}

let viewModel = CounterViewModel()
var titles: [String] = []
let titleSubscription = viewModel.title.drive(onNext: { titles.append($0) })
viewModel.incrementTapped.accept(())
viewModel.incrementTapped.accept(())
viewModel.resetTapped.accept(())
assert(titles == ["Tapped 0 times", "Tapped 1 times", "Tapped 2 times", "Tapped 0 times"])
```

`withLatestFrom(count)` reads the current count from the relay inside the chain, rather than reading `count.value` in a closure. It is a read-modify-write too, but every tap arrives on the main thread here, so the main thread is the single writer. [Driver and Signal](/rxswift-driver-signal/) explains `asDriver()` and `drive`, and [MVVM with RxSwift](/rxswift-mvvm/) builds out this structure.

## Relays and Combine

Combine has no relays, because it does not need them for the main reason relays exist: a Combine subject's failure type can be `Never`, which removes errors at compile time. A `PassthroughSubject<Value, Never>` is close to a `PublishRelay`, and a `CurrentValueSubject<Value, Never>` is close to a `BehaviorRelay`. The difference is that a Combine subject with `Never` failure can still be *completed* with `send(completion: .finished)`, which a relay cannot. In Combine, `@Published` is the more common holder of view model state; [`@Published` Properties](/combine-published-properties/) compares the two.

```swift
withExtendedLifetime((refreshSubscription, statusSubscription, finiteBinding, safeBinding,
                      titleSubscription)) {}
```

## Summary

- `PublishRelay`, `BehaviorRelay`, and `ReplayRelay` wrap the matching subjects and expose `accept(_:)`. They never send a terminal event, and `BehaviorRelay.value` cannot throw.
- Binding a finite source to a relay forwards its elements and ignores the completion; the relay keeps working.
- Binding an error to a relay calls `fatalError` in a debug build of RxRelay and prints in release. Convert errors to elements before the `bind`.
- `relay.accept(relay.value + [item])` from eight threads kept 1,552 to 1,764 of 8,000 items. Route changes through one serialized `scan` instead, which kept all 8,000.
- Relays inherit their subjects' other behaviors: no deduplication, overlapping delivery under concurrent `accept`, and re-entrancy.
- `Variable` was removed in RxSwift 6; `BehaviorRelay` replaces it, without the completion on deallocation.

## Exercise

Add a `removeItem(Int)` action to `CartStore`, and a second output, `total: Driver<Int>`, computed from a price table. Then write a test that sends 10,000 random `add` and `removeItem` actions from eight threads and checks that the final cart equals the result of applying the same actions to an array on a single thread, *in the order the store processed them*. You will need to record that order; decide where in the chain to record it so that the test does not itself introduce a race.

## Further reading

- The [RxRelay](https://github.com/ReactiveX/RxSwift/tree/main/RxRelay) source in the RxSwift repository; each relay is a few dozen lines around a subject.
- [Subjects](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/Subjects.md#relays) in the RxSwift documentation, on relays.
- The [RxSwift 5 migration notes](https://github.com/ReactiveX/RxSwift/releases/tag/5.0.0) on `Variable`'s deprecation and the move of relays into their own module.
- [`@Published` Properties](/combine-published-properties/) for Combine's closest equivalent to a `BehaviorRelay`.

Previous: [`AsyncSubject`](/rxswift-asyncsubject/). Next: [`Single`, `Maybe`, and `Completable`](/rxswift-single-maybe-completable/).

Return to the [RxSwift roadmap](/rxswift/).
