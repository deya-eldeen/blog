---
layout: post
hidden: true
title: "Filtering Operators: filter, distinctUntilChanged, skip, take"
date: "2026-05-08"
last_modified_at: "2026-05-08"
permalink: /rxswift-filtering-operators/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Most streams in an app carry more than their subscribers need. A scroll view reports its offset on every frame, and a header only cares which section is on screen. A text field reports every keystroke, and a search only cares about queries of three characters or more. A sensor reports a reading ten times a second, and the screen shows it rounded to a whole degree. Filtering operators decide which elements go through, and they are where a chain usually does its most effective work, because every element they drop is work that nothing downstream has to do.

This article covers the filtering operators from the [RxSwift roadmap](/rxswift/): `filter`, `distinctUntilChanged` and its variants, the `skip` family, and the `take` family, along with `element(at:)`, `ignoreElements`, and `single`. It also introduces the virtual-time scheduler used by the rest of the operator articles, and uses a little probability to predict, before running anything, how many updates `distinctUntilChanged` will let through from a noisy sensor. The simulation agrees with the formula to within 1.3%.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift`, `RxRelay`, and `RxTest`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/). RxTest links XCTest, so outside a test bundle the executable needs Xcode's XCTest on its library path; the [testing article](/rxswift-testing-rxtest-rxblocking/) shows the usual setup, inside a test target.

<!-- check-uses: rx-record -->
```swift
import RxSwift
import RxRelay
import RxTest
import Foundation
```

## A clock you control

Several operators in this and the following articles depend on time, and testing them against the real clock means sleeping and hoping. RxTest's `TestScheduler` is a scheduler with a virtual clock: time advances only when the scheduler runs, instantly, from one scheduled action to the next. With a `resolution` of `0.001`, one tick of its clock is one millisecond, so `.milliseconds(300)` in an operator means 300 ticks.

`createHotObservable` makes a source that emits at fixed virtual times, and `start(created:subscribed:disposed:)` builds the chain, subscribes, runs the clock, and returns a recording observer. The helper below renders a recording as strings like `"a@100"` for an element at 100 ms, `"|@1000"` for completion, and `"x(boom)@500"` for an error, so a test can compare whole timelines:

<!-- rx-timeline -->
```swift
/// Renders RxTest recordings as "element@time", "|@time" for completion, and "x(error)@time".
func timeline<Element>(_ events: [Recorded<Event<Element>>]) -> [String] {
    events.map { recorded in
        switch recorded.value {
        case .next(let element): "\(element)@\(recorded.time)"
        case .completed: "|@\(recorded.time)"
        case .error(let error): "x(\(error))@\(recorded.time)"
        }
    }
}

/// A scheduler whose clock ticks once per virtual millisecond.
func millisecondScheduler() -> TestScheduler {
    TestScheduler(initialClock: 0, resolution: 0.001)
}
```

Here it is running the simplest filter, which needs no clock, so the times are simply when the hot source emitted:

```swift
let scheduler = millisecondScheduler()
let keystrokes = scheduler.createHotObservable([
    .next(100, "s"), .next(200, "sw"), .next(300, "swi"), .next(400, "swif"), .completed(500),
])
let longEnough = scheduler.start(created: 0, subscribed: 0, disposed: 1_000) {
    keystrokes.filter { $0.count >= 3 }
}
assert(timeline(longEnough.events) == ["swi@300", "swif@400", "|@500"])
```

[Testing with RxTest and RxBlocking](/rxswift-testing-rxtest-rxblocking/) explains `TestScheduler`, hot and cold test observables, and the default times of `start` in depth.

## `filter`

`filter` passes the elements for which its predicate returns `true`. It keeps no state, never delays anything, and forwards completion and errors untouched. A throwing predicate turns its error into an error event, which ends the chain:

```swift
assert(record(Observable.of(1, 2, 3, 4, 5, 6).filter { $0.isMultiple(of: 2) }) == ["2", "4", "6", "|"])

let strict = Observable.of("1", "2", "x", "4").filter { text in
    guard let number = Int(text) else { throw DemoError.boom }
    return number > 1
}
assert(record(strict) == ["2", "x(boom)"])
```

Because it keeps no state, `filter` can be placed anywhere in a chain, and the earlier it runs, the less the rest of the chain does. Filtering before an expensive `map` or before `observe(on:)`, which costs a dispatch per element, is the cheapest optimization in RxSwift.

`compactMap` is the combination of `map` and `filter` for optionals: it transforms each element and drops the `nil`s. It belongs here as often as among the transforming operators:

```swift
assert(record(Observable.of("1", "two", "3").compactMap { Int($0) }) == ["1", "3", "|"])
```

## `distinctUntilChanged`

`distinctUntilChanged` drops an element when it equals the previous one. Only the immediately previous element is compared, so a value that comes back after something else passes again:

```swift
assert(record(Observable.of(1, 1, 2, 2, 2, 1, 3, 3).distinctUntilChanged()) == ["1", "2", "1", "3", "|"])
```

That makes its memory constant: it stores one element, however long the stream runs. It also means it is not "distinct" in the set sense, and the difference matters when choosing it. For "has this value changed?", which is what state streams need, it is exactly right. For "have I seen this value before?", such as deduplicating notification IDs, it is wrong, and a set is needed:

```swift
extension ObservableType where Element: Hashable {
    /// Drops every element that has appeared before. Memory grows with the number of distinct elements.
    func distinct() -> Observable<Element> {
        Observable.deferred {
            var seen = Set<Element>()
            return self.filter { seen.insert($0).inserted }
        }
    }
}

assert(record(Observable.of(1, 1, 2, 2, 2, 1, 3, 3).distinct()) == ["1", "2", "3", "|"])
```

The `deferred` gives each subscriber its own set, as [Creating Observables](/rxswift-creating-observables/#just-one-element-then-completion) explained; without it, two subscribers would share one set and hide each other's elements.

### Comparing by key or by rule

Three variants change what "equal" means. `distinctUntilChanged(_:)` with a key selector compares a derived value, `distinctUntilChanged(at:)` compares a key path, and `distinctUntilChanged(_:comparer:)` takes a full comparison:

```swift
struct Track: Equatable {
    let id: Int
    let title: String
    let position: Double
}

let playback = Observable.of(
    Track(id: 1, title: "Intro", position: 0),
    Track(id: 1, title: "Intro", position: 1.5),           // same track, playing
    Track(id: 2, title: "Theme", position: 0),
    Track(id: 2, title: "Theme", position: 0.5)
)

assert(record(playback.distinctUntilChanged(at: \.id).map(\.title)) == ["Intro", "Theme", "|"])
assert(record(playback.distinctUntilChanged().map(\.title)).count == 5)    // every position update passes

let roughly = Observable.of(20.0, 20.04, 20.3, 20.31, 21.0)
    .distinctUntilChanged { abs($0 - $1) < 0.1 }
assert(record(roughly) == ["20.0", "20.3", "21.0", "|"])
```

The third example has a trap. RxSwift compares each element with the last element that *passed*, not with the last element that arrived, and with a comparer that is not transitive, like "within 0.1 of", the two give different answers. A slow drift shows it:

```swift
let drifting = Observable.of(20.0, 20.06, 20.12, 20.18, 20.24)
    .distinctUntilChanged { abs($0 - $1) < 0.1 }
assert(record(drifting) == ["20.0", "20.12", "20.24", "|"])
```

Compared with the previous arrival, every step is 0.06 and nothing after 20.0 would pass. Compared with the last emitted element, every second step crosses the tolerance. The output depends on the history of what passed, which is rarely what the author had in mind. For tolerances, rounding first and comparing exactly is usually what was meant.

### How many updates get through

The reason to put `distinctUntilChanged` on a sensor stream is to avoid redrawing the screen when the displayed value has not changed. How much does it save? That can be worked out before running anything.

Suppose a temperature is sampled $$n$$ times, each sample differs from the previous one by a small random step $$\Delta$$ with standard deviation $$\sigma$$, and the screen shows the value rounded to whole degrees, so bins of width $$w = 1$$. The rounded value changes when a step crosses a bin boundary. If the current value is equally likely to be anywhere within its bin, a step of size $$|\Delta| < w$$ crosses a boundary with probability $$|\Delta| / w$$. Averaging over normally distributed steps, where $$\mathbb{E}|\Delta| = \sigma\sqrt{2/\pi}$$, the probability that the rounded value changes on a given sample is

$$
p = \frac{\mathbb{E}|\Delta|}{w} = \frac{\sigma}{w}\sqrt{\frac{2}{\pi}},
$$

and the expected number of elements that pass `distinctUntilChanged` is the first one plus one per change:

$$
\mathbb{E}[\text{emitted}] = 1 + (n - 1)\,p .
$$

For $$n = 100{,}000$$ samples with $$\sigma = 0.02$$ degrees, $$p = 0.02 \times 0.798 = 0.01596$$, and the prediction is $$1 + 99{,}999 \times 0.01596 \approx 1{,}597$$ updates, about 1.6% of the samples. The simulation below uses a seeded random number generator, so the run is reproducible:

<!-- rx-random -->
```swift
/// SplitMix64: a small, fast, seedable generator.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

/// A normally distributed sample, by the Box-Muller transform.
func gaussian(_ sigma: Double, using generator: inout SeededGenerator) -> Double {
    let u1 = Double.random(in: Double.ulpOfOne..<1, using: &generator)
    let u2 = Double.random(in: 0..<1, using: &generator)
    return sigma * (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
}
```

```swift
var generator = SeededGenerator(seed: 2026)
var temperature = 21.37
var readings: [Double] = []
for _ in 0..<100_000 {
    temperature += gaussian(0.02, using: &generator)
    readings.append(temperature)
}

var redraws = 0
let display = Observable.from(readings)
    .map { $0.rounded() }
    .distinctUntilChanged()
    .subscribe(onNext: { _ in redraws += 1 })

let predicted = 1 + 99_999 * 0.02 * (2 / Double.pi).squareRoot()
print("redraws:", redraws, "predicted:", predicted)
assert(abs(Double(redraws) - predicted) / predicted < 0.1)
```

The run printed 1,576 redraws against a prediction of 1,597, within 1.3%. Of 100,000 readings, 98.4% never reached the display. The assumption that is only approximately true is the uniform position within the bin: a random walk that has just crossed a boundary is more likely to cross back soon, which is also why a real sensor sitting near 21.5 degrees can make a display flicker between 21 and 22. When that flicker matters, `debounce` or a hysteresis rule (only change when the value is 0.6 past the boundary) fixes it; [Time Operators](/rxswift-time-operators/) covers the first.

## The `skip` family

`skip(n)` drops the first `n` elements. `skip(while:)` drops elements until the predicate first returns `false`, and then passes everything, including later elements for which it would be `true` again:

```swift
assert(record(Observable.of(1, 2, 3, 4).skip(2)) == ["3", "4", "|"])
assert(record(Observable.of(1, 2, 5, 1, 2).skip(while: { $0 < 3 })) == ["5", "1", "2", "|"])
```

The typical use of `skip(1)` is with state that replays its current value. A `BehaviorRelay` gives each subscriber its current value immediately, and a subscriber that only wants *changes*, for example to save settings when they change but not at launch, skips that first element:

```swift
let fontSize = BehaviorRelay(value: 14)
var saves: [Int] = []
let saving = fontSize.skip(1).subscribe(onNext: { saves.append($0) })
fontSize.accept(16)
fontSize.accept(18)
assert(saves == [16, 18])                                   // the initial 14 was not saved
```

`skip(until:)` drops elements until a second observable emits. In virtual time, here are location updates that should be ignored until the user taps "start tracking":

```swift
let tracking = millisecondScheduler()
let locations = tracking.createHotObservable([
    .next(100, "A"), .next(200, "B"), .next(300, "C"), .next(400, "D"), .completed(500),
])
let startTapped = tracking.createHotObservable([.next(250, ())])
let trackedLocations = tracking.start(created: 0, subscribed: 0, disposed: 1_000) {
    locations.skip(until: startTapped)
}
assert(timeline(trackedLocations.events) == ["C@300", "D@400", "|@500"])
```

## The `take` family

`take(n)` passes the first `n` elements and then *completes*, disposing its subscription to the source. That second part is what makes it useful: it does not just drop the rest, it stops the work that would produce them. Measured with a counter on the source:

```swift
var produced = 0
var sourceDisposed = false
let ticker = Observable<Int>.create { observer in
    for value in 1...5 {
        produced += 1
        observer.onNext(value)
    }
    return Disposables.create { sourceDisposed = true }
}
assert(record(ticker.take(2)) == ["1", "2", "|"])
assert(sourceDisposed)
```

The completion arrived immediately after the second element. This particular source produced all five elements anyway, because a synchronous `create` cannot be interrupted until its closure returns, the trap measured in [Disposing and `DisposeBag`](/rxswift-disposebag/#booleandisposable-and-why-a-synchronous-create-cannot-be-stopped); a source driven by a scheduler or a callback stops after the second.

`take(while:)` passes elements while the predicate holds, then completes. Its `behavior` argument decides whether the first element that fails the predicate is included:

```swift
let progress = Observable.of(0.2, 0.6, 1.0, 1.0)
assert(record(progress.take(while: { $0 < 1 })) == ["0.2", "0.6", "|"])
assert(record(progress.take(while: { $0 < 1 }, behavior: .inclusive)) == ["0.2", "0.6", "1.0", "|"])
```

The inclusive form is right for progress: the element that ends the stream, 100%, is exactly the one a progress bar must show.

`take(until:)` passes elements until a second observable emits, then completes. It is the operator behind tying a subscription to an object's lifetime with `take(until: object.rx.deallocated)`, which [Disposing and `DisposeBag`](/rxswift-disposebag/#tying-a-subscription-to-an-objects-lifetime) uses. In virtual time:

```swift
let session = millisecondScheduler()
let heartbeats = session.createHotObservable([
    .next(100, "beat"), .next(200, "beat"), .next(300, "beat"), .next(400, "beat"),
])
let loggedOut = session.createHotObservable([.next(250, ())])
let liveHeartbeats = session.start(created: 0, subscribed: 0, disposed: 1_000) {
    heartbeats.take(until: loggedOut)
}
assert(timeline(liveHeartbeats.events) == ["beat@100", "beat@200", "|@250"])
```

The completion arrived at 250, the moment of the logout, not at the next heartbeat. `take(for:scheduler:)` does the same with a duration instead of a second observable; it completes when the time runs out:

```swift
let timed = millisecondScheduler()
let samples = timed.createHotObservable([.next(100, 1), .next(150, 2), .next(400, 3)])
let firstThreeHundred = timed.start(created: 0, subscribed: 0, disposed: 1_000) {
    samples.take(for: .milliseconds(300), scheduler: timed)
}
assert(timeline(firstThreeHundred.events) == ["1@100", "2@150", "|@300"])
```

## `element(at:)`, `ignoreElements`, and `single`

Three more filters are occasionally exactly what is needed. `element(at:)` passes only the element at an index and then completes, and fails with `RxError.argumentOutOfRange` if the source completes too early. `ignoreElements()` drops every element and keeps only the terminal event, which is how to wait for something to finish without caring what it produced. And `single()` passes the only element of a sequence, failing if there are none or more than one; it is the operator form of the `asSingle()` conversion from [`Single`, `Maybe`, and `Completable`](/rxswift-single-maybe-completable/#converting-observables-into-traits):

```swift
assert(record(Observable.of("a", "b", "c").element(at: 1)) == ["b", "|"])
assert(record(Observable.of(1, 2, 3).ignoreElements().asObservable()) == ["|"])
assert(record(Observable.of(7).single()) == ["7", "|"])
assert(record(Observable.of(7, 8).single()).last?.hasPrefix("x(") == true)
```

`single(_:)` with a predicate passes the one element matching it, and fails if more than one matches.

## Filtering in RxSwift and Combine

| RxSwift | Combine |
| --- | --- |
| `filter`, `compactMap` | `filter`, `compactMap`, `tryFilter` |
| `distinctUntilChanged()` | `removeDuplicates()` |
| `distinctUntilChanged(at:)`, `(_:comparer:)` | `removeDuplicates(by:)` |
| `skip(n)`, `skip(while:)`, `skip(until:)` | `dropFirst(n)`, `drop(while:)`, `drop(untilOutputFrom:)` |
| `take(n)`, `take(while:)`, `take(until:)` | `prefix(n)`, `prefix(while:)`, `prefix(untilOutputFrom:)` |
| `take(while:behavior: .inclusive)` | no built-in equivalent |
| `element(at:)`, `ignoreElements()` | `output(at:)`, `ignoreOutput()` |

The behaviors match closely, including `removeDuplicates`'s adjacent-only comparison. [Filtering: `filter`, `removeDuplicates`, `compactMap`](/combine-filter-removeduplicates-compactmap/) covers the Combine side, with its own simulation of how much deduplication saves.

```swift
withExtendedLifetime((display, saving)) {}
```

## Summary

- `TestScheduler` from RxTest runs operators in virtual time; with a resolution of 0.001 one tick is a millisecond, and `timeline` renders recordings for comparison.
- `filter` is stateless and cheapest when placed early. `compactMap` maps and drops `nil`s.
- `distinctUntilChanged` compares each element with the last one that passed, in constant memory; a set-based `distinct` needs `deferred` and grows with the number of distinct values. Non-transitive comparers compare against the last emitted element.
- For a random walk rounded to bins of width $$w$$, $$\mathbb{E}[\text{emitted}] = 1 + (n-1)\frac{\sigma}{w}\sqrt{2/\pi}$$: predicted 1,597 updates out of 100,000, measured 1,576.
- `skip(1)` turns a replaying state stream into a stream of changes; `skip(until:)` waits for a trigger.
- `take(n)`, `take(while:)`, `take(until:)`, and `take(for:)` complete and dispose the source; `.inclusive` keeps the element that ended the stream.

## Exercise

Write a `distinctUntilChanged(hysteresis:)` operator for `Double` streams that only emits a new rounded value when the raw value has moved at least `hysteresis` past the midpoint between two whole numbers, to stop a display from flickering between 21 and 22. Run it on the seeded random walk from this article with hysteresis 0, 0.1, and 0.3, and count the emissions. Then derive, or estimate from your measurements, how the expected number of emissions depends on the hysteresis.

## Further reading

- [Filtering Observables](https://reactivex.io/documentation/operators.html#filtering) on ReactiveX.io, with marble diagrams for each operator.
- [Testing](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/UnitTests.md) in the RxSwift documentation, on `TestScheduler`.
- [Filtering: `filter`, `removeDuplicates`, `compactMap`](/combine-filter-removeduplicates-compactmap/) for the Combine operators.

Previous: [`Driver` and `Signal`](/rxswift-driver-signal/). Next: [Time Operators: `debounce`, `throttle`, `delay`, `interval`, `timer`, `timeout`](/rxswift-time-operators/).

Return to the [RxSwift roadmap](/rxswift/).
