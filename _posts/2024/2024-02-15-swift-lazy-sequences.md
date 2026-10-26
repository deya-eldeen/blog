---
layout: post
hidden: true
title: "Lazy Sequences in Swift: Deferred Work, Repeated Work, and Bounded Results"
date: "2024-02-15"
last_modified_at: "2024-02-15"
permalink: /swift-lazy-sequences/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Lazy Evaluation, Performance]
thumbnail: assets/img/article-placeholder.svg
---
Adding `.lazy` can avoid intermediate arrays and skip transformations for elements the caller never needs. It can also defer effects, repeat expensive calculations on later traversal, and retain an entire source longer than expected.

Laziness is an evaluation strategy. To use it well, identify what work is deferred, which operation finally demands values, and whether the resulting view will be traversed more than once.

<!--more-->

These examples use Swift 5.7. They contrast eager arrays with lazy views and keep the main transformation functions pure so evaluation timing does not change their meaning.

## Build a bounded search pipeline

```swift
struct Candidate {
    let id: Int
    let score: Int
    let enabled: Bool
}

struct Card: Equatable {
    let id: Int
    let label: String
}

let candidates = [
    Candidate(id: 1, score: 2, enabled: true),
    Candidate(id: 2, score: 9, enabled: true),
    Candidate(id: 3, score: 8, enabled: false),
    Candidate(id: 4, score: 7, enabled: true),
    Candidate(id: 5, score: 10, enabled: true)
]

func card(for candidate: Candidate) -> Card {
    Card(id: candidate.id, label: "Item \(candidate.id): \(candidate.score)")
}

let eager = candidates
    .filter { $0.enabled && $0.score >= 7 }
    .map(card)
    .prefix(2)

let lazy = candidates.lazy
    .filter { $0.enabled && $0.score >= 7 }
    .map(card)
    .prefix(2)

assert(Array(eager).map { $0.id } == [2, 4])
assert(Array(lazy).map { $0.id } == [2, 4])
```

The eager filter creates an array of every match, and the eager map transforms every match before the prefix selects two. The lazy composition allows consumption to request only the values needed for that prefix.

The result means the first two matches in source order, not the two highest scores. Candidate 5 has the largest score but comes later. Adding `.lazy` does not change the algorithm into ranking.

## Creating a view is different from materializing it

```swift
var mappingCalls = 0
let observed = [1, 2, 3].lazy.map { value in
    mappingCalls += 1
    return value * 10
}
assert(mappingCalls == 0)

var observedIterator = observed.makeIterator()
assert(observedIterator.next() == 10)
assert(mappingCalls == 1)
assert(observedIterator.next() == 20)
assert(mappingCalls == 2)
```

This instrumentation illustrates demand through a specific iterator. The mapping closure runs when values are requested, not when the view is assigned.

Avoid relying on exact predicate or transformation counts across every generic collection algorithm. Overloads may use indices, count information, or repeated access differently. The reliable design rule is that lazy views do not promise one-time cached evaluation.

Effects inside a lazy transform therefore need caution. Logging in the map may happen during a UI render, an equality check, or a second traversal rather than where the view was created. Prefer pure transforms and put required effects in an explicit workflow.

## Lazy does not mean memoized

```swift
var totalCalls = 0
let recalculated = [1, 2, 3].lazy.map { value in
    totalCalls += 1
    return value * value
}
let firstPass = Array(recalculated)
let callsAfterFirst = totalCalls
let secondPass = Array(recalculated)
assert(firstPass == [1, 4, 9] && secondPass == firstPass)
assert(callsAfterFirst > 0)
assert(totalCalls > callsAfterFirst)
```

A second traversal of this repeatable base performs the transformations again. If the calculation is expensive and the result is reused, materializing an array once can be faster overall.

If the base sequence is one-pass, a second traversal might instead be empty or continue from a consumed cursor. A lazy wrapper inherits the base's traversal semantics; it does not add replay.

Memoization stores computed results for reuse. It needs a cache policy, synchronization when shared, and a lifetime decision. `.lazy` by itself is a view, not that cache.

## Laziness can change which captured values are observed

```swift
var multiplier = 2
let liveView = [1, 2].lazy.map { $0 * multiplier }
multiplier = 5
assert(Array(liveView) == [5, 10])

let frozenView = [1, 2].lazy.map { [multiplier] in $0 * multiplier }
multiplier = 9
assert(Array(frozenView) == [5, 10])
```

The first closure reads the captured variable at evaluation time. The capture list in the second records the integer value when the closure is created.

Capturing a class reference does not freeze the object's contents. For a stable snapshot, capture the immutable facts the transformation needs rather than a mutable service capable of changing its answers.

This timing is particularly important when returning a lazy view from a function. The view can keep captures alive and evaluate after the surrounding workflow has moved to another state.

## Some operations still need the whole source

`sorted()` must inspect all finite input before returning an ordered array. A lazy prefix after sorting cannot avoid that full sort. `reduce`, `max`, and exact counting also normally need to consume the complete source to establish their answer.

For the single highest score, `max(by:)` avoids allocating and sorting an entire result. For a small top-k result from a very large source, a bounded heap can reduce work compared with a full sort. Those are algorithm choices independent of whether the input is lazy.

An output limit also does not necessarily bound input work. Finding ten matches can require inspecting millions of rejected records. In an infinite filtered sequence with no future match, requesting one result never finishes.

Use both output and work limits when processing potentially unbounded or user-controlled sources. “Only take ten” is not a complete resource policy.

## A simple one-pass loop can be the clearest bound

```swift
func firstCards(_ source: [Candidate], limit: Int) -> [Card] {
    guard limit > 0 else { return [] }
    var result: [Card] = []
    for candidate in source {
        guard candidate.enabled && candidate.score >= 7 else { continue }
        result.append(card(for: candidate))
        if result.count == limit { break }
    }
    return result
}

assert(firstCards(candidates, limit: 2) == Array(lazy))
assert(firstCards(candidates, limit: 0).isEmpty)
assert(firstCards(candidates, limit: 20).map { $0.id } == [2, 4, 5])
```

This loop makes the stopping rule visible and creates only the output array. It is a pure calculation with local mutation. A lazy chain may be more composable; the loop may be easier to instrument or extend with a scanned-record budget.

Choose according to the reader and workload. A functional design is not a contest to eliminate loops.

## Retained storage can outweigh saved arrays

A lazy view retains its base and captured dependencies. Holding a tiny view over a large source can keep that source alive. A slice-like result can likewise retain a larger backing allocation than its visible element count suggests.

Materializing a small result into an independent array can release the source sooner, depending on the surrounding ownership. That extra copy may reduce peak retained memory over the whole workflow.

Measure memory across lifetimes, not just allocations during one expression. A temporary allocation saved during computation can be less important than a large source retained for the lifetime of a screen.

## Benchmark the demand pattern

Compare pipelines that return the same result. Include few early matches, sparse late matches, and complete traversal. Test repeated use as well as a single pass.

Place timing around consumption, such as `Array(view)`, rather than only around construction. Keep a result observable so an optimized benchmark cannot discard the calculation. Use release builds and realistic element transformations.

For correctness, assert values and ordering. Reserve exact invocation-count assertions for an API that explicitly promises those counts. The iterator instrumentation above demonstrates one path; it is not a universal performance contract for every lazy overload.

## Materialization creates a useful snapshot boundary

Once a repeatable lazy calculation has produced an array, later consumers can reuse those results without rerunning the original map:

```swift
var snapshotWork = 0
let pendingSnapshot = [2, 3, 4].lazy.map { value in
    snapshotWork += 1
    return value * value
}
let snapshot = Array(pendingSnapshot)
let workAtSnapshot = snapshotWork
assert(snapshot.reduce(0, +) == 29)
assert(snapshot.max() == 16)
assert(snapshotWork == workAtSnapshot)
```

The array stores the computed integers. It is a snapshot of results, not a live view into the original transform. That can be the right boundary before handing data to several UI consumers or running several analyses.

If the results themselves are mutable references, materialization preserves those references rather than freezing their contents. Stable array membership and deep immutability remain different guarantees.

The decision is a tradeoff: allocate output once and retain it, or recompute values as demanded. Reuse frequency and result size often matter more than the aesthetics of a fluent pipeline.

## Distinguish a cheap view from a cheap operation

Creating a lazy wrapper is generally small compared with evaluating a large transformation. But operations performed on that wrapper can still be expensive.

Finding the first matching element may scan most of the base. Asking for a filtered collection's exact count can require testing every element. Access patterns based on filtered indices can also reevaluate predicates or transformations depending on the operations and overloads involved.

Prefer a straightforward traversal when consuming a lazy view. Do not assume it has the same access cost as the array from which it was derived merely because some collection APIs remain available.

This is especially important in UI code that asks for a count and then fetches each item separately. A materialized view model can be simpler and more predictable than repeatedly querying a computed filtered view.

## Errors need an evaluation point too

The standard lazy mapping interface does not provide the same throwing transform shape as eager sequence `map`. If a transformation can fail, choose an explicit representation and evaluation strategy rather than forcing `try?` into the closure.

One option is a lazy sequence of `Result` values, with each element preserving success or failure. Another is an explicit throwing loop that stops at the first error. A best-effort preview can deliberately drop failed elements, but should retain diagnostics if incomplete output matters.

Do not let delayed evaluation make error ownership ambiguous. The consumer that demands a value should know whether it can receive a failure and whether earlier work has already produced effects.

## Laziness is useful when the consumer controls demand

A search, bounded preview, or streaming transformation often benefits because it may stop early. A full export that must process every item may benefit mostly from avoiding intermediate arrays, and a one-pass loop can offer the same storage behavior.

A repeatedly displayed list may benefit more from materialization because every render reuses stable view models. A long-lived lazy view can retain source data and dependencies while recalculating labels on each pass.

Choose the boundary from the lifecycle: how long the source lives, how often values are demanded, and whether configuration can change between demands. “Use lazy for performance” is too vague to answer those questions.

## Exercise: add a scan budget

Extend `firstCards` with `maximumScanned`. Return both the cards and whether the search stopped because the budget was exhausted. Define whether the budget counts all candidates or only enabled ones.

Test a source with many rejected candidates before the first match. Then compare an output limit alone with the combined work budget and explain the difference in termination guarantees.

See [LazySequenceProtocol](https://developer.apple.com/documentation/swift/lazysequenceprotocol) for the standard-library abstraction. Return to the [Functional Programming roadmap](/swift-functional-programming/).
