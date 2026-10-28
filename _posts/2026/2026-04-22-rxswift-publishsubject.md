---
layout: post
hidden: true
title: "PublishSubject"
date: "2026-04-22"
last_modified_at: "2026-04-22"
permalink: /rxswift-publishsubject/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
---
Observables built with `create` or `of` are cold and closed: the producer is inside them, and the only way in is to subscribe. Real apps also need the opposite, an observable that imperative code can push into. A delegate method fires, a button's action runs, a WebSocket handler receives a message, and each of those has to become an event in a chain. A **subject** is both an observable and an observer: you call `onNext` on it from ordinary code, and its subscribers receive the element.

RxSwift has four subjects, and this article covers the simplest. A `PublishSubject` delivers each element to the subscribers it has at that moment and remembers nothing, except how it ended. That one-sentence description leaves several questions that matter in practice, and this article measures each one: what a late subscriber gets, what happens to a subscriber removed in the middle of a delivery, in what order subscribers are called, what disposing a subject does that completing it does not, and what happens when two threads call `onNext` at once.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/). This article imports RxSwift with `@preconcurrency` so that a subject can be used from `@Sendable` closures in the threading section, for the reason explained in [Creating Observables](/rxswift-creating-observables/#swift-6-and-the-captured-observer).

<!-- check-uses: rx-record -->
```swift
@preconcurrency import RxSwift
import Foundation
import Synchronization
```

## Elements go to whoever is subscribed

A `PublishSubject` starts with no subscribers and no state. Each `onNext` goes to the current subscribers, and a subscriber that arrives later receives only what is sent after it arrives:

```swift
let taps = PublishSubject<String>()
taps.onNext("lost")                                      // no subscribers: delivered to nobody

var early: [String] = []
var late: [String] = []
let earlySubscription = taps.subscribe(onNext: { early.append($0) })
taps.onNext("first")
let lateSubscription = taps.subscribe(onNext: { late.append($0) })
taps.onNext("second")

assert(early == ["first", "second"])
assert(late == ["second"])
```

That is the right behavior for **events**, things that happen at a moment and mean nothing afterwards: a tap, "message sent", "show this alert", "the user pulled to refresh". It is the wrong behavior for **state**. A screen that subscribes to a `PublishSubject` of "the current user" after login has happened will show no user until the next login. For state, use a [`BehaviorSubject`](/rxswift-behaviorsubject/) or a `BehaviorRelay`.

### Completion is remembered

A `PublishSubject` remembers exactly one thing: how it ended. After `onCompleted` or `onError`, every later `onNext` is ignored, and every later subscriber immediately receives the same terminal event:

```swift
let upload = PublishSubject<Int>()
let progressBeforeEnd = upload.subscribe()
upload.onNext(50)
upload.onError(DemoError.timeout)
upload.onNext(100)                                       // ignored: the subject has ended

assert(record(upload) == ["x(timeout)"])                // a late subscriber gets only the error
assert(record(upload) == ["x(timeout)"])                // and so does every one after it
```

The terminal event is replayed but the elements are not, so a late subscriber cannot tell how far the upload got before failing. If that matters, it needs a subject that keeps state.

## Keep it private

A subject is two things at once, and the code that holds it can use either side. The type that owns an event should keep the subject private and expose only the observable side:

```swift
final class MessageComposer {
    private let sentSubject = PublishSubject<String>()
    /// Emits the text of each message after it is sent.
    var messageSent: Observable<String> { sentSubject.asObservable() }

    func send(_ text: String) {
        // ... send it ...
        sentSubject.onNext(text)
    }
}

let composer = MessageComposer()
var sentLog: [String] = []
let sentSubscription = composer.messageSent.subscribe(onNext: { sentLog.append($0) })
composer.send("hello")
assert(sentLog == ["hello"])
```

`asObservable()` returns a wrapper that only forwards subscriptions, so a caller cannot cast the result back to `PublishSubject` and call `onNext` or, worse, `onCompleted`, which would end the stream for everyone. That last point is the strongest argument for the pattern. Only the owner should be able to decide that a stream is over, and for a stream like "message sent", which should never end, the owner should never call it. The [Relays](/rxswift-relays/) article covers the types that make "never ends" a compile-time guarantee.

## Delivery takes a snapshot

When `onNext` is called, a `PublishSubject` copies its list of subscribers under a lock and then calls each one *outside* the lock. Two consequences follow, both measurable. A subscriber disposed while a delivery is in progress still receives the element being delivered:

```swift
let feed = PublishSubject<Int>()
var deliveries: [String] = []
var secondSubscription: Disposable?
let firstSubscription = feed.subscribe(onNext: { value in
    deliveries.append("first got \(value)")
    secondSubscription?.dispose()                       // remove the second subscriber mid-delivery
})
secondSubscription = feed.subscribe(onNext: { deliveries.append("second got \($0)") })

feed.onNext(1)
feed.onNext(2)
assert(deliveries == ["first got 1", "second got 1", "first got 2"])
```

And a subscriber *added* during a delivery does not receive the element being delivered, only later ones. Both are the right choices for a lock-free delivery loop, and both break code that assumes "after I dispose, I receive nothing". If a subscriber's closure can be reached after its owner has torn itself down in the same delivery, it needs to check its own state.

## In what order subscribers are called

RxSwift stores a subject's subscribers in an internal `Bag` with three tiers: one inline slot, then an array of up to 30 entries, then a dictionary. Delivery walks the tiers in that order. For up to 31 subscribers, that means the order is the order of subscription, *except* that the inline slot is reused, so a subscriber added after the first one was removed jumps to the front:

```swift
let refresh = PublishSubject<Void>()
var callOrder: [String] = []
let first = refresh.subscribe(onNext: { _ in callOrder.append("first") })
let second = refresh.subscribe(onNext: { _ in callOrder.append("second") })
first.dispose()
let third = refresh.subscribe(onNext: { _ in callOrder.append("third") })

refresh.onNext(())
assert(callOrder == ["third", "second"])                // the newest subscriber was called first
```

Beyond 31 subscribers, the extra ones live in a dictionary, and their order is the dictionary's, which in Swift is seeded randomly for each process launch:

```swift
let broadcast = PublishSubject<Void>()
var broadcastOrder: [Int] = []
let broadcastBag = DisposeBag()
for index in 0..<40 {
    broadcast.subscribe(onNext: { _ in broadcastOrder.append(index) }).disposed(by: broadcastBag)
}
broadcast.onNext(())

assert(Array(broadcastOrder.prefix(31)) == Array(0..<31))  // the first 31 in subscription order
print("the last nine:", broadcastOrder.suffix(9))
```

One run printed `[38, 35, 34, 33, 39, 31, 36, 37, 32]` for the last nine, and the next launch printed `[37, 33, 32, 31, 35, 36, 39, 34, 38]`. The practical rule is the same as for Combine's subjects: subscribers of one subject must not depend on each other's order. If one must run before another, express that in the chain, for example with `concat` or with a single subscriber that does both things in sequence.

## Completing versus disposing a subject

A subject also conforms to `Disposable`, and calling `dispose()` on the *subject* is different from completing it. Completion tells subscribers the stream ended. Disposal tears the subject down without telling anyone. Current subscribers are silently removed and receive no event, so their `onCompleted` and `onDisposed` closures never run, and a later subscriber receives an error:

```swift
let session = PublishSubject<Int>()
var sessionEvents: [String] = []
let sessionSubscription = session.subscribe(
    onNext: { sessionEvents.append("next \($0)") },
    onError: { _ in sessionEvents.append("error") },
    onCompleted: { sessionEvents.append("completed") },
    onDisposed: { sessionEvents.append("disposed") }
)

session.dispose()
session.onNext(1)                                        // ignored
assert(sessionEvents == [])                             // the subscriber was not told anything
assert(session.hasObservers == false)

let afterDisposal = record(session)
assert(afterDisposal.count == 1 && afterDisposal[0].hasPrefix("x("))
print(afterDisposal[0])
```

The late subscriber received `RxError.disposed`, which printed as ``x(Object `RxSwift.PublishSubject<Swift.Int>` was already disposed.)``. Disposing a subject is almost never what you want. If a stream is finished, call `onCompleted()`; if the owner is going away, let the subject be deallocated with it.

`hasObservers`, used above, reports whether the subject currently has subscribers. It is occasionally useful to avoid expensive work that nobody would see, such as formatting a log message for a debug overlay that is not open.

## Two threads, one subject

The ReactiveX contract says events must not overlap, as [Observables and Observers](/rxswift-observables-observers/#the-grammar) explained. A `PublishSubject` does not enforce it. Its lock protects its own list of subscribers, but because delivery happens outside the lock, two threads calling `onNext` at the same time deliver to the same subscriber at the same time.

To measure it without introducing a data race into the measurement, this subscriber tracks how many calls are in flight with an atomic counter and records whenever it finds more than one:

```swift
final class OverlapDetector: Sendable {
    private let inFlight = Atomic(0)
    let deliveries = Atomic(0)
    let overlaps = Atomic(0)

    func deliver() {
        if inFlight.add(1, ordering: .sequentiallyConsistent).newValue > 1 {
            overlaps.add(1, ordering: .relaxed)
        }
        for _ in 0..<200 { _ = 0 }                      // stand-in for real work
        deliveries.add(1, ordering: .relaxed)
        inFlight.subtract(1, ordering: .sequentiallyConsistent)
    }
}

nonisolated func sendFromEightThreads(serialized: Bool) -> (deliveries: Int, overlaps: Int) {
    let subject = PublishSubject<Int>()
    let detector = OverlapDetector()
    let source = serialized
        ? subject.observe(on: SerialDispatchQueueScheduler(qos: .userInitiated))
        : subject.asObservable()
    let subscription = source.subscribe(onNext: { _ in detector.deliver() })

    DispatchQueue.concurrentPerform(iterations: 8) { _ in
        for value in 0..<2_000 { subject.onNext(value) }
    }
    while detector.deliveries.load(ordering: .relaxed) < 16_000 { usleep(1_000) }
    subscription.dispose()
    return (detector.deliveries.load(ordering: .relaxed), detector.overlaps.load(ordering: .relaxed))
}

let unserialized = sendFromEightThreads(serialized: false)
print("8 threads, direct:", unserialized)
assert(unserialized.deliveries == 16_000 && unserialized.overlaps > 0)
```

Across five runs, between 13,900 and 14,300 of the 16,000 deliveries started while another delivery to the same subscriber was still running. A subscriber that appends to an array, increments a counter, or runs `scan` would have been corrupted. A debug build of RxSwift also notices and prints a warning for each overlap it detects:

```text
⚠️ Synchronization anomaly was detected.
  > Problem: This behavior is breaking the observable sequence grammar. `next (error | completed)?`
    This behavior breaks the grammar because there is overlapping between sequence events.
```

There are two fixes. The better one is to send from one thread or queue in the first place, by having the producer hop to a serial queue before calling `onNext`. When that is not possible, `observe(on:)` with a *serial* scheduler queues each event and delivers them one at a time downstream of the subject:

```swift
let serialized = sendFromEightThreads(serialized: true)
assert(serialized == (deliveries: 16_000, overlaps: 0))
```

All 16,000 elements were delivered, none overlapping. The subject itself still sees concurrent `onNext` calls, so the debug warnings still print; only the subscribers below the `observe(on:)` are protected. [Schedulers](/rxswift-schedulers/) explains which schedulers are serial.

## A delegate as an observable

The typical use of a `PublishSubject` is adapting a callback-based object into an observable, keeping the subject private. Here a download manager reports progress and completion through a delegate, and a small adapter turns each callback into an event:

```swift
protocol DownloadDelegate: AnyObject {
    func download(didProgress fraction: Double)
    func downloadDidFinish()
}

final class DownloadEvents: DownloadDelegate {
    private let progressSubject = PublishSubject<Double>()
    var progress: Observable<Double> { progressSubject.asObservable() }

    func download(didProgress fraction: Double) { progressSubject.onNext(fraction) }
    func downloadDidFinish() { progressSubject.onCompleted() }
}

let events = DownloadEvents()
let delegate: DownloadDelegate = events                  // what the download manager would hold
var progressText: [String] = []
let progressSubscription = events.progress
    .map { "\(Int($0 * 100))%" }
    .subscribe(onNext: { progressText.append($0) }, onCompleted: { progressText.append("done") })

delegate.download(didProgress: 0.25)
delegate.download(didProgress: 1.0)
delegate.downloadDidFinish()
assert(progressText == ["25%", "100%", "done"])
```

This adapter has a limitation that matters for real UIKit and AppKit delegates: an object can have only one delegate, so the adapter replaces whatever delegate was there. RxCocoa's `DelegateProxy` solves that by forwarding to the original delegate as well, and [Writing Custom Reactive Extensions](/rxswift-custom-reactive-extensions/) builds one.

## `PublishSubject` and `PassthroughSubject`

Combine's equivalent is `PassthroughSubject`, and the two behave the same way for late subscribers and terminal events. They differ in what they promise:

| | RxSwift `PublishSubject` | Combine `PassthroughSubject` |
| --- | --- | --- |
| Element to a subscriber that asked for none | delivered: Rx has no demand | dropped |
| Failure type | any `Error` | typed, can be `Never` |
| Order of many subscribers | first 31 in order, then random per launch | varied between launches in measurements |
| Concurrent sends to one subscriber | overlap; warning in debug builds | serialized: 0 overlaps in the same test |
| Explicit teardown | `dispose()`, late subscribers get `RxError.disposed` | none |

The fourth row was a surprise. Running the same eight-thread test against a Combine `PassthroughSubject` and `sink` produced 16,000 deliveries and no overlaps in three runs. Combine evidently serializes delivery to a subscriber, so concurrent sends wait for each other; RxSwift lets them run at once and leaves serialization to you.

The first row is the more important one in everyday code. A Combine subscriber that requests one value at a time can lose events from a `PassthroughSubject`, which [Subjects: `PassthroughSubject` and `CurrentValueSubject`](/combine-subjects/) measured. An RxSwift subscriber cannot, because RxSwift has no demand to fall short of; the price is that a slow subscriber slows the code calling `onNext`.

```swift
withExtendedLifetime((earlySubscription, lateSubscription, progressBeforeEnd, sentSubscription,
                      firstSubscription, second, third, sessionSubscription,
                      progressSubscription)) {}
```

## Summary

- A `PublishSubject` delivers each element to its current subscribers and keeps no elements. Use it for events, not state.
- After a terminal event, `onNext` is ignored and late subscribers receive only the terminal event.
- Keep the subject private and expose `asObservable()`, so only the owner can send or end the stream.
- Delivery uses a snapshot: a subscriber removed mid-delivery still gets the current element; one added mid-delivery does not.
- The first 31 subscribers are called in order, but a new subscriber can take the first slot; beyond 31 the order changes per launch.
- `dispose()` on a subject removes subscribers without telling them, and later subscribers receive `RxError.disposed`.
- Concurrent `onNext` calls overlapped in close to nine of every ten of 16,000 deliveries; `observe(on:)` with a serial scheduler brought that to zero.

## Exercise

Write a `SerializedSubject<Element>` that wraps a `PublishSubject` and makes `onNext`, `onError`, and `onCompleted` safe to call from any thread, by delivering every event on one private serial queue. Reuse `sendFromEightThreads` to show that your subject reports zero overlaps and no "Synchronization anomaly" warnings, and measure how much later the last of the 16,000 elements arrives compared with the unserialized version. Then decide whether your `onNext` should return before or after the element is delivered, and write a test that tells the two apart.

## Further reading

- [Subjects](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/Subjects.md) in the RxSwift documentation.
- [Subject](https://reactivex.io/documentation/subject.html) on ReactiveX.io, with marble diagrams for every subject type.
- The [`PublishSubject.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxSwift/Subjects/PublishSubject.swift) source, about 150 lines, which shows the snapshot delivery and the disposal behavior measured here.
- [Subjects: `PassthroughSubject` and `CurrentValueSubject`](/combine-subjects/) for the Combine side.

Previous: [Disposing and `DisposeBag`](/rxswift-disposebag/). Next: [`BehaviorSubject`](/rxswift-behaviorsubject/).

Return to the [RxSwift roadmap](/rxswift/).
