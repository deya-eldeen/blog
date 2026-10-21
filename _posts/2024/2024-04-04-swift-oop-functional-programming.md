---
layout: post
hidden: true
title: "Mixing Object-Oriented and Functional Programming in Swift"
date: "2024-04-04"
last_modified_at: "2024-04-04"
permalink: /swift-oop-functional-programming/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Functional Programming", "Design"]
thumbnail: assets/img/article-placeholder.svg
---
An application needs effects: reading files, requesting data, and updating state. It also needs calculations that should be predictable. Swift lets you keep an object responsible for coordinating effects while moving calculations into functions that depend only on their inputs.

You do not have to choose one programming style for the entire application.

<!--more-->

## Separate a decision from the work around it

```swift
struct SearchResult: Equatable {
    let id: Int
    let title: String
    let score: Int
}

func rankedResults(_ results: [SearchResult], minimumScore: Int) -> [SearchResult] {
    results
        .filter { $0.score >= minimumScore }
        .sorted {
            if $0.score == $1.score {
                return $0.id < $1.id
            }
            return $0.score > $1.score
        }
}

protocol SearchResultLoading {
    func load() throws -> [SearchResult]
}

final class SearchCoordinator {
    private let loader: any SearchResultLoading
    private(set) var visibleResults: [SearchResult] = []

    init(loader: any SearchResultLoading) {
        self.loader = loader
    }

    func refresh(minimumScore: Int) throws {
        let loaded = try loader.load()
        visibleResults = rankedResults(loaded, minimumScore: minimumScore)
    }
}

struct RecordedResults: SearchResultLoading {
    func load() throws -> [SearchResult] {
        [
            SearchResult(id: 2, title: "Objects", score: 8),
            SearchResult(id: 1, title: "Values", score: 8),
            SearchResult(id: 3, title: "Notes", score: 2)
        ]
    }
}

let coordinator = SearchCoordinator(loader: RecordedResults())
try coordinator.refresh(minimumScore: 5)
assert(coordinator.visibleResults.map { $0.id } == [1, 2])
```

The coordinator owns dependencies and the latest state. `rankedResults` owns a calculation that can be exercised without the coordinator or loader. Its explicit tie-breaker also makes the order independent of input ordering when different results have the same score and unique IDs.

The example loads synchronously from memory. An asynchronous production loader can change the coordination code while leaving the ranking calculation intact.

## Pure functions make inputs visible

A pure calculation has no observable side effects and gives the same result for the same inputs. Our ranking function does not read the clock, inspect a singleton, mutate its input, or issue a request.

That makes edge cases straightforward: no results, all scores below the threshold, ties, and negative thresholds. You can also compare the result of two calls with equal inputs.

Purity is a behavioral property, not a keyword attached to every Swift function. A function accepting reference types can mutate them; a closure passed to `map` can perform side effects. Functional-looking syntax does not prove a calculation is pure.

## Values help protect the boundary

`SearchResult` stores immutable values. The array passed to ranking can therefore be reasoned about without worrying that another owner changes a title during the calculation.

If each result contained a mutable class reference, copying the array would not make that referenced state independent. See [Value Types vs. Reference Types](/swift-value-vs-reference-types/) before assuming that a struct wrapper guarantees complete value semantics.

## Effects still need an owner

An object remains useful for coordinating refresh requests, cancellation, loading state, and dependency lifetime. Those concerns should not be forced into a pure function that secretly performs side effects.

In a concurrent app, the coordinator also needs an isolation policy and a rule for overlapping refreshes. For example, an older request should not overwrite newer results merely because it finishes later. Separating ranking from loading makes that policy easier to see, but does not implement it automatically.

## Use transformations when they clarify intent

`filter` and `sorted` describe the operations directly. A loop can be better when several stateful steps or early exits would make a long chain difficult to read. Swift's [Closures chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/) explains the function values these APIs accept.

Favor a pure core of explicit calculations and a small boundary that performs effects. The benefit is local reasoning: you can understand the rule without constructing the whole object graph, while the application still has a clear owner for its work.

## Make state transitions values you can reason about

Ranking is a pure calculation, but a screen also has a workflow: start loading, receive results, handle failure, and reject obsolete responses. A reducer expresses those transitions as a function from old state and an action to new state.

```swift
struct SearchViewState: Equatable {
    var latestRequest: Int = 0
    var isLoading = false
    var results: [SearchResult] = []
    var errorMessage: String?
}

enum SearchAction {
    case started(request: Int)
    case succeeded(request: Int, results: [SearchResult])
    case failed(request: Int, message: String)
}

func reduce(_ state: SearchViewState, action: SearchAction) -> SearchViewState {
    var next = state
    switch action {
    case let .started(request):
        guard request > state.latestRequest else { return state }
        next.latestRequest = request
        next.isLoading = true
        next.errorMessage = nil
    case let .succeeded(request, results):
        guard request == state.latestRequest, state.isLoading else { return state }
        next.results = results
        next.isLoading = false
        next.errorMessage = nil
    case let .failed(request, message):
        guard request == state.latestRequest, state.isLoading else { return state }
        next.isLoading = false
        next.errorMessage = message
    }
    return next
}

let initialSearchState = SearchViewState()
let loadingFirst = reduce(initialSearchState, action: .started(request: 1))
let loadingSecond = reduce(loadingFirst, action: .started(request: 2))
let obsoleteResult = [SearchResult(id: 9, title: "Old", score: 1)]
let afterObsoleteResult = reduce(
    loadingSecond,
    action: .succeeded(request: 1, results: obsoleteResult)
)
assert(afterObsoleteResult == loadingSecond)
let currentResult = [SearchResult(id: 10, title: "Current", score: 7)]
let settledSearchState = reduce(
    afterObsoleteResult,
    action: .succeeded(request: 2, results: currentResult)
)
assert(settledSearchState.results == currentResult)
assert(!settledSearchState.isLoading)

let duplicateCompletion = reduce(
    settledSearchState,
    action: .succeeded(request: 2, results: obsoleteResult)
)
assert(duplicateCompletion == settledSearchState)

let loadingThird = reduce(settledSearchState, action: .started(request: 3))
let failedThird = reduce(loadingThird, action: .failed(request: 3, message: "Offline"))
assert(failedThird.results == currentResult)
assert(failedThird.errorMessage == "Offline")
assert(!failedThird.isLoading)
```

The stale response is ignored because its request identifier no longer matches. Duplicate completion after the current request settles is also ignored because the state is no longer loading. The function does not cancel work or create request IDs; it expresses the rule for accepting outcomes.

The object coordinating the feature still owns those effects. It starts requests, assigns monotonically increasing identifiers within its lifetime, receives outcomes, and applies the reducer under an appropriate isolation policy. Keeping those responsibilities separate makes the ordering rule testable without racing actual requests.

## A pure core does not mean copying the whole application

The reducer accepts a value state and returns a replacement. Swift's value semantics permit the compiler and standard-library storage to avoid unnecessary physical copying while preserving observable independence.

That does not make every state representation efficient. Very large payloads, reference-bearing fields, or repeated expensive transformations can still matter. Start with a clear value model, then profile the actual workload before introducing manual storage sharing.

If a state contains a mutable reference, copying the state does not freeze that object's contents. A reducer mutating a referenced cache would no longer be a pure transformation just because its parameter is a struct. Keep mutable services outside the pure state or take immutable snapshots at the boundary.

## Effects should produce explicit outcomes

A loader can report a success or a typed failure to the coordinator. The coordinator maps that outcome to an action, and the reducer updates state. This creates a useful separation between infrastructure errors and user-facing state.

Do not make the reducer read a network client, write a log file, or consult a mutable singleton. Pass the relevant facts in the action. If the rule depends on time, include a timestamp or elapsed duration supplied by the effect boundary.

Logging can observe actions and resulting states outside the reducer. That supports diagnostics without making repeated evaluation of the same transition produce additional external effects.

## Test properties as well as individual examples

Individual assertions show that one stale response is ignored. Broader properties can reveal mistakes across many inputs: ranking never returns an item below the threshold, does not introduce new IDs, and orders distinct equal-score items by ID under the example's unique-ID assumption.

For the reducer, an outcome for an older request must not change the current loading state. Reapplying a settled completion should have no further effect. A failed current request should stop loading while preserving or clearing prior results according to the chosen product policy.

Our reducer preserves previous results on failure. That is deliberate: a screen can display old content and an error message. If the product instead requires an empty state after failure, change that rule and its tests together. “Pure” describes predictability, not which UX policy is correct.

## Do not force transformations into long chains

A loop can be a clear functional calculation if it only transforms local state and has no observable side effects. Conversely, a chain of `map`, `filter`, and `forEach` can conceal logging, mutation, or expensive repeated work.

For example, sorting an entire collection costs more than selecting one maximum when only the best result is needed. Naming the desired calculation first makes the algorithmic choice visible. Functional vocabulary is helpful when it expresses intent, not when it substitutes for understanding the workload.

Swift's [Collection documentation](https://developer.apple.com/documentation/swift/collection) and [Closures chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/) describe the building blocks. The design decision remains yours: choose the operation and representation that match the required behavior.

## Exercise: add cancellation as a domain event

Extend the reducer with a cancellation action. Decide whether cancellation preserves results, clears an error, and allows a later completion for the cancelled request to change state. Then write a sequence where request 1 starts, request 2 starts, request 2 is cancelled, and both responses arrive afterward.

Keep actual task cancellation in the coordinating object. The reducer should still reject outcomes that the state no longer accepts, because cancellation of external work may race with delivery. That is a practical example of OOP and functional design cooperating: an object owns work and lifetime, while a function owns the rule for state transitions.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
