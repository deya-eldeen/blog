---
layout: post
hidden: true
title: "Higher-Order Functions in Swift: Reusable Policies and Honest Effects"
date: "2023-03-16"
last_modified_at: "2023-03-16"
permalink: /swift-higher-order-functions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Closures, Generics]
thumbnail: assets/img/article-placeholder.svg
---
A higher-order function accepts a function, returns a function, or does both. Swift's `map` is one example, but the idea reaches beyond collections: build ordering policies, configure predicates, scope resources, or define how often an operation may run.

The useful abstraction is a stable piece of control flow with a replaceable decision. Its contract includes how it invokes that decision, especially when the decision has effects.

<!--more-->

The examples use Swift 5.7. They build a small article-search policy before examining a deliberately effectful retry helper.

## Capture the part that changes

```swift
struct Article: Equatable {
    let id: Int
    let title: String
    let score: Int
    let published: Bool
}

typealias Predicate<Value> = (Value) -> Bool

func atLeast(_ minimum: Int) -> Predicate<Article> {
    { article in article.score >= minimum }
}

func both<Value>(
    _ first: @escaping Predicate<Value>,
    _ second: @escaping Predicate<Value>
) -> Predicate<Value> {
    { value in first(value) && second(value) }
}

let isPublished: Predicate<Article> = { $0.published }
let isRecommended = both(isPublished, atLeast(8))
let articles = [
    Article(id: 3, title: "Values", score: 9, published: true),
    Article(id: 1, title: "Closures", score: 9, published: true),
    Article(id: 2, title: "Draft", score: 10, published: false)
]
assert(articles.filter(isRecommended).map { $0.id } == [3, 1])
```

`atLeast` turns a threshold into a reusable decision. `both` combines two decisions without knowing anything about articles. The generic type preserves the requirement that both predicates accept the same kind of value.

The order inside `both` matters operationally: `&&` short-circuits. When the first predicate is false, the second is not called. This is harmless for our pure predicates and potentially significant for a predicate that records metrics or performs expensive work.

Do not assume a composed predicate means both operations always happen. If both effects must run, that is a different contract and deserves a different function.

## Build an ordering from a projection

Many ordering functions repeat the same pattern: extract a comparable key, then compare it. Abstract that pattern:

```swift
func ascending<Value, Key: Comparable>(
    by key: @escaping (Value) -> Key
) -> (Value, Value) -> Bool {
    { left, right in key(left) < key(right) }
}

func descending<Value, Key: Comparable>(
    by key: @escaping (Value) -> Key
) -> (Value, Value) -> Bool {
    { left, right in key(left) > key(right) }
}

func breakingTies<Value>(
    _ primary: @escaping (Value, Value) -> Bool,
    with secondary: @escaping (Value, Value) -> Bool
) -> (Value, Value) -> Bool {
    { left, right in
        if primary(left, right) { return true }
        if primary(right, left) { return false }
        return secondary(left, right)
    }
}

let byScore: (Article, Article) -> Bool = descending(by: { $0.score })
let byID: (Article, Article) -> Bool = ascending(by: { $0.id })
let recommendedOrder = breakingTies(byScore, with: byID)
let ranked = articles.filter(isRecommended).sorted(by: recommendedOrder)
assert(ranked.map { $0.id } == [1, 3])
```

The primary comparison is checked in both directions to determine equivalence under that ordering. Equality of the entire values is unnecessary: two different articles can be tied by score.

This helper assumes its inputs are valid strict orderings. A comparator based on `<=`, random values, or changing state can violate sorting's requirements. Combining invalid orderings does not repair them.

The key extraction also runs repeatedly during sorting. If computing a key is expensive, calculate it once per element, sort decorated values, and remove the decoration. A generic helper should not hide a cost that dominates the workload.

## Distinguish configuration from execution

Creating `isRecommended` and `recommendedOrder` does not traverse the articles. It creates function values. The collection operations later execute those functions.

This distinction is useful for dependency assembly: a screen can receive a configured policy without reading a global threshold during every comparison. It is also useful for debugging. If a configuration value changes, existing closures retain or reference it according to their captures; they do not automatically rebuild themselves.

If the threshold is a copied integer, a factory captures a stable value. If it captures a mutable settings object, the policy may change between calls. Treat capture semantics as part of the policy's design, not an implementation footnote.

## Escaping is about lifetime

The predicate combinator marks its function parameters `@escaping` because the returned closure stores them beyond the call. A function that only invokes a closure during its own execution generally does not need that annotation.

Escaping closures may retain captured objects. An owner storing a closure that captures the owner can form a cycle. Choosing a weak capture is appropriate only when the operation is allowed to outlive or lose that owner; it is not a universal closure template.

Functions also have contracts around throwing. A helper that merely forwards errors from a supplied closure may be able to use `rethrows`. A helper that creates its own failure, as the retry example below does, needs `throws`.

## A higher-order function can be deliberately effectful

```swift
enum RetryFailure: Error { case invalidAttemptCount }

func retry<Value>(
    attempts: Int,
    shouldRetry: (Error) -> Bool,
    operation: () throws -> Value
) throws -> Value {
    guard attempts > 0 else { throw RetryFailure.invalidAttemptCount }
    for attempt in 1...attempts {
        do {
            return try operation()
        } catch {
            if attempt == attempts || !shouldRetry(error) { throw error }
        }
    }
    preconditionFailure("A positive bounded loop returns or throws")
}

enum DemoFailure: Error { case temporarilyUnavailable }
var invocations = 0
let answer: Int = try retry(attempts: 3, shouldRetry: { _ in true }) {
    invocations += 1
    if invocations < 3 { throw DemoFailure.temporarilyUnavailable }
    return 42
}
assert(answer == 42 && invocations == 3)
```

Here `attempts` includes the first call. The helper stops on the first success, rejects a nonpositive count, and rethrows the last operation error when the budget is exhausted. The operation may run multiple times; that is its most important contract.

This is a synchronous teaching example. Network retries need cancellation, backoff, and a decision about which failures are transient. A blocking sleep inside a UI operation is not a suitable implementation of that scheduling policy.

More fundamentally, a timeout does not prove an effect failed. A payment might have succeeded remotely before the response was lost. Retrying requires an idempotency or reconciliation contract with the effect's owner. A function accepting a closure cannot infer that safety from its type.

## Test invocation behavior when it is the contract

For the search helpers, test result membership and ordering. Also test a tie and an empty input. Avoid asserting how many times a sort comparator runs because sorting is free to choose its comparison strategy.

For `retry`, invocation count is part of the public promise. Test immediate success, success after one failure, a nonretryable error, exhaustion, and invalid attempt counts. Verify a rejected configuration never calls the operation.

This difference matters: interaction tests are valuable when they protect observable policy, and brittle when they freeze an incidental implementation detail.

## Keep an abstraction smaller than its benefit

A one-off predicate can stay inline. A generic policy factory becomes useful when it removes repeated reasoning and gives a rule a clear name. A family of custom operators may make the code shorter while making it harder for the next Swift reader to understand.

Function types also stop short of some domain needs. If a policy must be displayed, persisted, compared, or audited, model its configuration as data and construct the function from that data. The function executes the policy; the data describes which policy was selected.

## Check ordering laws over a small fixture

An ordering policy can be tested independently of the sorting algorithm. A strict comparison should reject self-comparison and should not say that each of two values precedes the other:

```swift
for a in articles {
    assert(!recommendedOrder(a, a))
    for b in articles {
        assert(!(recommendedOrder(a, b) && recommendedOrder(b, a)))
        for c in articles {
            if recommendedOrder(a, b) && recommendedOrder(b, c) {
                assert(recommendedOrder(a, c))
            }
        }
    }
}
```

These checks explore the fixture, not every possible `Article`. Add generated cases containing score ties, negative supported scores, and distinct IDs. Keep the ID uniqueness assumption explicit if the final order is meant to be total over domain identities.

If a projection reads a changing object, the comparison can change between calls and violate these relationships. Stable inputs and pure key extraction are prerequisites for the reasoning, not optional performance advice.

## Test retry rejection before testing recovery

The most valuable retry test is often the one proving an operation was never repeated when it should not be:

```swift
var rejectedOperationCalls = 0
do {
    let _: Int = try retry(attempts: 0, shouldRetry: { _ in true }) {
        rejectedOperationCalls += 1
        return 1
    }
    assertionFailure("An invalid budget must fail")
} catch RetryFailure.invalidAttemptCount {
    assert(rejectedOperationCalls == 0)
}

var permanentFailureCalls = 0
do {
    let _: Int = try retry(attempts: 5, shouldRetry: { _ in false }) {
        permanentFailureCalls += 1
        throw DemoFailure.temporarilyUnavailable
    }
    assertionFailure("The operation must fail")
} catch DemoFailure.temporarilyUnavailable {
    assert(permanentFailureCalls == 1)
}
```

The second fixture deliberately uses the same demo error with a policy that rejects retry. The helper delegates classification to its caller; the error's name does not override that policy.

For a real adapter, distinguish retryable transport errors from authentication, validation, and cancellation. An “always retry” closure is useful for demonstrating control flow but rarely expresses a complete production rule.

## Avoid assuming independent configuration is independent execution

The search policy factories build values without touching the article array. This makes assembly cheap and separate from execution, but a policy can still capture a shared service that serializes or mutates internally.

If several consumers execute the same closure concurrently, the closure's captures need a safe ownership and isolation contract. Passing a function value around does not remove the requirements of the objects it retains.

Similarly, a closure that looks like a simple predicate may perform an expensive lookup on every candidate. Make that dependency visible in the policy design. Precompute a stable lookup table or include the needed fact in each candidate when that better matches the workload.

The higher-order function should document whether it may invoke the supplied function zero times, multiple times, or after returning. Those differences affect validity just as much as the input and output types do.

## Partial application need not become universal currying

`atLeast(8)` binds one configuration input and returns a predicate. That is useful because the resulting unary function fits `filter` directly.

Turning every multiargument function into nested single-argument functions would often make ordinary Swift calls less readable. Keep argument labels where they explain the domain, and introduce a factory when binding configuration creates a reusable capability.

The practical criterion is whether callers can see what has been fixed and what remains variable. A descriptive factory name usually communicates that better than a chain of unlabeled closures or custom operators.

## Exercise: add an either combinator

Implement `either` with short-circuiting `||`, and a `negated` predicate factory. Verify the Boolean identities for pure predicates over a small generated domain.

Then use a counter in a test predicate to establish the promised short-circuit behavior. Explain why reordering pure predicates preserves membership while reordering effectful predicates can change observable behavior.

Swift's [Closures chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/) covers capture and escaping rules. Continue with [map, filter, and reduce](/swift-map-filter-reduce/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
