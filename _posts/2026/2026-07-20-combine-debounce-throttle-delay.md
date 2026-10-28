---
layout: post
hidden: true
title: "Time: debounce, throttle, and delay"
date: "2026-07-20"
last_modified_at: "2026-07-20"
permalink: /combine-debounce-throttle-delay/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Operators, Testing, Schedulers]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Time-based operators reshape when values arrive. `debounce` waits for a pause and then emits the latest value, which is how a search field avoids sending a request per keystroke. `throttle` emits at most one value per interval, which is how a scroll handler avoids running at 120 Hz. `delay` shifts everything later by a fixed amount. All three take a **scheduler**, the object that tells them what time it is and runs their timers, and that parameter is what makes them testable: give them a scheduler whose clock you control, and their exact behavior can be checked in microseconds instead of seconds of flaky sleeping.

This article builds that scheduler first, then uses it to pin down each operator to the millisecond. The results include three behaviors that surprise people who rely on them: `debounce` drops the pending value when its upstream finishes, `throttle` with `latest: false` delivers the second tap of a double tap almost a second late instead of dropping it, and `delay` on a concurrent queue occasionally loses a value. It also derives how many values `debounce` and `throttle` let through for random input and checks the formulas against simulation.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift`. Later articles in this series, including [Schedulers: `receive(on:)` and `subscribe(on:)`](/combine-schedulers-receive-subscribe-on/) and [Testing Publishers](/combine-testing-publishers/), reuse the `VirtualTimeScheduler` and `TimelineRecorder` defined in the next section.

## A scheduler whose clock you control

Every time-based operator asks its scheduler two things: what time it is now, and to run a closure at a later time. The `Scheduler` protocol has exactly those requirements, plus a variant for repeating work:

<!-- skip-check -->
```swift
public protocol Scheduler<SchedulerTimeType> {
    associatedtype SchedulerTimeType: Strideable where SchedulerTimeType.Stride: SchedulerTimeIntervalConvertible
    associatedtype SchedulerOptions
    var now: SchedulerTimeType { get }
    var minimumTolerance: SchedulerTimeType.Stride { get }
    func schedule(options: SchedulerOptions?, _ action: @escaping () -> Void)
    func schedule(after date: SchedulerTimeType, tolerance: SchedulerTimeType.Stride,
                  options: SchedulerOptions?, _ action: @escaping () -> Void)
    func schedule(after date: SchedulerTimeType, interval: SchedulerTimeType.Stride,
                  tolerance: SchedulerTimeType.Stride, options: SchedulerOptions?,
                  _ action: @escaping () -> Void) -> any Cancellable
}
```

`DispatchQueue`, `RunLoop`, and `OperationQueue` conform, each with its own time type. A test scheduler only has to keep a list of scheduled closures and run them when the test says time has passed. Borrowing `DispatchQueue`'s time type saves writing a `Strideable` type by hand, and works because its arithmetic is pure nanosecond counting that never consults the real clock:

<!-- virtual-scheduler -->
```swift
import Combine
import Foundation

/// A scheduler whose clock moves only when a test calls `advance(by:)`.
final class VirtualTimeScheduler: Scheduler {
    typealias SchedulerTimeType = DispatchQueue.SchedulerTimeType
    typealias SchedulerOptions = Never

    private struct Item {
        let id: Int
        let sequence: Int
        var due: SchedulerTimeType
        let interval: SchedulerTimeType.Stride?
        let action: () -> Void
    }

    private(set) var now = SchedulerTimeType(DispatchTime(uptimeNanoseconds: 1))
    var minimumTolerance: SchedulerTimeType.Stride { .zero }
    private var items: [Item] = []
    private var nextID = 0
    private var nextSequence = 0

    /// Scheduled closures that have not run yet.
    var pendingCount: Int { items.count }

    func schedule(options: Never?, _ action: @escaping () -> Void) {
        enqueue(due: now, interval: nil, action)
    }

    func schedule(after date: SchedulerTimeType, tolerance: SchedulerTimeType.Stride,
                  options: Never?, _ action: @escaping () -> Void) {
        enqueue(due: date, interval: nil, action)
    }

    func schedule(after date: SchedulerTimeType, interval: SchedulerTimeType.Stride,
                  tolerance: SchedulerTimeType.Stride, options: Never?,
                  _ action: @escaping () -> Void) -> any Cancellable {
        let id = enqueue(due: date, interval: interval, action)
        return AnyCancellable { [weak self] in self?.items.removeAll { $0.id == id } }
    }

    /// Runs everything due up to `now + stride`, earliest first and in scheduling order
    /// for equal times, then sets the clock to that time.
    func advance(by stride: SchedulerTimeType.Stride = .zero) {
        let target = now.advanced(by: stride)
        while let index = nextDueIndex(notAfter: target) {
            var item = items[index]
            now = max(now, item.due)
            if let interval = item.interval {
                item.due = item.due.advanced(by: interval)
                items[index] = item
            } else {
                items.remove(at: index)
            }
            item.action()
        }
        now = target
    }

    /// Runs each step at its time, in milliseconds from now, then advances to `end`.
    /// Timers due at the same instant as a step run before the step.
    func perform(_ steps: [(at: Int, action: () -> Void)], until end: Int) {
        var elapsed = 0
        for step in steps {
            advance(by: .milliseconds(step.at - elapsed))
            elapsed = step.at
            step.action()
        }
        advance(by: .milliseconds(end - elapsed))
    }

    @discardableResult
    private func enqueue(due: SchedulerTimeType, interval: SchedulerTimeType.Stride?,
                         _ action: @escaping () -> Void) -> Int {
        nextID += 1
        nextSequence += 1
        items.append(Item(id: nextID, sequence: nextSequence, due: due, interval: interval, action: action))
        return nextID
    }

    private func nextDueIndex(notAfter target: SchedulerTimeType) -> Int? {
        items.indices
            .filter { items[$0].due <= target }
            .min { (items[$0].due, items[$0].sequence) < (items[$1].due, items[$1].sequence) }
    }
}
```

A recorder turns a publisher's output into strings stamped with the virtual time at which each event arrived, in milliseconds since the recorder was created: `"swift@550"` for a value, `"|@800"` for finishing, and `"x(error)@250"` for a failure:

<!-- virtual-scheduler -->
```swift
/// Records each event with the virtual time, in milliseconds, at which it arrived.
final class TimelineRecorder<Output, Failure: Error> {
    private(set) var events: [String] = []
    private var cancellable: AnyCancellable?

    init(_ publisher: some Publisher<Output, Failure>, scheduler: VirtualTimeScheduler) {
        let start = scheduler.now
        let elapsed = { start.distance(to: scheduler.now).magnitude / 1_000_000 }
        cancellable = publisher.sink(
            receiveCompletion: { [weak self] completion in
                switch completion {
                case .finished: self?.events.append("|@\(elapsed())")
                case .failure(let error): self?.events.append("x(\(error))@\(elapsed())")
                }
            },
            receiveValue: { [weak self] value in self?.events.append("\(value)@\(elapsed())") }
        )
    }

    func cancel() { cancellable?.cancel() }
}
```

Before trusting the virtual scheduler, it is worth checking that operators behave the same on it as on a real queue. The scripts below were also run against a serial `DispatchQueue` with real sleeps. Every value and completion matched; the real timings were between 1% and 4% later, because `DispatchQueue` timers are allowed some leeway. For example, the `debounce` script that emits `swif@550` on the virtual scheduler emitted `swif@562` on the real queue.

## `debounce`: wait for a pause

`debounce(for:scheduler:)` holds each value for the given interval. If another value arrives first, the held value is replaced and the timer restarts; if the interval passes in silence, the held value is emitted. Here is a user typing "swift" with a pause after the fourth letter, and the field closing at 800 ms:

```swift
let clock = VirtualTimeScheduler()

let keystrokes = PassthroughSubject<String, Never>()
let debounced = TimelineRecorder(
    keystrokes.debounce(for: .milliseconds(300), scheduler: clock), scheduler: clock)
clock.perform([
    (0, { keystrokes.send("s") }),
    (100, { keystrokes.send("sw") }),
    (200, { keystrokes.send("swi") }),
    (250, { keystrokes.send("swif") }),
    (700, { keystrokes.send("swift") }),
    (800, { keystrokes.send(completion: .finished) }),
], until: 2_000)

assert(debounced.events == ["swif@550", "|@800"])
```

On a timeline, with the debounce window drawn after each value:

```text
time (ms)  0     100   200   250         550   700   800
input      s     sw    swi   swif              swift  |
window     [----replaced----][---300ms---]     [--cut short by completion
output                                   swif         |
```

`swif` was emitted 300 ms after the last keystroke of the burst, which is the point of the operator. `swift`, the final text, was **never emitted**: the upstream finished 100 ms into its window, and `debounce` forwarded the completion immediately and discarded the pending value. A failure behaves the same way, arriving at once and dropping the pending value:

```swift
enum SaveError: Error { case diskFull }

let failingInput = PassthroughSubject<String, SaveError>()
let debouncedFailure = TimelineRecorder(
    failingInput.debounce(for: .milliseconds(300), scheduler: clock), scheduler: clock)
clock.perform([
    (0, { failingInput.send("draft") }),
    (100, { failingInput.send(completion: .failure(.diskFull)) }),
], until: 1_000)
assert(debouncedFailure.events == ["x(diskFull)@100"])
```

For a search field that is harmless: nobody needs results for a field that has closed. For autosave it is data loss. A note editor that debounces edits into a save and finishes its edit stream when the screen closes silently loses the last 300 ms of typing. The fix is to emit the last value on completion as well. `share()` lets the same upstream feed both `debounce` and `last()`, and `removeDuplicates()` stops the final value being saved twice when the pause was already long enough:

```swift
extension Publisher where Output: Equatable {
    /// Like `debounce`, but also emits the final value when the upstream finishes.
    func debounceKeepingLast<S: Scheduler>(
        for interval: S.SchedulerTimeType.Stride, scheduler: S
    ) -> AnyPublisher<Output, Failure> {
        let shared = share()
        return shared.debounce(for: interval, scheduler: scheduler)
            .merge(with: shared.last())
            .removeDuplicates()
            .eraseToAnyPublisher()
    }
}

let edits = PassthroughSubject<String, Never>()
let saves = TimelineRecorder(
    edits.debounceKeepingLast(for: .milliseconds(300), scheduler: clock), scheduler: clock)
clock.perform([
    (0, { edits.send("s") }),
    (100, { edits.send("sw") }),
    (200, { edits.send("swi") }),
    (250, { edits.send("swif") }),
    (700, { edits.send("swift") }),
    (800, { edits.send(completion: .finished) }),
], until: 2_000)
assert(saves.events == ["swif@550", "swift@800", "|@800"])

let quietEdits = PassthroughSubject<String, Never>()
let quietSaves = TimelineRecorder(
    quietEdits.debounceKeepingLast(for: .milliseconds(300), scheduler: clock), scheduler: clock)
clock.perform([
    (0, { quietEdits.send("done") }),
    (500, { quietEdits.send(completion: .finished) }),
], until: 2_000)
assert(quietSaves.events == ["done@300", "|@500"])   // not saved twice
```

The `removeDuplicates()` has a cost to be aware of: if the user types "a", pauses, deletes it and types "a" again, the second "a" is not emitted. For a save, skipping a write of identical content is what you want; for an operator used elsewhere, document it.

## `throttle`: at most one value per interval

`throttle(for:scheduler:latest:)` limits the rate of values instead of waiting for a pause. Its documentation describes it as publishing "either the most-recent or first element published by the upstream publisher in the specified time interval", and the `latest` flag picks which. The exact timing is clearer on a timeline. This script is a user tapping a button: a triple tap, a later burst of three, and a lone tap:

```swift
let tapScript: [(at: Int, value: String?)] = [
    (0, "1"), (100, "2"), (200, "3"),
    (1_100, "4"), (1_150, "5"), (1_300, "6"),
    (3_000, "7"), (3_500, nil),
]

func play(_ script: [(at: Int, value: String?)], into subject: PassthroughSubject<String, Never>,
          on scheduler: VirtualTimeScheduler, until end: Int) {
    scheduler.perform(script.map { step in
        (step.at, { if let value = step.value { subject.send(value) } else { subject.send(completion: .finished) } })
    }, until: end)
}

let tapsForFirst = PassthroughSubject<String, Never>()
let throttledFirst = TimelineRecorder(
    tapsForFirst.throttle(for: .seconds(1), scheduler: clock, latest: false), scheduler: clock)
play(tapScript, into: tapsForFirst, on: clock, until: 5_000)
assert(throttledFirst.events == ["1@0", "2@1000", "4@2000", "7@3000", "|@3500"])

let tapsForLatest = PassthroughSubject<String, Never>()
let throttledLatest = TimelineRecorder(
    tapsForLatest.throttle(for: .seconds(1), scheduler: clock, latest: true), scheduler: clock)
play(tapScript, into: tapsForLatest, on: clock, until: 5_000)
assert(throttledLatest.events == ["1@0", "3@1000", "6@2000", "7@3000", "|@3500"])
```

```text
time (s)        0.0  0.1  0.2       1.0  1.1  1.15  1.3       2.0       3.0       3.5
input           1    2    3              4    5     6                   7         |
latest: false   1                   2                         4         7         |
latest: true    1                   3                         6         7         |
```

The rules the timeline reveals:

1. A value that arrives when the throttle is idle is emitted immediately: `1` at 0 and `7` at 3.0.
2. Emitting starts an interval. Values that arrive during it are held, and at the end of the interval the first (`latest: false`) or last (`latest: true`) of them is emitted, which starts another interval.
3. An interval in which nothing arrives returns the throttle to idle.

So `latest: false` did not drop the second and third taps; it delivered tap `2`, 900 ms after it happened. A throttle is often added to a "Submit" button to prevent double submission, and with either setting a double tap still submits twice, the second time almost a second later, when the user has moved on. What that button needs is a *leading-edge* filter: accept a tap, then ignore everything for an interval. The scheduler's clock makes it a few lines, and `Deferred` gives each subscriber its own memory of the last accepted tap, for the reason explained in [Filtering](/combine-filter-removeduplicates-compactmap/):

```swift
extension Publisher {
    /// Emits a value, then ignores values until `interval` has passed. Nothing is delayed.
    func throttleLeading<S: Scheduler>(
        for interval: S.SchedulerTimeType.Stride, scheduler: S
    ) -> Deferred<Publishers.Filter<Self>> {
        Deferred {
            var lastAccepted: S.SchedulerTimeType?
            return self.filter { _ in
                let now = scheduler.now
                if let lastAccepted, lastAccepted.distance(to: now) < interval { return false }
                lastAccepted = now
                return true
            }
        }
    }
}

let tapsForLeading = PassthroughSubject<String, Never>()
let leading = TimelineRecorder(
    tapsForLeading.throttleLeading(for: .seconds(1), scheduler: clock), scheduler: clock)
play(tapScript, into: tapsForLeading, on: clock, until: 5_000)
assert(leading.events == ["1@0", "4@1100", "7@3000", "|@3500"])
```

Each accepted tap is delivered the moment it happens, and the extra taps are dropped rather than deferred.

The built-in `throttle` also treats completion differently from `debounce`: it holds the completion until the pending value has been emitted at the end of the interval:

```swift
let shortBurst = PassthroughSubject<String, Never>()
let throttledBurst = TimelineRecorder(
    shortBurst.throttle(for: .seconds(1), scheduler: clock, latest: true), scheduler: clock)
play([(0, "a"), (100, "b"), (200, nil)], into: shortBurst, on: clock, until: 2_000)
assert(throttledBurst.events == ["a@0", "b@1000", "|@1000"])   // completion waited for b
```

That is the right default for progress and scroll positions, where the final value is the one that matters, and `latest: true` is the setting to choose for them.

## `delay`: shift everything

`delay(for:scheduler:)` reschedules each value, and the completion, the given interval later. Unlike `debounce`, it delays failures too:

```swift
let delayedInput = PassthroughSubject<String, SaveError>()
let delayed = TimelineRecorder(
    delayedInput.delay(for: .milliseconds(200), scheduler: clock), scheduler: clock)
clock.perform([
    (0, { delayedInput.send("a") }),
    (50, { delayedInput.send(completion: .failure(.diskFull)) }),
], until: 1_000)
assert(delayed.events == ["a@200", "x(diskFull)@250"])
```

Its real-world uses are small: giving a spinner a minimum display time, spacing out a retry, or simulating latency in a preview or a test. It has one trap, which the series ran into while measuring `flatMap` in [Transforming: `map`, `flatMap`, and `scan`](/combine-map-flatmap-scan/): on a **concurrent** queue, it can lose values. This test delays a single value by one millisecond, 2,000 times, on a concurrent and then on a serial queue, and counts the runs that did not receive the value before the completion:

```swift
import Synchronization

final class EventLog: Sendable {
    private let storage = Mutex<[String]>([])
    func append(_ event: String) { storage.withLock { $0.append(event) } }
    var events: [String] { storage.withLock { $0 } }
}

nonisolated func countLostValues(on queue: DispatchQueue, runs: Int) -> Int {
    var lost = 0
    for run in 0..<runs {
        let log = EventLog()
        let finished = DispatchSemaphore(value: 0)
        let handle = Just(run)
            .delay(for: .milliseconds(1), scheduler: queue)
            .sink(receiveCompletion: { @Sendable _ in log.append("finished"); finished.signal() },
                  receiveValue: { @Sendable _ in log.append("value") })
        finished.wait()
        handle.cancel()
        if log.events != ["value", "finished"] { lost += 1 }
    }
    return lost
}

let lostOnConcurrent = countLostValues(on: DispatchQueue.global(), runs: 2_000)
let lostOnSerial = countLostValues(on: DispatchQueue(label: "delay.serial"), runs: 2_000)
print("lost on concurrent queue: \(lostOnConcurrent) of 2,000; on serial queue: \(lostOnSerial)")
assert(lostOnSerial == 0)
```

Across ten runs of this test, between 1 and 21 of the 2,000 attempts on `DispatchQueue.global()` received the completion without the value, and none of the attempts on the serial queue did. The pattern is consistent with the value and the completion being scheduled as separate blocks with the same deadline, which a concurrent queue is free to run in either order. The fix is to use a serial queue, or the main queue, for any time-based operator. The same applies to `debounce` and `throttle`, which also schedule separately from the values they receive.

## How many values get through

For random input, both operators have simple emission rates. Model the input as a Poisson process with rate $$\lambda$$ values per second, so gaps between values are exponentially distributed with mean $$1/\lambda$$.

**`debounce` with window $$w$$** emits a value exactly when the gap after it is longer than $$w$$. The probability of that is $$P(\text{gap} > w) = e^{-\lambda w}$$, so it emits at rate

$$
r_{\text{debounce}} = \lambda\, e^{-\lambda w}.
$$

The rate is not monotonic in $$\lambda$$: it peaks at $$\lambda = 1/w$$, at $$1/(e\,w)$$, and *falls* toward zero as input gets faster. A user who never pauses for $$w$$ never gets a result, which is why `debounce` windows for search are kept around 250 to 400 ms, shorter than a typical pause between words.

**`throttle` with interval $$T$$** emits on a cycle. After an emission, it waits $$T$$. If anything arrived in that time, probability $$1 - e^{-\lambda T}$$, it emits at the end and the next cycle starts at once; otherwise it goes idle and emits the next value on arrival, after a further exponential wait of mean $$1/\lambda$$. The mean cycle length is $$T + e^{-\lambda T}/\lambda$$, so

$$
r_{\text{throttle}} = \frac{1}{T + e^{-\lambda T}/\lambda},
$$

which approaches $$\lambda$$ for slow input and $$1/T$$ for fast input, as a rate limit should. The virtual scheduler makes checking both formulas instantaneous:

```swift
struct SplitMix64: RandomNumberGenerator {
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

struct RateResult {
    let emitted: Int
    let duration: Double
}

func simulate(rate: Double, windowMilliseconds: Int, count: Int, useThrottle: Bool) -> RateResult {
    let scheduler = VirtualTimeScheduler()
    var generator = SplitMix64(seed: 7)
    let input = PassthroughSubject<Int, Never>()
    let limited: AnyPublisher<Int, Never> = useThrottle
        ? input.throttle(for: .milliseconds(windowMilliseconds), scheduler: scheduler, latest: true).eraseToAnyPublisher()
        : input.debounce(for: .milliseconds(windowMilliseconds), scheduler: scheduler).eraseToAnyPublisher()
    var emitted = 0
    let handle = limited.sink { _ in emitted += 1 }
    var totalNanoseconds = 0
    for value in 0..<count {
        let gap = Int(-log(Double.random(in: 0..<1, using: &generator)) / rate * 1e9)
        totalNanoseconds += gap
        scheduler.advance(by: .nanoseconds(gap))
        input.send(value)
    }
    scheduler.advance(by: .seconds(10))
    handle.cancel()
    return RateResult(emitted: emitted, duration: Double(totalNanoseconds) / 1e9)
}

for (rate, window) in [(5.0, 300), (1.0, 1_000), (20.0, 100)] {
    let w = Double(window) / 1_000
    let debounceRun = simulate(rate: rate, windowMilliseconds: window, count: 20_000, useThrottle: false)
    let throttleRun = simulate(rate: rate, windowMilliseconds: window, count: 20_000, useThrottle: true)
    let predictedDebounce = 20_000 * exp(-rate * w)
    let predictedThrottle = throttleRun.duration / (w + exp(-rate * w) / rate)
    print("λ=\(rate)/s, window \(window) ms: debounce \(debounceRun.emitted) (predicted \(Int(predictedDebounce))), "
          + "throttle \(throttleRun.emitted) (predicted \(Int(predictedThrottle)))")
    assert(abs(Double(debounceRun.emitted) - predictedDebounce) / predictedDebounce < 0.05)
    assert(abs(Double(throttleRun.emitted) - predictedThrottle) / predictedThrottle < 0.05)
}
```

Twenty thousand random values per run, simulated in a fraction of a second:

| Input rate $$\lambda$$ | Window | `debounce` emitted | predicted $$n e^{-\lambda w}$$ | `throttle` emitted | predicted |
|---|---|---|---|---|---|
| 5 per s | 300 ms | 4,537 | 4,462 | 11,641 | 11,698 |
| 1 per s | 1,000 ms | 7,446 | 7,357 | 14,632 | 14,737 |
| 20 per s | 100 ms | 2,742 | 2,706 | 9,399 | 9,440 |

Both formulas hold to within 2%. The table also makes the difference between the operators concrete: at 20 values per second with a 100 ms window, `debounce` passed 14% of the input and `throttle` 47%, because `throttle` guarantees a steady trickle while `debounce` waits for pauses that rarely come.

## Putting it together: a search pipeline

A production search field combines the operators from the last few articles. Trim and deduplicate the text, wait for a pause, skip empty queries, and let each new query cancel the request for the previous one:

```swift
var requestsSent: [String] = []

@MainActor
func search(_ query: String, on scheduler: VirtualTimeScheduler) -> AnyPublisher<String, Never> {
    requestsSent.append(query)
    return Just("results for \(query)")
        .delay(for: .milliseconds(80), scheduler: scheduler)   // simulated server latency
        .eraseToAnyPublisher()
}

let searchClock = VirtualTimeScheduler()
let searchField = PassthroughSubject<String, Never>()
let searchResults = TimelineRecorder(
    searchField
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .removeDuplicates()
        .debounce(for: .milliseconds(300), scheduler: searchClock)
        .filter { !$0.isEmpty }
        .map { search($0, on: searchClock) }
        .switchToLatest(),
    scheduler: searchClock)

searchClock.perform([
    (0, { searchField.send("s") }),
    (100, { searchField.send("sw") }),
    (200, { searchField.send("swi") }),
    (250, { searchField.send("swif") }),
    (700, { searchField.send("swift") }),
    (750, { searchField.send("swift ") }),     // trailing space: same query after trimming
    (1_200, { searchField.send("") }),         // field cleared
], until: 3_000)

assert(requestsSent == ["swif", "swift"])
assert(searchResults.events == ["results for swif@630", "results for swift@1080"])
```

Seven edits became two requests. The trailing space was removed by trimming and `removeDuplicates`, and clearing the field produced no request at all. Each result arrived 80 ms after its debounced query: `swif` at 550 + 80 and `swift` at 1,000 + 80. The whole script, three seconds of user time, ran in microseconds and gives the same answer on every run, which is the payoff of injecting the scheduler.

Keep the recorders alive until the end of the file:

```swift
withExtendedLifetime((debounced, debouncedFailure, saves, quietSaves, throttledFirst,
                      throttledLatest, leading, throttledBurst, delayed, searchResults)) {}
```

## Summary

- Time-based operators take a scheduler; a `VirtualTimeScheduler` that runs scheduled closures when a test advances its clock makes their behavior exact and instantaneous to check, and matched a real serial queue except for 1% to 4% timer leeway.
- `debounce` emits the latest value after a quiet interval. On completion or failure it forwards the event immediately and **drops** the pending value; `debounceKeepingLast` emits it, which autosave needs.
- `throttle` emits immediately when idle, then the first or latest value at the end of each busy interval, and holds completion until the pending value is out. With either setting, a double tap is delivered twice; use a leading-edge filter for buttons.
- `delay` shifts values, completion, and failure. On a concurrent queue, it lost the value in up to 1% of attempts, and never on a serial queue; use a serial queue for every time-based operator.
- For Poisson input at rate $$\lambda$$, `debounce` emits at $$\lambda e^{-\lambda w}$$, which falls as input speeds up, and `throttle` at $$1/(T + e^{-\lambda T}/\lambda)$$, approaching $$1/T$$. Simulations agreed within 2%.

## Exercise

Add `timeout(_:scheduler:customError:)` to the search pipeline so that a request that takes longer than 500 ms produces a "slow network" result instead of nothing, without failing the outer stream. Test it with the virtual scheduler: a fast response, a slow response that is replaced by a newer query before the timeout, and a slow response that times out. Then use `measureInterval(using:)` on the raw keystrokes to compute the distribution of gaps in a recorded typing session, and use the `debounce` rate formula to choose the shortest window that would have sent fewer than one request per word.

## Further reading

- Apple's documentation for [`debounce(for:scheduler:options:)`](https://developer.apple.com/documentation/combine/publisher/debounce(for:scheduler:options:)), [`throttle(for:scheduler:latest:)`](https://developer.apple.com/documentation/combine/publisher/throttle(for:scheduler:latest:)), and the [`Scheduler`](https://developer.apple.com/documentation/combine/scheduler) protocol.
- Point-Free's [combine-schedulers](https://github.com/pointfreeco/combine-schedulers) library, whose `TestScheduler` is a fuller version of the virtual scheduler built here.
- The concurrency roadmap's [Testing Controlled Interleavings](/swift-testing-controlled-interleavings/), which applies the same "control the clock" idea to `async` code.

Previous: [Combining: `combineLatest`, `zip`, and `merge`](/combine-combinelatest-zip-merge/). Next: [Sequence Operators: `first`, `last`, and `collect`](/combine-first-last-collect/).

Return to the [Combine roadmap](/combine/).
