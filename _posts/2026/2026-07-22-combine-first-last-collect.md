---
layout: post
hidden: true
title: "Sequence Operators: first, last, and collect"
date: "2026-07-22"
last_modified_at: "2026-07-22"
permalink: /combine-first-last-collect/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Operators, Performance]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Most operators look at one value at a time. A second family looks at the stream as a whole, the way `Sequence` methods look at a whole collection: `first` and `contains` stop as soon as they have their answer, `last`, `reduce`, and `count` cannot answer until the stream ends, and `collect` gathers values into arrays, either all of them or in batches by count or by time. They are named after their `Sequence` counterparts and behave like them, with one difference that changes everything: a publisher may never end.

That difference produces this family's characteristic bugs. `$property.last()` and `subject.collect()` never emit, because their upstream never completes. `collect()` buffers everything it receives in the meantime. A batch in progress is emitted when the stream finishes but discarded when it fails. And the time-based `collect` uses fixed windows that a count-triggered flush does not reset. This article measures each of those behaviors, then works out what batching costs in latency and saves in requests, and checks the formulas with a simulation on the virtual-time scheduler from [Time: `debounce`, `throttle`, and `delay`](/combine-debounce-throttle-delay/).

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the `VirtualTimeScheduler` and `TimelineRecorder` from [the time operators article](/combine-debounce-throttle-delay/#a-scheduler-whose-clock-you-control) first, then the blocks below in order, into one `main.swift`.

<!-- check-uses: virtual-scheduler -->

## Operators that end early

`first()` takes the first value, finishes, and cancels its upstream so no more work is done. The order of those steps is worth seeing, because it is not the order most people guess:

```swift
var firstEvents: [String] = []
let liveValues = PassthroughSubject<Int, Never>()
let firstHandle = liveValues
    .handleEvents(receiveCancel: { firstEvents.append("upstream cancelled") })
    .first()
    .sink(receiveCompletion: { _ in firstEvents.append("finished") },
          receiveValue: { firstEvents.append("value \($0)") })
liveValues.send(1)
liveValues.send(2)
assert(firstEvents == ["upstream cancelled", "value 1", "finished"])
```

The upstream was cancelled *before* the value was delivered. By the time your `sink` sees the first value, the source has already been told to stop, which is what you want for an expensive source such as a network request or a location update. `first(where:)` does the same for the first value matching a predicate, and `contains(_:)`, `contains(where:)`, and `allSatisfy(_:)` stop at the first value that settles the answer:

```swift
var containsEvents: [String] = []
let containsHandle = (1...10).publisher
    .handleEvents(receiveOutput: { containsEvents.append("\($0)") },
                  receiveCancel: { containsEvents.append("cancel") })
    .contains(3)
    .sink { containsEvents.append("contains: \($0)") }
assert(containsEvents == ["1", "2", "3", "cancel", "contains: true"])

var allEvents: [String] = []
let allHandle = (1...10).publisher
    .handleEvents(receiveOutput: { allEvents.append("\($0)") },
                  receiveCancel: { allEvents.append("cancel") })
    .allSatisfy { $0 < 3 }
    .sink { allEvents.append("all below 3: \($0)") }
assert(allEvents == ["1", "2", "3", "cancel", "all below 3: false"])
```

Values 4 through 10 were never generated. If the upstream finishes before an answer is found, these operators answer from what they have: `first()` finishes without a value, `contains` emits `false`, and `allSatisfy` emits `true`:

```swift
var emptyFirst: [String] = []
let emptyFirstHandle = Empty<Int, Never>().first().sink(
    receiveCompletion: { _ in emptyFirst.append("finished") },
    receiveValue: { emptyFirst.append("value \($0)") })
assert(emptyFirst == ["finished"])            // no value: downstream must handle "nothing"
```

`first()` is also the idiomatic way to read the current value of a `CurrentValueSubject` or a `@Published` property as a one-shot publisher, for example to combine it with a request: `$selectedAccount.first().flatMap { load($0) }` loads once, for the account selected at that moment, and then the pipeline is done. Without `first()`, the same pipeline reloads on every change of account, which may be what you want, but should be a choice. `output(at:)`, `output(in:)`, and `prefix(_:)` complete the family; they also cancel upstream once they have what they need.

## Operators that wait for the end

`last()`, `reduce(_:_:)`, `count()`, `min()`, `max()`, and `collect()` can only answer when the upstream finishes. For a sequence or a network request, that is soon. For a subject, a `@Published` property, a notification, or a timer, it is never:

```swift
var lastOfLive: [Int] = []
let liveState = CurrentValueSubject<Int, Never>(1)
let lastHandle = liveState.last().sink { lastOfLive.append($0) }
liveState.send(2)
liveState.send(3)
assert(lastOfLive.isEmpty)                     // and it will stay empty
```

The code compiles, runs without error, and does nothing, which is why the bug survives. When you want "the latest value so far" from a live stream, that is not `last()` but the stream itself, or `CurrentValueSubject.value`.

`collect()` with no argument has a second cost: it buffers every value until completion, and it asks its upstream for all of them at once, with unlimited demand, regardless of what its own subscriber requested:

```swift
/// Requests one array and records it.
final class OneBatchSubscriber: Subscriber {
    typealias Input = [Int]
    typealias Failure = Never
    private(set) var batches: [[Int]] = []
    func receive(subscription: any Subscription) { subscription.request(.max(1)) }
    func receive(_ input: [Int]) -> Subscribers.Demand { batches.append(input); return .none }
    func receive(completion: Subscribers.Completion<Never>) {}
}

var collectAllRequests: [String] = []
let collectAllSubscriber = OneBatchSubscriber()
(1...10).publisher
    .handleEvents(receiveRequest: { collectAllRequests.append("\($0)") })
    .collect()
    .subscribe(collectAllSubscriber)
assert(collectAllRequests == ["unlimited"])
assert(collectAllSubscriber.batches == [Array(1...10)])
```

That is the right behavior for gathering a finite result, such as all pages of a paginated response into one array, and a memory leak for anything open-ended.

## Batches by count

`collect(_ count:)` emits arrays of up to `count` values. It is demand-aware: for each array its subscriber requests, it requests `count` values from upstream. When the upstream finishes, the partial batch is emitted. When the upstream **fails**, the partial batch is discarded:

```swift
var countRequests: [String] = []
let countSubscriber = OneBatchSubscriber()
(1...10).publisher
    .handleEvents(receiveRequest: { countRequests.append("\($0)") })
    .collect(3)
    .subscribe(countSubscriber)
assert(countRequests == ["max(3)"])           // one batch requested, three values pulled
assert(countSubscriber.batches == [[1, 2, 3]])

var finishedBatches: [[Int]] = []
let finishedBatchHandle = (1...7).publisher.collect(3).sink { finishedBatches.append($0) }
assert(finishedBatches == [[1, 2, 3], [4, 5, 6], [7]])   // the partial batch is kept

enum StreamError: Error { case lost }
let failingEvents = PassthroughSubject<Int, StreamError>()
var failedBatches: [String] = []
let failedBatchHandle = failingEvents.collect(3).sink(
    receiveCompletion: { if case .failure = $0 { failedBatches.append("failed") } },
    receiveValue: { failedBatches.append("\($0)") })
(1...4).forEach(failingEvents.send)
failingEvents.send(completion: .failure(.lost))
assert(failedBatches == ["[1, 2, 3]", "failed"])   // event 4 is gone
```

For an analytics pipeline, the failure case is the one to design around: if the event stream can fail, every event in the current batch is lost with it. Keep the stream feeding a batcher non-failing, handling errors upstream, so that batches end only by count, time, or a clean finish.

## Batches by time

`collect(_:options:)` with a `TimeGroupingStrategy` batches by time instead. `.byTime(scheduler, interval)` emits whatever has arrived in each interval; `.byTimeOrCount(scheduler, interval, count)` also emits early when a batch reaches `count`. The virtual scheduler shows exactly where the window boundaries fall:

```swift
let clock = VirtualTimeScheduler()

let timedEvents = PassthroughSubject<String, Never>()
let timedBatches = TimelineRecorder(
    timedEvents.collect(.byTime(clock, .seconds(1))).map { $0.joined() }, scheduler: clock)
clock.perform([
    (100, { timedEvents.send("a") }),
    (300, { timedEvents.send("b") }),
    (1_500, { timedEvents.send("c") }),
    (3_900, { timedEvents.send("d") }),
    (4_200, { timedEvents.send("e") }),
    (4_300, { timedEvents.send(completion: .finished) }),
], until: 6_000)
assert(timedBatches.events == ["ab@1000", "c@2000", "d@4000", "e@4300", "|@4300"])
```

```text
time (s)    0      1      2      3      4      5
input        a b      c                d  e |
windows     [------)[------)[------)[------)[--
output             ab     c      (none)  d  e|
```

The windows are fixed, one second apart from the moment of subscription, not from the first value. A window with no values emits nothing, rather than an empty array, so the window from 2 to 3 seconds produced no output. On completion the partial batch `e` was emitted at once; on failure it would be discarded, as with `collect(_ count:)`.

With a count limit, a full batch is emitted as soon as it fills, but the time windows keep their original schedule:

```swift
let mixedEvents = PassthroughSubject<String, Never>()
let mixedBatches = TimelineRecorder(
    mixedEvents.collect(.byTimeOrCount(clock, .seconds(1), 2)).map { $0.joined() }, scheduler: clock)
clock.perform([
    (100, { mixedEvents.send("a") }),
    (200, { mixedEvents.send("b") }),          // count reached: emit now
    (300, { mixedEvents.send("c") }),
    (1_500, { mixedEvents.send("d") }),
    (1_600, { mixedEvents.send("e") }),        // count reached
    (1_700, { mixedEvents.send("f") }),
    (2_500, { mixedEvents.send(completion: .finished) }),
], until: 6_000)
assert(mixedBatches.events == ["ab@200", "c@1000", "de@1600", "f@2000", "|@2500"])
```

The batch `c` was emitted at 1 second although it started at 300 ms: the count flush at 200 ms did not restart the timer. The longest an event can wait is therefore one interval, and a batch that begins just after a count flush is cut short, which is fine for analytics and surprising if you expected each batch to cover a full interval.

## What batching costs and saves

Batching trades latency for fewer requests. With events arriving at rate $$\lambda$$ per second, the two pure strategies have simple costs.

**By count, $$N$$ per batch.** A batch is sent every $$N$$ events, so the request rate is $$\lambda / N$$. Within a batch, the $$i$$th event waits for $$N - i$$ more arrivals, each taking $$1/\lambda$$ on average, so the mean added latency is

$$
\bar{L}_{\text{count}} = \frac{1}{N}\sum_{i=1}^{N} \frac{N - i}{\lambda} = \frac{N-1}{2\lambda}.
$$

**By time, interval $$T$$.** Each event waits until the end of its window, on average $$T/2$$. A request is sent for every window that contains at least one event, which for Poisson arrivals is a fraction $$1 - e^{-\lambda T}$$ of windows, so the request rate is $$(1 - e^{-\lambda T})/T$$.

The two strategies fail in opposite directions. Count batching has unbounded latency when traffic is slow: at one event per minute, $$N = 10$$ holds the first event for nine minutes. Time batching sends many tiny requests when traffic is fast. `byTimeOrCount` caps both: latency is at most $$T$$, and requests are at most one per $$N$$ events plus one per window. A simulation on the virtual scheduler, with each event carrying the time at which it was sent, checks the formulas in two regimes:

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

struct BatchingResult {
    let batchesPerSecond: Double
    let meanLatency: Double
    let maxLatency: Double
}

func simulateBatching(rate: Double, count: Int, interval: Int?, events: Int) -> BatchingResult {
    let scheduler = VirtualTimeScheduler()
    var generator = SplitMix64(seed: 11)
    let input = PassthroughSubject<VirtualTimeScheduler.SchedulerTimeType, Never>()
    let batched: AnyPublisher<[VirtualTimeScheduler.SchedulerTimeType], Never> = if let interval {
        input.collect(.byTimeOrCount(scheduler, .milliseconds(interval), count)).eraseToAnyPublisher()
    } else {
        input.collect(count).eraseToAnyPublisher()
    }
    var batches = 0
    var latencies: [Double] = []
    let handle = batched.sink { batch in
        batches += 1
        latencies += batch.map { Double($0.distance(to: scheduler.now).magnitude) / 1e9 }
    }
    let start = scheduler.now
    for _ in 0..<events {
        let gap = Int(-log(Double.random(in: 0..<1, using: &generator)) / rate * 1e9)
        scheduler.advance(by: .nanoseconds(gap))
        input.send(scheduler.now)
    }
    let duration = Double(start.distance(to: scheduler.now).magnitude) / 1e9
    input.send(completion: .finished)
    handle.cancel()
    return BatchingResult(batchesPerSecond: Double(batches) / duration,
                          meanLatency: latencies.reduce(0, +) / Double(latencies.count),
                          maxLatency: latencies.max() ?? 0)
}

// Fast traffic: 20 events per second, batches of 10.
let fastCount = simulateBatching(rate: 20, count: 10, interval: nil, events: 20_000)
assert(abs(fastCount.batchesPerSecond - 20.0 / 10) < 0.05)
assert(abs(fastCount.meanLatency - 9.0 / 40) < 0.01)            // (N - 1) / (2λ) = 0.225 s

// Slow traffic: 2 events per second, batches of 10 or 1 second, whichever comes first.
let slowCount = simulateBatching(rate: 2, count: 10, interval: nil, events: 20_000)
let slowCapped = simulateBatching(rate: 2, count: 10, interval: 1_000, events: 20_000)
assert(abs(slowCount.meanLatency - 9.0 / 4) < 0.05)              // 2.25 s without a time cap
assert(slowCapped.maxLatency <= 1.0)
assert(abs(slowCapped.meanLatency - 0.5) < 0.05)                 // about T / 2
assert(abs(slowCapped.batchesPerSecond - (1 - exp(-2.0))) < 0.03)
print(String(format: "fast count: %.3f batches/s, %.3f s mean | slow count: %.3f s mean, %.2f s max | slow capped: %.3f batches/s, %.3f s mean, %.3f s max",
             fastCount.batchesPerSecond, fastCount.meanLatency, slowCount.meanLatency, slowCount.maxLatency,
             slowCapped.batchesPerSecond, slowCapped.meanLatency, slowCapped.maxLatency))
```

The run printed:

| Traffic | Strategy | Batches per second | Mean latency | Max latency |
|---|---|---|---|---|
| 20 per s | 10 per batch | 2.018 (predicted 2) | 0.224 s (predicted 0.225) | |
| 2 per s | 10 per batch | | 2.237 s (predicted 2.25) | 11.53 s |
| 2 per s | 10 per batch or 1 s | 0.869 (predicted 0.865) | 0.499 s (predicted about 0.5) | 1.000 s |

At two events per second, count batching alone held events for 2.24 seconds on average and more than 11 seconds at worst; adding a one-second cap brought the worst case to exactly one second, while still sending fewer than half as many requests as one per event would. The same reasoning applies to log shipping, telemetry, and writes coalesced to a database: pick $$T$$ from the latency you can tolerate and $$N$$ from the largest request the server accepts, and the formulas tell you the request rate you will pay.

Keep the remaining subscriptions alive until the end of the file:

```swift
withExtendedLifetime((firstHandle, containsHandle, allHandle, emptyFirstHandle, lastHandle,
                      finishedBatchHandle, failedBatchHandle, timedBatches, mixedBatches)) {}
```

## Summary

- `first`, `first(where:)`, `contains`, and `allSatisfy` end early and cancel upstream; `first()` cancelled its upstream before delivering the value. On an empty upstream they answer with no value, `false`, and `true` respectively.
- `last`, `reduce`, `count`, and `collect()` wait for completion and never emit for a subject or `@Published` property. `collect()` requests unlimited demand and buffers everything.
- `collect(n)` requests `n` values per batch, emits a partial batch on finish, and **discards** it on failure; keep batched streams non-failing.
- `collect(.byTime)` uses fixed windows from subscription, skips empty windows, and flushes on finish. In `byTimeOrCount`, a count flush does not restart the timer, so latency is capped at one interval.
- Batching by count costs $$(N-1)/(2\lambda)$$ seconds of latency on average and sends $$\lambda/N$$ requests per second; by time it costs about $$T/2$$ and sends $$(1 - e^{-\lambda T})/T$$. The simulations matched every prediction within 1%.

## Exercise

Build an `AnalyticsUploader` that accepts events through a `PassthroughSubject`, batches them with `collect(.byTimeOrCount(_:_:_:))`, and uploads each batch with `flatMap(maxPublishers: .max(1))` so uploads never overlap. Simulate an upload that fails one time in four, and make the uploader re-queue the events of a failed batch instead of losing them, without letting the failure reach the batching stage. Test with the virtual scheduler that no event is ever lost or uploaded twice, and add a `flush()` method, for when the app moves to the background, that uploads whatever is pending immediately. Measure how `flush()` changes the maximum latency in the slow-traffic case above.

## Further reading

- Apple's documentation for [`collect(_:options:)`](https://developer.apple.com/documentation/combine/publisher/collect(_:options:)), [`Publishers.TimeGroupingStrategy`](https://developer.apple.com/documentation/combine/publishers/timegroupingstrategy), and [`first()`](https://developer.apple.com/documentation/combine/publisher/first()).
- The networking roadmap's [Pagination: Page Numbers, Cursors, and Stable Ordering](/swift-pagination-cursors/), where gathering every page into one array is a legitimate use of an operator that waits for completion.
- Leonard Kleinrock, *Queueing Systems, Volume 1: Theory*, for the Poisson-process reasoning behind the batching formulas.

Previous: [Time: `debounce`, `throttle`, and `delay`](/combine-debounce-throttle-delay/). Next: [Networking with `URLSession` Publishers](/combine-urlsession-publishers/).

Return to the [Combine roadmap](/combine/).
