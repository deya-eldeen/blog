---
layout: post
hidden: true
title: "Big O in Swift: Bounds, Growth Rates, and Amortized Work"
date: "2023-02-23"
last_modified_at: "2023-02-23"
permalink: /swift-big-o/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A complexity label is a bound on a specified cost function. It becomes misleading when its assumptions disappear: “constant lookup” without hashing costs, “logarithmic search” without a sorted input, or “linear space” without saying whether the output counts.

Big O is useful because it removes incidental constants while keeping the growth that eventually dominates. It does not rank all programs at all input sizes.

<!--more-->

The examples use Swift 5.7 and bounded integer inputs. We will connect formal bounds to scans, binary search, nested loops, and dynamic-array growth.

## Upper, lower, and tight bounds answer different questions

For a nonnegative cost function `T`, an asymptotic upper bound means that positive constants `c` and `n₀` exist such that:

$$
0\le T(n)\le c f(n)\quad\text{for all }n\ge n_0.
$$

That is `T(n) ∈ O(f(n))`. A lower bound uses `Ω`; a tight bound uses `Θ`, requiring both an upper and lower bound up to constants.

A linear function is also technically `O(n²)`. Calling it `Θ(n)` conveys more information. In everyday engineering conversation, people often say “Big O” when they mean a tight growth description. Be precise when that distinction affects a proof or comparison.

Worst case, best case, and expected case choose different cost functions before the asymptotic notation is applied. Big O itself does not mean worst case.

## A scan has different best and worst cases

```swift
func linearPosition(_ target: Int, in values: [Int]) -> Int? {
    for (index, value) in values.enumerated() {
        if value == target { return index }
    }
    return nil
}

assert(linearPosition(4, in: [4, 8, 12]) == 0)
assert(linearPosition(12, in: [4, 8, 12]) == 2)
assert(linearPosition(9, in: [4, 8, 12]) == nil)
```

The best successful case inspects one element. The worst case inspects all `n`. An expected-case claim requires a probability model for target positions and misses; it does not follow from calling typical data “average.”

If a product guarantees at most five items, that fixed domain may matter more than its hypothetical infinite growth. State the bound so a future developer knows whether increasing the product limit changes the conclusion.

## Halving a search interval produces logarithmic work

```swift
func lowerBound(_ target: Int, in sorted: [Int]) -> Int {
    var low = 0
    var high = sorted.count
    while low < high {
        let middle = low + (high - low) / 2
        if sorted[middle] < target {
            low = middle + 1
        } else {
            high = middle
        }
    }
    return low
}

assert(lowerBound(4, in: [1, 4, 4, 9]) == 1)
assert(lowerBound(10, in: [1, 4, 4, 9]) == 4)
assert(lowerBound(0, in: []) == 0)
```

The insertion position remains between `low` and `high`, inclusive, while candidate elements occupy the half-open range `[low, high)`. Each iteration reduces the candidate interval by about half:

$$
\frac{n}{2^k}\le1\quad\Longrightarrow\quad k\ge\log_2 n.
$$

Array indexing supports constant-time access. Applying the same offset-based algorithm to a linked list would require walking to each midpoint and would not retain the same overall cost.

The array must already be sorted. Sorting for one lookup costs more than a single scan; building a reusable sorted index can be worthwhile for many queries. Include preprocessing in the workload model.

## Common classes describe patterns, not quality scores

| Growth | Typical source | Consequence when input doubles |
| --- | --- | --- |
| `Θ(1)` | One bounded word operation | Roughly unchanged operation count |
| `Θ(log n)` | Repeated interval halving | A bounded number of extra steps |
| `Θ(n)` | One full traversal | About twice the work |
| `Θ(n log n)` | Balanced divide-and-conquer sorting | Slightly more than twice |
| `Θ(n²)` | All ordered pairs | About four times |
| `Θ(2ⁿ)` | Enumerating all subsets | Another factor exponential in added size |

Constants still matter. A hash-based structure may use more allocations and indirect memory accesses than a scan. An asymptotically better method can lose on small inputs and win after a crossover.

## Nested loops do not automatically mean quadratic

Two loops processing collections of sizes `n` and `m` have `Θ(nm)` work when each outer iteration scans the whole second collection. If the inner cursor only moves forward across the entire run, total work can instead be linear.

```swift
func commonSorted(_ left: [Int], _ right: [Int]) -> [Int] {
    var i = 0, j = 0
    var result: [Int] = []
    while i < left.count && j < right.count {
        if left[i] == right[j] {
            result.append(left[i]); i += 1; j += 1
        } else if left[i] < right[j] {
            i += 1
        } else {
            j += 1
        }
    }
    return result
}

assert(commonSorted([1, 2, 4], [2, 3, 4]) == [2, 4])
```

Each cursor advances at most the length of its input, so total traversal is `O(n + m)`. The function uses multiset intersection behavior for duplicates, not an implicit deduplication policy.

## Amortized and expected guarantees should not be exchanged

An amortized bound accounts for expensive operations across a sequence. Dynamic-array growth is the standard example. No random input distribution is needed for the accounting argument.

Expected hash-table lookup, by contrast, depends on a hashing model. An adversarial collision pattern can change the result. An operation may be both amortized and expected when resizing and hashing both contribute assumptions.

Likewise, randomized quicksort's expected bound does not prevent an individual bad execution. If a service needs a strict work limit, expected performance alone is insufficient.

## Test boundaries before timing growth

For `lowerBound`, test before the first element, after the last, repeated equal keys, and empty input. Verify that every preceding element is smaller than the target and every following element is at least the target.

Then count comparisons at increasing sizes. Timing alone can be dominated by process startup, optimization, or cache state. A correct operation-count model and a representative benchmark provide different evidence.

## Derive a bound from a shrinking loop

A loop repeatedly dividing a positive integer by two does not run `n / 2` times. Its successive sizes are approximately `n, n/2, n/4, ...`. The number of divisions until zero is the number of bits needed to represent the original value.

```swift
func halvingSteps(_ value: Int) -> Int {
    precondition(value >= 0)
    var remaining = value
    var steps = 0
    while remaining > 0 { remaining /= 2; steps += 1 }
    return steps
}
assert(halvingSteps(0) == 0)
assert(halvingSteps(8) == 4)
assert(halvingSteps(1_024) == 11)
```

This is logarithmic in numeric value, but linear in the input's bit length. Choosing the independent variable changes the statement. The same issue appears in dynamic programming whose table size follows a numeric amount rather than its short textual encoding.

## Separate a bound from an engineering limit

An exponential search can be completely acceptable when a validated domain contains at most twelve choices. A linear scan can be unacceptable over billions of remote objects if each operation triggers I/O.

The useful conclusion includes both the growth model and the supported domain. Document the maximum input at the boundary and test rejection when it is exceeded. A hidden UI limit is weak protection if an import or background job can bypass it.

Complexity notation also omits parallelism. Two algorithms can perform the same total work while having different dependency depth. Parallel analysis adds work and span rather than pretending a task group changes a quadratic amount of work into a linear algorithm.

## Exercise: explain a triangular loop

Analyze a loop where iteration `i` examines only indices below `i`. Derive the exact count, then its tight asymptotic class. Compare it with the two-pointer intersection above and explain why source indentation cannot determine complexity.

Continue with [Analyzing Your Own Code](/swift-analyzing-algorithms/).

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
