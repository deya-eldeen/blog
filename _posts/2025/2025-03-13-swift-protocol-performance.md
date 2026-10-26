---
layout: post
hidden: true
title: "Performance Considerations for Protocol-Oriented Swift"
date: "2025-03-13"
last_modified_at: "2025-03-13"
permalink: /swift-protocol-performance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Performance", "Generics"]
thumbnail: assets/img/article-placeholder.svg
---
A protocol declaration has no universal performance penalty. Runtime cost depends on how values cross the boundary, what information the optimizer can see, how data is stored, and how much real work each operation performs.

A concrete value, a generic parameter, and an existential can expose the same behavior through different representations. Compare those representations in an actual workload before redesigning an application around assumptions about dispatch.

<!--more-->

## Separate the operation from the representation

```swift
import Dispatch

protocol IntegerScoring {
    func score(_ value: Int) -> Int
}

struct OffsetScorer: IntegerScoring {
    let offset: Int
    func score(_ value: Int) -> Int { value + offset }
}

struct DoubleScorer: IntegerScoring {
    func score(_ value: Int) -> Int { value * 2 }
}

@inline(never)
func concreteTotal(_ values: [Int], seed: Int, scorer: OffsetScorer) -> Int {
    var total = 0
    for value in values { total += scorer.score(value + seed) }
    return total
}

@inline(never)
func genericTotal<S: IntegerScoring>(_ values: [Int], seed: Int, scorer: S) -> Int {
    var total = 0
    for value in values { total += scorer.score(value + seed) }
    return total
}

@inline(never)
func existentialTotal(_ values: [Int], seed: Int, scorer: any IntegerScoring) -> Int {
    var total = 0
    for value in values { total += scorer.score(value + seed) }
    return total
}

let scoreValues = [1, 2, 3]
let offsetScorer = OffsetScorer(offset: 5)
assert(concreteTotal(scoreValues, seed: 0, scorer: offsetScorer) == 21)
assert(genericTotal(scoreValues, seed: 0, scorer: offsetScorer) == 21)
assert(existentialTotal(scoreValues, seed: 0, scorer: offsetScorer) == 21)
assert(genericTotal(scoreValues, seed: 0, scorer: DoubleScorer()) == 12)
```

The concrete function knows the implementation type directly. The generic function retains a type relationship and may be specialized. The existential function accepts runtime variation behind a fixed interface.

The `@inline(never)` annotations intentionally keep these outer measurement boundaries visible. They are experiment controls, not recommended production annotations. Removing or changing them can legitimately change the result because the optimizer gains different opportunities.

Apple's [Explore Swift performance](https://developer.apple.com/videos/play/wwdc2024/10217/) discusses these mechanisms and the importance of optimization visibility. The language guide's [Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/) describes the flexibility an existential representation provides.

## Generics can specialize, but not by promise

A generic body must be valid for its constraints. The compiler can still create a version for a specific concrete argument when visibility and optimization permit it. That can eliminate indirect requirement calls and unlock further simplification.

Crossing a module boundary can change what implementation information is available. Build settings and library evolution constraints matter too. A generic signature is not a guarantee that every caller receives a fully specialized implementation.

Likewise, an existential does not guarantee that an indirect call survives optimization. If the compiler can prove the contained type, it may remove indirection. Inspect the optimized program when the difference matters instead of assuming source spelling completely predicts machine code.

These are optimization possibilities, not different semantics. The result must still match the language's overload, witness, and override rules.

## Build a small measurement harness with observable work

```swift
struct TimingSample {
    let label: String
    let nanoseconds: UInt64
    let checksum: Int
}

func measureScores(
    label: String,
    rounds: Int,
    operation: (Int) -> Int
) -> TimingSample {
    precondition(rounds > 0)
    var checksum = 0
    let start = DispatchTime.now().uptimeNanoseconds
    for seed in 0..<rounds {
        checksum &+= operation(seed)
    }
    let elapsed = DispatchTime.now().uptimeNanoseconds - start
    return TimingSample(label: label, nanoseconds: elapsed, checksum: checksum)
}

if CommandLine.arguments.contains("--benchmark") {
    let values = Array(0..<2_048)
    let scorer = OffsetScorer(offset: 5)
    let rounds = 300
    let samples = [
        measureScores(label: "concrete", rounds: rounds) { seed in
            concreteTotal(values, seed: seed, scorer: scorer)
        },
        measureScores(label: "generic", rounds: rounds) { seed in
            genericTotal(values, seed: seed, scorer: scorer)
        },
        measureScores(label: "existential", rounds: rounds) { seed in
            existentialTotal(values, seed: seed, scorer: scorer)
        }
    ]
    assert(Set(samples.map(\.checksum)).count == 1)
    for sample in samples {
        print(sample.label, sample.nanoseconds, sample.checksum)
    }
}
```

The changing seed makes the input vary across rounds. Printing the checksums gives the computed work an observable result. Matching checksums are a correctness check, not proof that every implementation executes identical instructions.

Put the Swift blocks in a file such as `ProtocolScores.swift`, then compile an optimized executable:

```sh
swiftc -O -swift-version 6 ProtocolScores.swift -o protocol-scores
./protocol-scores --benchmark
```

A debug run mostly measures a different build configuration. The harness deliberately publishes no universal timing numbers: machine, compiler, thermal state, and optimization context affect the observations.

## Understand what this experiment cannot establish

The scoring method is deliberately tiny, so call overhead and optimization opportunities can be a large fraction of the measured work. A method that performs a database query or decodes a large image has a different cost profile.

The existential contains one known scorer in this program. That is easier for an optimizer to analyze than a heterogeneous array assembled from runtime inputs. If production stores several implementations together, measure that actual shape too.

Running cases in a fixed order also introduces warm-up and thermal bias. For a serious comparison, warm up, repeat, vary ordering, collect a distribution, and compare representative workloads under stable conditions. A single elapsed duration is an observation, not an architectural verdict.

## Storage can matter more than the call

Existential values may need metadata, witness information, and storage for an erased payload. Some payloads can fit in available inline storage; others may require allocation depending on representation and optimization. Do not assume every `any` value allocates a heap object.

A heterogeneous array of protocol values can have different memory density and locality from a homogeneous array of small structs. A class-based implementation may add pointer chasing and reference-counting work. Copying a large value repeatedly can also dominate a computation.

Measure allocations and retained memory as well as elapsed time. Replacing an existential with a generic parameter may leave the actual bottleneck untouched if the hot path is repeated array construction or an inefficient algorithm.

## Algorithmic improvements usually deserve the first look

If a search repeatedly sorts an entire dataset to select one maximum, changing the algorithm can remove much more work than changing method dispatch. If a renderer normalizes the same string for every item, moving that invariant calculation outside the loop can matter regardless of the abstraction used.

First confirm the measured hot operation. Then ask how often it runs, how much data it touches, and what effects it repeats. A protocol wrapper around an expensive operation is not automatically the cause of that expense.

Keep correctness constraints visible during optimization. A cache key that ignores dataset revision can make a benchmark fast by returning stale results. A faster algorithm producing a different ordering is not an equivalent replacement if order is part of the contract.

## Do not equate value syntax with zero sharing cost

A struct can contain a class reference or closure capturing a shared object. Copying that struct may preserve aliasing and incur reference-management work. Conversely, a final class may have a well-understood, efficient lifetime for a genuinely shared resource.

The relevant question is the reachable representation and access pattern, not whether the outer declaration says `struct` or `class`. A protocol also does not erase the payload's ownership semantics.

For copy-on-write values, mutation cost depends on whether storage is uniquely referenced and which mutation path is exercised. Measure a representative sequence of reads, copies, and writes rather than only constructing one value and reading it repeatedly.

## Module boundaries are part of the experiment

Moving code into a framework can change specialization and inlining opportunities. An attribute such as `@inlinable` exposes implementation details as part of a public optimization contract and creates compatibility obligations. Do not apply it everywhere to rescue a synthetic benchmark.

A sensible performance investigation records compiler version, optimization flags, target architecture, module arrangement, dataset size, and the exact operation being measured. Keep the baseline and candidate under the same conditions.

The [Swift compiler overview](https://www.swift.org/documentation/swift-compiler/) describes optimization stages including devirtualization and generic specialization. Those mechanisms explain why seemingly small contextual changes can alter results without changing source-level semantics.

## Choose the boundary that matches real variation

| Need | Useful representation to evaluate |
|---|---|
| One known implementation with no substitution | Concrete dependency |
| A stable concrete relationship across an algorithm | Generic parameter |
| One hidden implementation chosen by an API | Opaque result |
| Runtime-selected or heterogeneous implementations | Existential storage |

Start with a clear contract and appropriate ownership. Optimize a measured boundary when evidence shows that representation matters. Avoid making every feature generic solely to remove a cost that was never observed.

As an exercise, add a heterogeneous `[any IntegerScoring]` workload with alternating scorer types. Compare it with an enum containing the same closed choices, preserve identical results, and record the compiler and flags. The exercise is useful when it teaches which work the optimizer can remove and which flexibility the application needs, rather than producing a slogan about protocols being fast or slow.

## Worked second workload: heterogeneous storage versus a closed enum

A collection containing several implementations presents a different optimization shape from one known scorer. Represent the same choices with both an existential and an enum:

```swift
enum ClosedScorer: IntegerScoring {
    case offset(Int)
    case double

    func score(_ value: Int) -> Int {
        switch self {
        case let .offset(amount): return value + amount
        case .double: return value * 2
        }
    }
}

@inline(never)
func mixedScoringTotal(_ values: [Int], scorers: [any IntegerScoring]) -> Int {
    var total = 0
    for value in values {
        for scorer in scorers { total += scorer.score(value) }
    }
    return total
}

@inline(never)
func closedScoringTotal(_ values: [Int], scorers: [ClosedScorer]) -> Int {
    var total = 0
    for value in values {
        for scorer in scorers { total += scorer.score(value) }
    }
    return total
}

let mixedScorers: [any IntegerScoring] = [OffsetScorer(offset: 5), DoubleScorer()]
let closedScorers: [ClosedScorer] = [.offset(5), .double]
assert(mixedScoringTotal([1, 2, 3], scorers: mixedScorers) == 33)
assert(closedScoringTotal([1, 2, 3], scorers: closedScorers) == 33)
```

The checks establish equivalent results for this input. They do not establish that one representation is faster. Measure repeated realistic inputs with the same harness discipline before drawing that conclusion.

An enum can expose the full set of choices to exhaustive optimization, while an existential supports implementations outside that set. Replacing one with the other is therefore also an extensibility decision. A modest timing difference may be irrelevant if independent modules must add conformers without changing a central enum.

Keep array construction outside the timed region when measuring repeated consumption, or include it deliberately when construction is part of the production workload. Those are different questions. Otherwise the experiment can accidentally compare allocation frequency rather than the call path it was intended to study.

The same principle applies to caches and wrappers: measure the complete ownership and access pattern that users exercise. A tiny isolated dispatch result can be informative, but it should not become a universal recommendation for every feature boundary.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
