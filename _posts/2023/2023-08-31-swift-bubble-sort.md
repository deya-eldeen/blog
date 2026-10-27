---
layout: post
hidden: true
title: "Bubble Sort in Swift: Inversions, Early Exit, and a Correctness Invariant"
date: "2023-08-31"
last_modified_at: "2023-08-31"
permalink: /swift-bubble-sort/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Bubble sort repeatedly swaps adjacent out-of-order elements. Its practical importance is limited, but it offers a clear connection between a local operation, a global ordering invariant, and an exact measure of disorder: inversions.

A useful implementation should handle empty input, stop when a pass makes no changes, and avoid rescanning a suffix already known to be ordered.

<!--more-->

The code uses Swift 5.7 and a strict comparator. The function returns a sorted copy, so account for output storage separately from the algorithm's constant local state.

## A pass moves a large element toward the end

For `[4, 1, 3, 2]`, the first pass compares neighbors:

```text
4 1 3 2  ->  1 4 3 2  ->  1 3 4 2  ->  1 3 2 4
```

The largest element is now at the end. Repeating over the remaining prefix eventually fixes every position. No element jumps across another except through an adjacent swap.

```swift
func bubbleSorted<T>(_ input: [T], by before: (T, T) -> Bool) -> [T] {
    var values = input
    var upper = values.count
    while upper > 1 {
        var lastSwap = 0
        for index in 1..<upper {
            if before(values[index], values[index - 1]) {
                values.swapAt(index, index - 1)
                lastSwap = index
            }
        }
        upper = lastSwap
    }
    return values
}

let cases: [[Int]] = [[], [1], [1, 2, 3], [4, 3, 2, 1], [2, 1, 2, 0]]
for input in cases { assert(bubbleSorted(input, by: <) == input.sorted()) }
assert(bubbleSorted([1, 3, 2], by: >) == [3, 2, 1])
```

The `upper > 1` guard avoids invalid ranges for empty and singleton arrays. `lastSwap` is zero when no exchange occurs, terminating the algorithm immediately.

## Why the last-swap boundary is valid

During a pass, the greatest element encountered so far travels right. After the last swap, all remaining adjacent pairs are already ordered and no larger displaced element remains to cross that suffix.

Consequently, the suffix beginning at the last-swap boundary is settled relative to the unsorted prefix. The next pass only needs indices below that boundary.

This is stronger than blindly reducing the upper bound by one. If a small disturbance occurs near the beginning of a mostly sorted array, the next scan can become much shorter.

The proof still assumes a coherent strict ordering. A stateful comparator can invalidate the argument even if every individual swap seems sensible.

## Inversions explain the swap count

An inversion is a pair of positions `i < j` whose values are in the wrong relative order. Swapping an adjacent inverted pair removes exactly one inversion.

$$
0\le I\le\frac{n(n-1)}{2}.
$$

For a valid strict ordering, bubble sort performs exactly `I` adjacent swaps. Reversed distinct input has the maximum number of inversions, so its swap count is quadratic.

That does not make comparison count equal to swap count. The algorithm also compares already ordered neighbors while discovering where disorder remains.

## Early exit changes the best case

On sorted input, one pass makes `n - 1` comparisons and no swaps, giving linear time. Worst-case input still requires a triangular number of comparisons:

$$
(n-1)+(n-2)+\cdots+1=\frac{n(n-1)}{2}.
$$

The last-swap optimization improves some workloads but does not change that worst-case class. An implementation without early exit remains quadratic even on already sorted data.

Auxiliary scalar state is constant. Returning a copy requires an array result of size `n`, and copy-on-write may defer its physical separation until the first mutation. It is misleading to describe the entire copy-returning API as using no extra storage.

## Stability follows from strict adjacent swaps

Equal-key elements are never swapped directly, and adjacent swaps cannot reverse their relative order without crossing them. This makes the implementation stable.

```swift
struct Row: Equatable { let key: Int; let label: String }
let rows = [Row(key: 2, label: "a"), Row(key: 1, label: "b"), Row(key: 2, label: "c")]
let orderedRows = bubbleSorted(rows) { $0.key < $1.key }
assert(orderedRows.map { $0.label } == ["b", "a", "c"])
```

Changing the comparison to “less than or equal” swaps equivalent values, destroys stability, and violates the strict-comparator contract. A harmless-looking operator change has a behavioral consequence.

## Small tests can explore every arrangement

```swift
for a in 0...2 {
    for b in 0...2 {
        for c in 0...2 {
            let input = [a, b, c]
            assert(bubbleSorted(input, by: <) == input.sorted())
        }
    }
}
```

This bounded domain covers duplicate-heavy triples and every relative arrangement of those keys. Larger generated arrays can extend coverage, while explicit empty and singleton cases protect range boundaries.

When testing an implementation without a reference sort, check both ordering and multiset preservation. An ordered result that drops values is not a successful sort.

## When the algorithm is useful

Bubble sort is suitable for tracing invariants and visualizing adjacent exchanges. It can also serve as a small reference implementation in educational tests.

For nearly sorted arrays, insertion sort generally expresses the same adaptive opportunity with fewer moves. For general application sorting, use the standard library unless a measured requirement justifies a specialized implementation.

Do not select bubble sort because it has two short loops or because one small benchmark ran quickly. Quadratic growth becomes decisive once the input limit changes.

## An inversion counter gives an independent structural check

```swift
func inversions(_ values: [Int]) -> Int {
    var total = 0
    for i in values.indices {
        for j in (i + 1)..<values.count where values[j] < values[i] { total += 1 }
    }
    return total
}
assert(inversions([1, 2, 3]) == 0)
assert(inversions([3, 2, 1]) == 3)
assert(inversions([2, 1, 2]) == 1)
```

This quadratic helper is intentionally a small-input oracle. It expresses the mathematical definition directly, making it suitable for checking a swap-instrumented bubble sort without sharing the sorting loop's boundary logic.

For larger datasets, inversion counting can be integrated into merge sort: when a right item precedes a remaining left item, it crosses all unread left items. That improves counting to `O(n log n)` but introduces a more involved proof.

## A trace is a view of an algorithm, not its scheduler

An educational visualization should record exchange events and replay them at a chosen display pace. Sleeping inside the comparison or swap loop mixes presentation timing with algorithm execution and makes performance measurements meaningless.

Keep a bounded trace or stream events under an explicit buffering policy; quadratic algorithms can emit quadratic events. An animation of a hundred thousand swaps can consume more memory in its trace than in the array being sorted.

The same separation lets tests compare the final result without running a UI and lets a viewer pause replay without leaving the underlying array in a partially exposed shared state.

## Exercise: record a trace without changing the algorithm

Add an observer that receives the exchanged indices after each swap. Keep the observer outside the comparison rule. Verify the number of observed swaps equals an independently computed inversion count on small arrays.

Then compare sorted and reversed inputs of increasing size. Count comparisons and swaps separately, and explain which optimization changes which count.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
