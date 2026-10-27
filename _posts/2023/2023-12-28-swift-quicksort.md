---
layout: post
hidden: true
title: "Quicksort in Swift: Three-Way Partitioning and Duplicate Keys"
date: "2023-12-28"
last_modified_at: "2023-12-28"
permalink: /swift-quicksort/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Quicksort partitions a region around a pivot and sorts the remaining regions. Its speed comes from doing useful ordering work during partitioning; its risks come from unbalanced partitions, duplicate handling, and recursion depth.

A three-way partition separates values before, equivalent to, and after the pivot. Equivalent values can then be excluded from further recursion, which is particularly valuable for duplicate-heavy data.

<!--more-->

The Swift 5.7 implementation below uses a deterministic middle-position pivot. It is not randomized and does not claim a worst-case `O(n log n)` time guarantee. It recurses on the smaller side and iterates on the larger to bound call-stack depth.

## Maintain four regions during partitioning

At every step, the region contains a less-than prefix, an equivalent middle, an unknown section, and a greater-than suffix. Indices `less`, `scan`, and `greater` mark those boundaries.

```swift
func quickSorted<T>(_ input: [T], by before: (T, T) -> Bool) -> [T] {
    var values = input
    func sort(_ start: Int, _ end: Int) {
        var low = start
        var high = end
        while high - low > 1 {
            let pivot = values[low + (high - low) / 2]
            var less = low
            var scan = low
            var greater = high
            while scan < greater {
                if before(values[scan], pivot) {
                    values.swapAt(less, scan)
                    less += 1; scan += 1
                } else if before(pivot, values[scan]) {
                    greater -= 1
                    values.swapAt(scan, greater)
                } else {
                    scan += 1
                }
            }
            if less - low < high - greater {
                sort(low, less)
                low = greater
            } else {
                sort(greater, high)
                high = less
            }
        }
    }
    sort(0, values.count)
    return values
}

let examples: [[Int]] = [[], [1], [4, 1, 3, 2], [2, 2, 2], [9, 1, 9, 0, 9, 3]]
for input in examples { assert(quickSorted(input, by: <) == input.sorted()) }
assert(quickSorted([1, 3, 2], by: >) == [3, 2, 1])
```

When a large item is exchanged with the unknown section's last item, the new item at `scan` has not been examined. That branch must not advance `scan`. Skipping it is a common partition bug.

The pivot value is copied before exchanges. Holding only its original index and repeatedly reading that location would let swaps change the effective pivot midway through the partition.

## Equivalence comes from the comparator

An item is equivalent to the pivot when neither strictly precedes the other. This does not require the payload type to conform to `Equatable`, and equivalence may involve only a key.

For a valid strict weak ordering, the three regions can be reasoned about coherently. Floating-point NaN or a changing comparator may violate those assumptions. A generic function cannot repair an invalid ordering policy.

After partitioning, every item in the less region precedes the equivalent region, and every item in the greater region follows it. Only the outer regions need more sorting.

## Duplicate-heavy input benefits directly

On all-equivalent input, the scan visits every element once and both outer regions are empty. This gives linear partition work and no substantial recursive subproblem.

A two-way partition that repeatedly places only one equal pivot can instead create a chain of nearly full-size problems. Duplicate handling is therefore part of the complexity argument, not just a micro-optimization.

The implementation remains unstable because long-distance exchanges can reverse equivalent identities. Do not infer stability from the fact that equivalent items are grouped together at the end.

## Balanced partitions and bad partitions have different recurrences

With reasonably balanced splits:

$$
T(n)=T(a)+T(b)+\Theta(n),\qquad a+b\le n,\quad a,b\approx n/2,
$$

which yields `O(n log n)`. Repeatedly separating one small item from a nearly complete remaining region produces:

$$
T(n)=T(n-1)+\Theta(n)=\Theta(n^2).
$$

A middle-position pivot avoids some obvious sorted-input failures but is not a median-of-values guarantee. Adversarial arrangements can still produce poor splits.

Random pivot selection supports an expected bound under a specified randomness model. Introspective sorting can detect excessive partition depth and fall back to an algorithm with a worst-case bound. Neither behavior is implemented implicitly by choosing the middle index.

## Smaller-side recursion controls stack space

The recursively processed side is at most half the non-equivalent region. Thus each additional recursive frame handles at most about half its parent's size, bounding call-stack depth by `O(log n)`.

The larger side is processed by the surrounding loop. This avoids relying on compiler tail-call optimization and preserves the stack bound even when time becomes quadratic.

The copy-returning array still needs result storage. Calling the partition algorithm in-place describes its array operations, not a promise that returning a separate value uses constant total memory.

## Validate partition behavior over repeated keys

```swift
for a in 0...3 {
    for b in 0...3 {
        for c in 0...3 {
            let values = [a, b, c, a]
            assert(quickSorted(values, by: <) == values.sorted())
        }
    }
}
```

Also test sorted and reversed longer inputs, all-equal arrays, and one outlier among many duplicates. For record payloads, verify identity preservation even though identity ordering within equal keys is not promised.

Operation-count benchmarks should distinguish comparator calls, exchanges, and stack depth. A fast run on uniformly random integers says little about a workload dominated by repeated keys or expensive comparisons.

## A partition trace should expose all boundaries

For a debugging view, record `low`, `less`, `scan`, `greater`, and `high`, not just the pivot value. The invariant divides the region into four sections: values before the pivot, equivalent values, unknown values, and values after it.

At each iteration, the unknown section shrinks by one: either `scan` increases or `greater` decreases. That supplies a termination argument independent of whether a swap exchanged two identical values.

A test hook can check the three classified sections after every step on small fixtures. Keep that expensive inspection out of performance measurements. It is an executable invariant checker, not part of the production partition cost.

## Compare pivot policies under the same algorithm

Changing from the middle position to a median-of-three sample can improve some distributions without changing the three-way invariant. It still does not provide a worst-case median guarantee.

Randomization changes the probability model, while a depth-triggered fallback changes the worst-case guarantee. These are distinct protections and can be combined. Retain the input and random seed when diagnosing a bad run.

If the comparator itself is inconsistent, no pivot policy repairs correctness. Validate ordering assumptions separately from tests of partition balance and stack depth.

## Exercise: add a robust pivot policy

Add seeded random pivot selection so a failure can be reproduced. Then track partition depth and fall back to heap sort after a documented threshold. Keep the three-way invariant and smaller-side recursion intact, and compare all-equal and adversarial fixtures separately.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
