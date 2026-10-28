---
layout: post
hidden: true
title: "Property-Based Testing in Swift: Generators, Shrinking, and Reproducible Failures"
date: "2023-10-19"
last_modified_at: "2023-10-19"
permalink: /swift-property-based-testing/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Testing, QuickCheck]
thumbnail: assets/img/article-placeholder.svg
---
An example test says a function works for one chosen input. A property test states a relationship that should hold across a domain and asks a generator to search for counterexamples. When a case fails, shrinking tries to reduce it to a smaller explanation.

Pure functions are a natural fit: generated inputs can be replayed without rebuilding a database or reconstructing a timing race. The hard part is choosing properties and generators that express the actual contract.

<!--more-->

These Swift 5.7 examples implement a small, dependency-free demonstration. QuickCheck is the original property-testing approach associated with Haskell; [SwiftCheck](https://github.com/typelift/SwiftCheck) is a Swift library in that family. Neither is part of Swift's standard library.

## A plausible implementation can satisfy weak properties

Suppose a sorting function accidentally removes duplicates:

```swift
func brokenSort(_ values: [Int]) -> [Int] {
    Array(Set(values)).sorted()
}

func isOrdered(_ values: [Int]) -> Bool {
    zip(values, values.dropFirst()).allSatisfy { $0 <= $1 }
}

assert(isOrdered(brokenSort([3, 1, 3])))
assert(brokenSort([3, 1, 3]) == [1, 3])
```

“The result is ordered” passes. So does “sorting an already sorted result has no further effect.” A function returning an empty array would satisfy both properties too.

Sorting must also preserve the input's multiset: every value appears the same number of times. A property set should characterize the intended behavior strongly enough to reject plausible wrong implementations.

```swift
func frequencies(_ values: [Int]) -> [Int: Int] {
    values.reduce(into: [:]) { counts, value in
        counts[value, default: 0] += 1
    }
}

func preservesElements(_ input: [Int], output: [Int]) -> Bool {
    frequencies(input) == frequencies(output)
}

assert(!preservesElements([3, 1, 3], output: brokenSort([3, 1, 3])))
assert(preservesElements([3, 1, 3], output: [1, 3, 3]))
```

The oracle here counts occurrences rather than using the same sorting algorithm to judge itself. Independent structure makes the test more likely to catch a shared mistake.

## Make generated failures reproducible

A deterministic generator turns a seed into a repeatable stream. This tiny linear congruential generator is sufficient for a teaching test, not for security or high-quality simulation:

```swift
struct TestGenerator {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state = state &* 6_364_136_223_846_793_005 &+ 1
        return state
    }

    mutating func array() -> [Int] {
        let count = Int((next() >> 32) % 12)
        return (0..<count).map { _ in Int((next() >> 32) % 7) - 3 }
    }
}

func findCounterexample(
    seed: UInt64,
    trials: Int,
    property: ([Int]) -> Bool
) -> [Int]? {
    precondition(trials >= 0)
    var generator = TestGenerator(seed: seed)
    for _ in 0..<trials {
        let input = generator.array()
        if !property(input) { return input }
    }
    return nil
}

let counterexample = findCounterexample(seed: 42, trials: 200) { input in
    preservesElements(input, output: brokenSort(input))
}
assert(counterexample != nil)
```

The small value range deliberately generates duplicates often. A generator drawing mostly distinct large integers might take much longer to expose this bug. Generation strategy is part of the test's effectiveness.

Modulo reduction introduces distribution bias, and this generator has correlations. A mature framework provides stronger generation machinery. The example's useful property is repeatability, with an explicit, bounded search domain.

When reporting a real failure, retain the seed, generator configuration, trial index, and failing input. A seed alone may not reproduce after the generator's implementation changes.

## Shrink the explanation, not just the output

Here is a simple deletion shrinker. It repeatedly removes one element when the smaller input still fails:

```swift
func shrinkByDeletion(
    _ original: [Int],
    fails: ([Int]) -> Bool
) -> [Int] {
    precondition(fails(original))
    var current = original
    while true {
        var smaller: [Int]?
        for index in current.indices {
            var candidate = current
            candidate.remove(at: index)
            if fails(candidate) {
                smaller = candidate
                break
            }
        }
        guard let next = smaller else { return current }
        current = next
    }
}

let reduced = shrinkByDeletion(counterexample!) { input in
    !preservesElements(input, output: brokenSort(input))
}
assert(reduced.count == 2)
assert(reduced[0] == reduced[1])
```

The two equal elements expose the defect directly. Removing either would eliminate the failure, so this result is minimal under single-element deletion.

That does not prove global minimality under every possible simplification. A complete shrinker may also reduce integer magnitudes and shrink nested structure. Its candidate strategy determines which local minimum it finds.

The force unwrap is justified by the preceding assertion in this executable demonstration. A reusable test runner should report “no failure found” explicitly rather than assuming its search always succeeds.

## Preserve the generator's domain while shrinking

If a parser property requires syntactically valid expressions, deleting arbitrary characters can turn a semantic failure into an unrelated syntax failure. If a tree property requires ordered keys, arbitrary value replacement can violate the precondition.

Generate valid values by construction where possible, and write shrinkers that preserve the relevant invariant. Excessively filtering random values can discard most trials and give a misleading impression of coverage.

For preconditioned properties, report how many generated cases were actually exercised. Ten thousand attempts with only three accepted inputs are not ten thousand meaningful tests.

## Combine laws with explicit boundaries

For sorting, test ordering and multiset preservation together. For normalization, idempotence can be useful, but add expected outputs for meaningful edge cases. For serialization, round-trip properties need a policy for canonicalization and unsupported values.

Keep explicit examples for empty input, one element, repeated values, and extreme supported values. Random generation complements these cases; it should not be the only way an important boundary is exercised.

Numeric properties require a defined domain. `a + b == b + a` is not a useful test if generated addition traps on overflow before a result exists. Use bounded inputs or explicitly checked arithmetic, and test overflow handling as a separate behavior.

## Passing trials are evidence, not a proof

| Check | What it can establish | What it does not establish |
| --- | --- | --- |
| Explicit example | A chosen input has the expected behavior | Behavior for untested inputs |
| Generated property | No counterexample was found in the exercised cases | A proof over an infinite domain |
| Coverage classification | Important input categories were exercised | Correctness within every category |
| Shrinking | A smaller failure under the selected strategy | Global minimality under every simplification |
| Regression example | A previously discovered defect stays covered | Exploration of new failure shapes |

These techniques work together. A generated failure becomes a small regression example, while the property continues searching for other shapes of the same mistake.

The generated set is finite. A passing run says no counterexample was found under this distribution and budget. It does not establish the property for every possible input.

Deterministic regression seeds are useful for CI, and rotating additional seeds can explore more space. Every discovered bug should become a small permanent regression example so it remains covered even when generation changes.

SwiftCheck supplies framework integration, generators, and shrinking. A hand-built harness is useful for understanding the mechanism, but a project should weigh maintenance cost before inventing a full testing framework.

## Check that generation actually explores the intended categories

A bounded random loop can run hundreds of times while rarely exercising an important case. Classify generated inputs and inspect the distribution rather than assuming the seed does the right thing:

```swift
var coverageGenerator = TestGenerator(seed: 42)
var lengths: [Int: Int] = [:]
var duplicateCases = 0
for _ in 0..<200 {
    let input = coverageGenerator.array()
    lengths[input.count, default: 0] += 1
    if Set(input).count < input.count { duplicateCases += 1 }
    assert(isOrdered(input.sorted()))
    assert(preservesElements(input, output: input.sorted()))
}
assert(lengths[0, default: 0] > 0)
assert(lengths.count > 1)
assert(duplicateCases > 0)
```

These assertions are tied to this fixed demonstration generator and budget. A reusable framework should report coverage requirements clearly and distinguish a failed property from insufficient generated coverage.

Using higher bits in this small generator avoids relying directly on its particularly weak low-bit patterns, but does not make it a sophisticated source of randomness. A mature library's generators and combinators are preferable for broad production use.

Coverage categories should follow the bug risks. For a sorting function, duplicates and ordering patterns matter. For a parser, categories might include nesting depth, empty tokens, Unicode, and malformed separators. Input length alone is not a complete coverage model.

## Reproduce the failure before shrinking it

```swift
let replayedFailure = findCounterexample(seed: 42, trials: 200) { input in
    preservesElements(input, output: brokenSort(input))
}
assert(replayedFailure == counterexample)
assert(!preservesElements(reduced, output: brokenSort(reduced)))
for index in reduced.indices {
    var smaller = reduced
    smaller.remove(at: index)
    assert(preservesElements(smaller, output: brokenSort(smaller)))
}
```

The last loop checks the shrinker's local-minimality claim for this result: no single deletion preserves this failure. That is more precise than describing the output as “the smallest possible case.”

Shrinking reevaluates the property many times. If it reads a changing clock or performs external writes, the failure can disappear or cause repeated side effects. Reset test state between trials or isolate the pure calculation before applying this technique.

For concurrency bugs, reproducibility also needs a controlled schedule or recorded event sequence. A numeric seed for input data does not reproduce an arbitrary operating-system interleaving.

## Separate the property's domain from the implementation's accidents

Suppose a normalizer promises to trim ASCII spaces only. A generator producing all Unicode whitespace should not assume every generated character must be removed unless that is the actual contract.

Conversely, shrinking a failing Unicode case to an empty ASCII string may remove the feature that caused the bug. Domain-aware shrinkers can preserve relevant categories while simplifying everything else.

Write down preconditions before selecting generators. A property about a binary search tree may require stable total ordering; a property about money may require matching currencies and bounded arithmetic. Randomly violating these assumptions tests validation behavior, which is useful but different from testing the algorithm on valid inputs.

## Keep framework adoption proportionate

The demonstration harness omits test-runner reporting, size scheduling, compositional generators, and generic shrinkers. Extending it into a project-wide tool would create maintenance work that SwiftCheck already addresses.

If a project already uses a property-testing library, integrate with its conventions and pin a compatible dependency version. Do not copy an arbitrary current README into a historically dated article without checking availability and API compatibility.

A useful adoption starts with one pure calculation and two or three strong properties. Compare the defects those properties can catch against the existing examples, then expand where generated cases reveal meaningful gaps.

## Exercise: test a persistent collection

Generate a sequence of inserts and removals against a small set-like structure. Keep a standard-library `Set` as a reference model, and compare membership after each operation.

Retain earlier versions and verify later edits do not change them. When a failure occurs, shrink the operation list, preserving the failure, until the smallest useful sequence remains. This tests both set behavior and the persistence guarantee.

Continue with [Purely Functional Data Structures](/swift-persistent-data-structures/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
