---
layout: post
hidden: true
title: "map, filter, and reduce in Swift: Choose the Operation That Matches the Result"
date: "2023-04-20"
last_modified_at: "2023-04-20"
permalink: /swift-map-filter-reduce/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Collections, Performance]
thumbnail: assets/img/article-placeholder.svg
---
`map` transforms each element, `filter` selects elements, and `reduce` combines a sequence into an accumulated result. Their names are familiar, but choosing between them affects more than style: output size, intermediate allocation, ordering, and short-circuiting all follow from that choice.

We will build a reading-session report, then examine when a loop or a more specific sequence operation is clearer and cheaper.

<!--more-->

The examples use Swift 5.7. Durations are validated nonnegative integers measured in minutes, and the demonstration totals fit in `Int`.

## map preserves one result per input

```swift
struct ReadingSession {
    let category: String
    let minutes: Int
    let completed: Bool
}

let sessions = [
    ReadingSession(category: "Swift", minutes: 20, completed: true),
    ReadingSession(category: "Design", minutes: 15, completed: false),
    ReadingSession(category: "Swift", minutes: 10, completed: true),
    ReadingSession(category: "Testing", minutes: 30, completed: true)
]

let durations = sessions.map { $0.minutes }
assert(durations == [20, 15, 10, 30])
assert(durations.count == sessions.count)
```

For the eager array operation here, mapping visits every element and returns an array in the input's traversal order. A transformation can change the element type, but it still produces one output per input.

Use that cardinality to review code. If a closure sometimes returns `nil`, `map` produces an array of optionals; it does not remove those entries. If a closure returns an array, `map` produces nested arrays; it does not flatten them.

Mapping is for producing values. If the real purpose is to send notifications or write records and the results are discarded, a loop usually describes the work more honestly. The name `map` does not make a closure's effects disappear.

## filter keeps the original elements

```swift
let completed = sessions.filter { $0.completed }
assert(completed.map { $0.minutes } == [20, 10, 30])
assert(completed.count == 3)
```

Filtering returns zero or more original elements in their traversal order. It does not transform the surviving values. A predicate should answer one question clearly; a long closure mixing validation, mutation, and logging deserves its own design discussion.

The output can be empty even when the input is nonempty. If empty means an error in the domain, represent that after selection rather than assuming `first!` must succeed.

Also distinguish array order from ordering guarantees of the source. Mapping or filtering a dictionary follows its traversal, which is not a business-defined ranking. Sort explicitly when the result has a presentation or export order.

## reduce needs an initial meaning

```swift
let completedMinutes = completed.reduce(0) { total, session in
    total + session.minutes
}
assert(completedMinutes == 60)

let empty: [ReadingSession] = []
assert(empty.reduce(0) { $0 + $1.minutes } == 0)
```

The initial accumulator is the result for an empty sequence. For a sum, zero is an identity: adding it changes nothing. For multiplication the usual identity is one. Choosing the initial value carelessly creates bugs that only appear on empty input.

Not every reduction has a natural identity. For the maximum duration, use `max()` on the projected values and handle its optional result. A made-up starting value such as zero silently imposes a policy and may be wrong for other domains.

A reduction is ordered. Subtraction, string concatenation, and state-machine transitions depend on traversal order. A sum over exact bounded integers has useful algebraic properties; a floating-point sum can change with grouping because rounding is not associative.

## Use reduce(into:) for a mutable accumulator

```swift
struct ReadingSummary: Equatable {
    var totalMinutes = 0
    var sessionCount = 0
    var minutesByCategory: [String: Int] = [:]
}

func summarize(_ sessions: [ReadingSession]) -> ReadingSummary {
    sessions.reduce(into: ReadingSummary()) { summary, session in
        guard session.completed else { return }
        summary.totalMinutes += session.minutes
        summary.sessionCount += 1
        summary.minutesByCategory[session.category, default: 0] += session.minutes
    }
}

let summary = summarize(sessions)
assert(summary.totalMinutes == 60)
assert(summary.sessionCount == 3)
assert(summary.minutesByCategory == ["Swift": 30, "Testing": 30])
assert(summarize([]) == ReadingSummary())
```

The accumulator owns the report under construction. Mutation is local to the calculation, and the caller receives a value. This avoids spelling a new copied dictionary or array as the result of every accumulation step.

A common mistake is `reduce([]) { $0 + [transform($1)] }`. Repeated array concatenation can copy an increasingly long prefix, producing quadratic total work. `map` already expresses that task directly. If accumulation is genuinely needed, `reduce(into:)` with `append` or a loop is a better starting point.

Swift Evolution's [SE-0171](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0171-reduce-with-inout.md) documents the accumulator API introduced in Swift 4, well before these examples.

## Do not hide a simpler operation inside reduce

```swift
let hasLongCompletedSession = sessions.contains {
    $0.completed && $0.minutes >= 30
}
let firstCompleted = sessions.first { $0.completed }
assert(hasLongCompletedSession)
assert(firstCompleted?.minutes == 20)
```

These operations can stop when they have an answer. An ordinary reduction continues visiting elements even if an accumulated Boolean is already true. A `filter` followed by `.isEmpty` first constructs all matches in the eager form.

Use `allSatisfy` for a universal condition, `contains` for existence, `first(where:)` for the first match, and `min` or `max` for an extreme. Those names communicate the desired result more directly than a general accumulator.

Remember that `allSatisfy` returns true for an empty sequence. If a form requires at least one accepted item, combine the universal condition with a separate nonempty requirement.

## Chaining changes storage and evaluation order

`sessions.filter(...).map(...).reduce(...)` is readable, but eager array stages allocate intermediate arrays. For small screen data this may be insignificant. For a large import, a one-pass report like `summarize` avoids those arrays.

A lazy pipeline can avoid some intermediate storage, but deferred work has its own contract. Closures may run later or more than once if the pipeline is traversed repeatedly. See [Lazy Sequences](/swift-lazy-sequences/) before adding `.lazy` as a blanket optimization.

With pure closures, fusing a filter and map preserves the intended values. With effects, eager stages and a fused loop can interleave operations differently. Keep reporting calculations independent of output writes so this implementation choice remains local.

## Failure should remain visible

These sequence methods can accept throwing closures. A thrown error stops evaluation and propagates to the caller; they do not roll back effects that earlier closure invocations performed.

For example, mapping a throwing file writer across paths can leave some files written before a failure. A pure parser returning values avoids those partial external effects, but still requires a policy: fail the entire import, or collect per-record results.

Using `try?` with `compactMap` chooses to discard failures. That is sometimes useful, but it should be a deliberate data-loss policy rather than a shortcut for satisfying the compiler.

## Test the meaning of the report

For `summarize`, verify completed-only input, incomplete-only input, repeated categories, and empty input. A useful property is that adding an incomplete session leaves the summary unchanged.

Another property is that splitting the sessions, summarizing each side, and combining summaries produces the same totals under the bounded arithmetic assumptions. This checks the report's aggregation semantics and prepares the design for chunked processing.

Do not infer concurrency safety from that algebraic property. Parallel execution still needs isolated accumulators and a safe combination step. A shared mutable dictionary written by multiple tasks is a separate problem.

## Combine summaries without retaining every session

A report can be calculated in chunks if its accumulator has a defined combination operation. Here the sufficient facts are counts and totals, including the totals for each category:

```swift
func combining(_ first: ReadingSummary, _ second: ReadingSummary) -> ReadingSummary {
    var result = first
    result.totalMinutes += second.totalMinutes
    result.sessionCount += second.sessionCount
    for (category, minutes) in second.minutesByCategory {
        result.minutesByCategory[category, default: 0] += minutes
    }
    return result
}

let firstHalf = summarize(Array(sessions.prefix(2)))
let secondHalf = summarize(Array(sessions.dropFirst(2)))
assert(combining(firstHalf, secondHalf) == summarize(sessions))
assert(combining(ReadingSummary(), summary) == summary)
assert(combining(summary, ReadingSummary()) == summary)
```

The empty summary is an identity for this operation. Under bounded exact arithmetic, grouping chunk combinations should not change the result. That makes it possible to process batches without storing every session in the final report.

This does not authorize shared concurrent mutation of one summary. Each worker can own its own accumulator, and a coordinator can combine completed values under an isolation policy.

It also does not mean every reduction can be partitioned arbitrarily. A calculation of consecutive reading streaks needs boundary information from each chunk, not merely a count of completed sessions. Preserve the facts needed to combine partial results correctly.

## Define invalid input before accumulating it

The example starts with valid durations. If values come from external input, negative or extreme durations should be handled explicitly before they become plausible-looking totals.

```swift
enum DurationFailure: Error { case negative, overflow }

func checkedDurationTotal(_ values: [Int]) throws -> Int {
    try values.reduce(0) { total, value in
        guard value >= 0 else { throw DurationFailure.negative }
        let next = total.addingReportingOverflow(value)
        guard !next.overflow else { throw DurationFailure.overflow }
        return next.partialValue
    }
}

let checkedTotal = try checkedDurationTotal([20, 10, 30])
assert(checkedTotal == 60)
do {
    _ = try checkedDurationTotal([Int.max, 1])
    assertionFailure("Overflow must be reported")
} catch DurationFailure.overflow {
    // Expected: no invalid numeric result escapes.
}
```

The reduction is fail-fast and pure. Earlier additions have no external effect to undo. If the closure also wrote each partial total to disk, the same thrown error would leave externally visible work behind.

Choose whether a batch should reject all invalid input or return per-record diagnostics. That choice belongs in the import contract, not in an incidental `try?` inside the accumulator.

## A total is different from an explanation

A report returning only `Int` answers the numeric question but cannot explain which sessions contributed. If users need an audit trail, return a summary with identifiers or counts of accepted and rejected records, according to the privacy and storage needs of the product.

Do not retain every raw object automatically. Sufficient statistics are valuable precisely because they summarize. Preserve enough information to justify the result without accidentally making a small report retain an entire import payload.

Presentation should also have an explicit ordering. `minutesByCategory` is a dictionary, so a UI should create sorted rows or apply a configured category order. The aggregation's mathematical meaning does not provide a display order.

## Exercise: calculate an average without averaging averages

Add an optional average duration to the report. Preserve the sum and count, then derive the average only when the count is positive. Decide whether the output is an integer with a documented rounding rule or a floating-point value.

Split the input into two unequal groups and demonstrate why taking the average of their two averages gives the wrong overall result. Combine counts and totals instead.

For the API contracts, see [Sequence](https://developer.apple.com/documentation/swift/sequence). Continue with [compactMap and flatMap](/swift-compactmap-flatmap/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
