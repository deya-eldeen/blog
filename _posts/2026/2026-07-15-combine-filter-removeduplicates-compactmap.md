---
layout: post
hidden: true
title: "Filtering: filter, removeDuplicates, and compactMap"
date: "2026-07-15"
last_modified_at: "2026-07-15"
permalink: /combine-filter-removeduplicates-compactmap/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Operators, Performance]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Filtering operators decide which values get through. `filter` keeps the values that satisfy a predicate. `compactMap` transforms each value and drops the ones that become `nil`. `removeDuplicates` drops a value that is equal to the one before it. Between them they handle most of the "only react when something actually changed" logic in an app: ignore empty queries, skip unparseable messages, and stop a view from re-rendering when a poll returns the same data.

They look stateless and simple, and three details make them less so. Dropping a value has to be paid for with demand, and `filter` does that accounting for you. `removeDuplicates` compares each value with the last value it *emitted*, not the last one it received, which decides whether a tolerance-based comparison can miss a slow drift. And any state you add yourself, such as a set of values already seen, is shared by every subscriber unless you create it per subscription. This article measures all three, works out when `removeDuplicates` actually saves anything, and times what equality costs for large values.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift`.

## `filter` and demand

`filter` passes a value downstream when its predicate returns `true`. When the predicate returns `false`, the value is gone, but the subscriber's demand has not been used, so `filter` asks its upstream for one more. A subscriber that requests exactly two values from a filtered sequence shows the accounting, with `handleEvents` logging what crosses the boundary above the filter:

```swift
import Combine
import Foundation

/// Requests a fixed number of values once and records what it receives.
final class FixedDemandSubscriber<Input>: Subscriber {
    typealias Failure = Never
    private let demand: Int
    private(set) var received: [Input] = []

    init(demand: Int) { self.demand = demand }
    func receive(subscription: any Subscription) { subscription.request(.max(demand)) }
    func receive(_ input: Input) -> Subscribers.Demand { received.append(input); return .none }
    func receive(completion: Subscribers.Completion<Never>) {}
}

var aboveFilter: [String] = []
let multiplesOfFour = FixedDemandSubscriber<Int>(demand: 2)
(1...10).publisher
    .handleEvents(receiveOutput: { aboveFilter.append("value \($0)") },
                  receiveRequest: { aboveFilter.append("request \($0)") })
    .filter { $0.isMultiple(of: 4) }
    .subscribe(multiplesOfFour)

assert(multiplesOfFour.received == [4, 8])
assert(aboveFilter == [
    "request max(2)",
    "value 1", "request max(1)",
    "value 2", "request max(1)",
    "value 3", "request max(1)",
    "value 4",
    "value 5", "request max(1)",
    "value 6", "request max(1)",
    "value 7", "request max(1)",
    "value 8",
])
```

The upstream produced eight values for a demand of two, because six were rejected, and it stopped at 8: values 9 and 10 were never generated. That is what makes filtering composable with backpressure. If the upstream is expensive, such as rows read from a database on request, the subscriber's demand still limits how much work is done, and it is measured in *accepted* values. If the upstream is a subject, which ignores demand, the extra requests are harmless.

The predicate cannot throw. `tryFilter` is the throwing version, and a thrown error ends the stream with an `any Error` failure, as with `tryMap` in [Transforming: `map`, `flatMap`, and `scan`](/combine-map-flatmap-scan/).

## `compactMap`: transform and drop

`compactMap` is `map` followed by "drop `nil`", and it requests more from upstream for each dropped value in the same way:

```swift
let compactSubscriber = FixedDemandSubscriber<Int>(demand: 2)
var compactRequests: [String] = []
(1...10).publisher
    .handleEvents(receiveRequest: { compactRequests.append("\($0)") })
    .compactMap { $0.isMultiple(of: 3) ? $0 * 10 : nil }
    .subscribe(compactSubscriber)
assert(compactSubscriber.received == [30, 60])
assert(compactRequests == ["max(2)", "max(1)", "max(1)", "max(1)", "max(1)"])
```

Its common use is parsing, where a failed conversion returns `nil`. That convenience is also its danger: a `compactMap` over `try?` drops malformed input without a trace. Compare the three ways to handle a feed of messages where one is malformed:

```swift
struct ChatMessage: Decodable, Equatable {
    let id: Int
    let text: String
}

let rawMessages = [
    #"{"id": 1, "text": "hi"}"#,
    #"{"id": 2, "txt": "typo in the key"}"#,
    #"{"id": 3, "text": "still here"}"#,
].map { Data($0.utf8) }

let decoder = JSONDecoder()

// 1. tryMap: the first bad message ends the stream.
var strictMessages: [Int] = []
var strictFailed = false
let strictHandle = rawMessages.publisher
    .tryMap { try decoder.decode(ChatMessage.self, from: $0) }
    .sink(receiveCompletion: { if case .failure = $0 { strictFailed = true } },
          receiveValue: { strictMessages.append($0.id) })
assert(strictMessages == [1] && strictFailed)

// 2. compactMap with try?: the bad message disappears silently.
var lenientMessages: [Int] = []
let lenientHandle = rawMessages.publisher
    .compactMap { try? decoder.decode(ChatMessage.self, from: $0) }
    .sink { lenientMessages.append($0.id) }
assert(lenientMessages == [1, 3])

// 3. compactMap that records what it drops.
var recordedMessages: [Int] = []
var droppedReasons: [String] = []
let recordedHandle = rawMessages.publisher
    .compactMap { data -> ChatMessage? in
        do {
            return try decoder.decode(ChatMessage.self, from: data)
        } catch {
            droppedReasons.append(String(describing: type(of: error)))
            return nil
        }
    }
    .sink { recordedMessages.append($0.id) }
assert(recordedMessages == [1, 3])
assert(droppedReasons == ["DecodingError"])
```

For a live chat feed, the second and third behaviors are both reasonable, because one bad message should not take down the connection. Only the third leaves evidence. In production that closure would log the error with the networking roadmap's [redaction rules](/swift-redacting-network-logs/) and increment a counter, so that a server change that breaks every message shows up as a spike rather than an empty screen.

`replaceNil(with:)` is the opposite choice, substituting a default instead of dropping. It has a quirk worth knowing: on a `Publishers.Sequence`, it is overloaded to return another sequence publisher whose output is still optional, while on every other publisher it unwraps the output:

```swift
let replacedInSequence = [1, nil, 3].publisher.replaceNil(with: 0)
assert(type(of: replacedInSequence) == Publishers.Sequence<[Int?], Never>.self)   // still Int?

let replacedInPipeline = PassthroughSubject<Int?, Never>().replaceNil(with: 0)
assert(type(of: replacedInPipeline) == Publishers.Map<PassthroughSubject<Int?, Never>, Int>.self)
```

That difference is invisible until a test built on an array publisher fails to compile against code written for a subject, or the reverse.

## `removeDuplicates` compares with the last emitted value

`removeDuplicates()` drops a value equal to its predecessor. It removes *consecutive* duplicates only, so it is not a "distinct" operator:

```swift
var consecutive: [Int] = []
let consecutiveHandle = [1, 1, 2, 2, 1, 3, 3].publisher
    .removeDuplicates()
    .sink { consecutive.append($0) }
assert(consecutive == [1, 2, 1, 3])            // the second 1 is not adjacent to the first
```

The predicate version, `removeDuplicates(by:)`, lets you define "the same", which is useful when values carry fields that change without mattering, such as a timestamp. The question is: the same as *what*? Logging the predicate's arguments answers it:

```swift
var predicateArguments: [String] = []
let argumentsHandle = [1, 2, 3].publisher
    .removeDuplicates { previous, current in
        predicateArguments.append("(\(previous), \(current))")
        return true                              // treat everything as a duplicate
    }
    .sink { _ in }
assert(predicateArguments == ["(1, 2)", "(1, 3)"])
```

When the predicate says "duplicate", the remembered value stays the same. The comparison is always against the last value that was *emitted*. That matters for tolerance-based comparisons, where "close enough" is not transitive. A sensor that drifts slowly by 0.4 per step never moves 0.5 away from its immediate predecessor, but it does move away from the last value emitted:

```swift
var drifting: [Double] = []
let driftHandle = [0.0, 0.4, 0.8, 1.2, 1.6, 2.0].publisher
    .removeDuplicates { abs($0 - $1) < 0.5 }
    .sink { drifting.append($0) }
assert(drifting == [0.0, 0.8, 1.6])            // the drift is reported every 0.8
```

If `removeDuplicates` compared adjacent received values, this stream would have emitted only `0.0` and then gone silent while the real value climbed to 2.0. Comparing against the emitted value gives the useful guarantee: the last emitted value is always within the tolerance of the current one, so the screen is never more than one tolerance step wrong.

### When deduplication saves anything

`removeDuplicates` helps only as much as consecutive repeats are common. If each value is drawn independently from categories with probabilities $$p_1, \ldots, p_k$$, a value repeats its predecessor with probability $$\sum_i p_i^2$$, so of $$n$$ values the expected number emitted is

$$
E[\text{emitted}] \;=\; 1 + (n - 1)\left(1 - \sum_{i=1}^{k} p_i^2\right).
$$

For four equally likely values that is $$1 + (n-1)\cdot\tfrac{3}{4}$$: deduplication removes only a quarter of the traffic. A seeded simulation agrees:

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

var generator = SplitMix64(seed: 42)
let randomStates = (0..<10_000).map { _ in Int.random(in: 0..<4, using: &generator) }
var randomEmitted = 0
let randomHandle = randomStates.publisher.removeDuplicates().sink { _ in randomEmitted += 1 }
let predicted = 1 + Double(randomStates.count - 1) * 0.75
assert(abs(Double(randomEmitted) - predicted) / predicted < 0.02)
print("emitted \(randomEmitted) of 10,000, predicted \(Int(predicted))")
```

The run emitted 7,479 of 10,000 against a prediction of 7,500; the generator is seeded, so the number is the same on every run. State in an app does not usually behave like that: a poll of an order status returns `processing` fifty times before `shipped`, and `@Published` emits on every assignment even when nothing changed, as [`@Published` Properties](/combine-published-properties/) measured. For slowly changing state, deduplication removes nearly everything, which is where it belongs: directly before the expensive subscriber, such as a view update or a disk write.

### What equality costs

`removeDuplicates()` calls `==` once per value, so its cost is the cost of comparing two values of your type. For a struct containing a large array, that can be cheap or expensive depending on where the array came from. Swift's `Array` equality first checks whether both arrays share the same storage and returns `true` immediately if they do; only distinct storage forces an element-by-element comparison:

```swift
let largeList = Array(0..<1_000_000)
let sharedCopy = largeList                     // same storage
var separateCopy = largeList
separateCopy[0] = 0                            // equal contents, separate storage

let clock = ContinuousClock()
func averageTime(of comparison: () -> Bool) -> Duration {
    let start = clock.now
    for _ in 0..<20 { precondition(comparison()) }
    return (clock.now - start) / 20
}
let sharedTime = averageTime { largeList == sharedCopy }
let separateTime = averageTime { largeList == separateCopy }
print("shared storage: \(sharedTime), separate storage: \(separateTime)")
assert(separateTime > sharedTime * 100)
```

In an optimized build, comparing the arrays with shared storage took about 2.5 nanoseconds, and comparing the separate but equal arrays took about 400 microseconds; this unoptimized check showed a gap of four orders of magnitude as well. For a state struct that is copied and lightly modified, the large unchanged fields share storage and deduplication is almost free. For state rebuilt from scratch, such as every poll decoding a fresh response into new arrays, every comparison walks all the elements, on whichever thread the pipeline runs. If that is the main thread, a 10,000-row response compared every second costs real frame time, and a cheaper identity, such as a server-provided version or `ETag`, makes a better key for `removeDuplicates(by:)`. The networking roadmap's [HTTP Caching with `Cache-Control` and `ETag`](/swift-http-caching-etag/) covers getting one.

## State in a filter belongs to one subscription

Combine has no operator that removes duplicates across a whole stream. The obvious way to write one is a `filter` that remembers what it has seen:

```swift
var seenEverywhere = Set<Int>()
let sharedStateDistinct = [1, 2, 2, 3].publisher
    .handleEvents()                              // avoid the eager Sequence overload of filter
    .filter { seenEverywhere.insert($0).inserted }

var firstSubscriberSaw: [Int] = []
var secondSubscriberSaw: [Int] = []
let firstSharedHandle = sharedStateDistinct.sink { firstSubscriberSaw.append($0) }
let secondSharedHandle = sharedStateDistinct.sink { secondSubscriberSaw.append($0) }
assert(firstSubscriberSaw == [1, 2, 3])
assert(secondSubscriberSaw == [])               // everything was already "seen"
```

The set belongs to the closure, the closure belongs to the publisher, and every subscription to the publisher uses the same closure, so the second subscriber's values were all rejected. The bug is easy to miss because most pipelines have a single subscriber until someone adds a second, for example a debugging `sink`, or a retry, which resubscribes. (The `handleEvents()` is there because, as [Publishers, Subscribers, and Subscriptions](/combine-publishers-subscribers-subscriptions/) showed, `filter` on a sequence publisher runs eagerly, once, when the operator is applied.)

The fix is to create the state per subscription, which is exactly what `Deferred` is for: its closure runs once for each subscriber:

```swift
extension Publisher where Output: Hashable {
    /// Drops any value already emitted to this subscriber, not just consecutive repeats.
    func uniqued() -> Deferred<Publishers.Filter<Self>> {
        Deferred {
            var seen = Set<Output>()             // created for each subscription
            return self.filter { seen.insert($0).inserted }
        }
    }
}

let perSubscriber = [1, 2, 2, 3, 1].publisher.handleEvents().uniqued()
var firstUniqued: [Int] = []
var secondUniqued: [Int] = []
let firstUniquedHandle = perSubscriber.sink { firstUniqued.append($0) }
let secondUniquedHandle = perSubscriber.sink { secondUniqued.append($0) }
assert(firstUniqued == [1, 2, 3] && secondUniqued == [1, 2, 3])
```

The `seen` set grows with every distinct value, so for an unbounded stream, such as message IDs on a long-lived socket, it is a slow memory leak. Bound it by what you actually need: if the server can redeliver a message only within the last few hundred, keep a fixed-size window of recent IDs instead of a set of all of them.

## The rest of the filtering family

The other filtering operators follow the same demand rules and differ only in their predicate:

| Operator | Drops | Notes |
|---|---|---|
| `filter`, `tryFilter` | values failing a predicate | requests a replacement per drop |
| `compactMap`, `tryCompactMap` | values mapped to `nil` | silent unless you record drops |
| `removeDuplicates`, `removeDuplicates(by:)` | values equal to the last emitted | consecutive only |
| `replaceNil(with:)` | nothing; substitutes a default | keeps `Optional` on sequence publishers |
| `ignoreOutput()` | every value | keeps only the completion |
| `dropFirst(_:)`, `drop(while:)` | a prefix of the stream | `dropFirst()` skips `@Published`'s initial value |
| `drop(untilOutputFrom:)` | values before another publisher emits | e.g. ignore input until a view appears |
| `prefix(_:)`, `prefix(while:)`, `prefix(untilOutputFrom:)` | everything after a point | completes the stream and cancels upstream |

The `prefix` family belongs with the sequence operators covered in [Sequence Operators: `first`, `last`, and `collect`](/combine-first-last-collect/), because ending the stream changes what happens upstream.

Keep the remaining subscriptions alive until the end of the file:

```swift
withExtendedLifetime((strictHandle, lenientHandle, recordedHandle, consecutiveHandle,
                      argumentsHandle, driftHandle, randomHandle, firstSharedHandle,
                      secondSharedHandle, firstUniquedHandle, secondUniquedHandle)) {}
```

## Summary

- `filter` and `compactMap` request one more value from upstream for each value they drop; with a demand of two, the upstream produced exactly eight values and stopped.
- `compactMap` with `try?` drops malformed input silently. Record what it drops, or use `tryMap` when one bad value should end the stream.
- `replaceNil(with:)` keeps an optional output type on sequence publishers and unwraps it everywhere else.
- `removeDuplicates` removes consecutive duplicates only, and compares with the last *emitted* value: a 0.4-per-step drift with a 0.5 tolerance was reported every 0.8.
- With independent values, deduplication emits $$1 + (n-1)(1 - \sum p_i^2)$$ of $$n$$; measured 7,479 of 10,000 against 7,500 predicted. It pays off for slowly changing state.
- Equality of large arrays is constant-time when storage is shared and linear otherwise; measured 2.5 ns against 400 µs for a million elements.
- State captured by a filter closure is shared by every subscriber; create it per subscription with `Deferred`, and bound it.

## Exercise

Write a `removeDuplicates(within:)` operator for `Double` that treats values within a tolerance as duplicates and also emits a value whenever more than a given interval has passed since the last emission, so that a stuck sensor still produces a heartbeat. Inject a clock so the test can control time. Test the drift case from this article, a stream of identical values that must produce exactly one heartbeat per interval, and a burst of different values within one interval. Then explain in a comment why the operator must compare against the last emitted value rather than the last received one, using the drift test as the counterexample.

## Further reading

- Apple's documentation for [`filter(_:)`](https://developer.apple.com/documentation/combine/publisher/filter(_:)), [`compactMap(_:)`](https://developer.apple.com/documentation/combine/publisher/compactmap(_:)), and [`removeDuplicates(by:)`](https://developer.apple.com/documentation/combine/publisher/removeduplicates(by:)).
- The Swift standard library's [`Array` equality implementation](https://github.com/swiftlang/swift/blob/main/stdlib/public/core/Array.swift), which checks for shared storage before comparing elements.
- [Combine in Practice](https://developer.apple.com/videos/play/wwdc2019/721/), WWDC19, which uses `removeDuplicates` and `filter` to validate a form.

Previous: [Transforming: `map`, `flatMap`, and `scan`](/combine-map-flatmap-scan/). Next: [Combining: `combineLatest`, `zip`, and `merge`](/combine-combinelatest-zip-merge/).

Return to the [Combine roadmap](/combine/).
