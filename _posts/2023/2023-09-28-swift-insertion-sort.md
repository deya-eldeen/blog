---
layout: post
hidden: true
title: "Insertion Sort in Swift: Sorted Prefixes and Nearly Sorted Input"
date: "2023-09-28"
last_modified_at: "2023-09-28"
permalink: /swift-insertion-sort/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Insertion sort maintains a sorted prefix and inserts the next element into that prefix. It is a good example of an adaptive algorithm: the cost depends strongly on how far elements are from their final positions.

Its quadratic worst case does not make it useless. Small partitions and nearly sorted input are legitimate workloads, and the implementation has a compact correctness argument.

<!--more-->

The examples use Swift 5.7 and preserve equal-key order. The algorithm shifts elements rather than repeatedly swapping the inserted value with its predecessor.

## Maintain a sorted prefix

```swift
func insertionSorted<T>(_ input: [T], by before: (T, T) -> Bool) -> [T] {
    var values = input
    guard values.count > 1 else { return values }
    for index in 1..<values.count {
        let candidate = values[index]
        var position = index
        while position > 0 && before(candidate, values[position - 1]) {
            values[position] = values[position - 1]
            position -= 1
        }
        values[position] = candidate
    }
    return values
}

let cases: [[Int]] = [[], [1], [1, 2, 3], [3, 2, 1], [2, 2, 1, 2]]
for input in cases { assert(insertionSorted(input, by: <) == input.sorted()) }
assert(insertionSorted([1, 3, 2], by: >) == [3, 2, 1])
```

Before iteration `index`, the prefix ending just before that index is sorted. We save the candidate, shift strictly greater predecessors right, and put the candidate into the resulting hole.

The candidate must be saved before shifting: otherwise its original slot can be overwritten. The `position > 0` check must happen before accessing `position - 1`.

After insertion, the sorted prefix grows by one. Initially one element is trivially sorted; after the final iteration the whole array is sorted.

## Trace movement, not just comparisons

For `[2, 5, 7, 3]`, the prefix `[2, 5, 7]` is already sorted. Save `3`, shift `7` and `5`, then place `3` after `2`:

```text
2 5 7 [3]  ->  2 5 _ 7  ->  2 _ 5 7  ->  2 3 5 7
```

The hole is conceptual; the array always contains initialized values. Saving the candidate separately lets assignments reuse its original region safely.

For large value elements, moves can cost more than comparisons. Sorting compact indices into a stable external collection may reduce movement, but adds indirection and a separate ownership contract.

## Inversions give an adaptive bound

Every shifted predecessor crosses one inversion involving the candidate. Total shifts equal the number of inversions `I`, while each insertion also performs bounded overhead:

$$
T(n,I)=\Theta(n+I),\qquad 0\le I\le\frac{n(n-1)}2.
$$

Already sorted input has no inversions and takes linear work. Reversed distinct input requires quadratic shifts. “Nearly sorted” should mean few inversions or another explicit disorder model, not merely that the array looks familiar.

A single small value at the end of a sorted array can move a long distance. That is linear extra movement, not evidence that the whole algorithm becomes quadratic on every almost-sorted input.

## Strict shifts preserve stability

```swift
struct Record: Equatable { let key: Int; let id: String }
let records = [Record(key: 2, id: "first"), Record(key: 1, id: "middle"), Record(key: 2, id: "last")]
let stable = insertionSorted(records) { $0.key < $1.key }
assert(stable.map { $0.id } == ["middle", "first", "last"])
```

The inserted value does not move before an equivalent predecessor. Replacing strict comparison with a non-strict condition would reverse some equal-key identities.

Stability matters only relative to the chosen comparator. Two records with different IDs can be equivalent by score. A test containing only distinct integer keys cannot check this guarantee.

## Binary insertion reduces comparisons, not shifts

The insertion position can be found by binary search within the sorted prefix. To preserve stability, find the first position strictly after all equivalent keys, commonly called an upper bound.

```swift
func stableInsertionPosition<T>(
    for value: T, in sortedPrefix: ArraySlice<T>, by before: (T, T) -> Bool
) -> Int {
    var low = sortedPrefix.startIndex
    var high = sortedPrefix.endIndex
    while low < high {
        let middle = low + (high - low) / 2
        if before(value, sortedPrefix[middle]) { high = middle }
        else { low = middle + 1 }
    }
    return low
}

let prefix = [1, 2, 2, 4][...]
assert(stableInsertionPosition(for: 2, in: prefix, by: <) == 3)
assert(stableInsertionPosition(for: 0, in: prefix, by: <) == 0)
```

This uses array-slice integer indices, which preserve the source indices. A generic collection implementation must use the appropriate index APIs and cost assumptions.

Binary search can reduce total comparisons to `O(n log n)`, but inserting into an array still shifts up to `O(n)` elements each time. Worst-case movement remains quadratic. The distinction is valuable when comparisons are expensive and moves are cheap.

## Space and ownership still matter

The insertion loop uses constant scalar storage plus one candidate. This function also returns a value array; its result storage is linear. Copy-on-write can share the initial buffer until the first mutation.

If the input contains mutable reference elements, sorting changes the order of references, not the objects' contents. A comparator reading concurrently changing object properties can break the ordering contract regardless of container value semantics.

## Validate adaptivity rather than guessing it

Test all-equal, sorted, reversed, and a sorted prefix with a few displaced values. Instrument shifts to compare them with an independent inversion count on small arrays.

For stability, retain original identity positions and check they remain increasing within each equivalent-key group. Verify multiset preservation independently of ordering so a lost candidate cannot pass unnoticed.

## Worked comparison: one displaced suffix versus a reversal

Start with a sorted array and append one new minimum. Insertion sort processes the existing prefix with almost no shifts, then moves the final candidate across the whole prefix. Total work remains linear in the array length for this particular family of inputs.

Reversed input behaves differently: every next candidate crosses the entire sorted prefix. The shifts sum to a triangular number. Both inputs may contain a conspicuous final small value, but their total inversion counts differ dramatically.

This is why adaptivity should be explained through a measurable disorder quantity rather than a visual label such as “mostly ordered.”

## Online insertion has a different workload model

When new sorted-position items arrive one at a time, array insertion can move a suffix for each arrival. That may be acceptable for a small UI list, but a long stream can accumulate quadratic movement.

A balanced search tree can support ordered updates with logarithmic path work, while producing a flat display snapshot later still costs traversal and allocation. A heap supports next-priority removal but not arbitrary sorted indexing. Select the structure from the operations consumers actually need.

Binary insertion reduces comparisons when ordering is expensive; it does not eliminate suffix movement. A benchmark should separate key derivation, search, movement, and final output construction to explain the observed result.

## Preserve one candidate through every shift

A useful test gives every equal-key record a unique identity and checks both multiset preservation and stability after each insertion stage. Losing the saved candidate can leave an ordered array with one duplicated predecessor, which key-only sortedness misses.

Also test a slice whose start index is not zero when using the binary-position helper. Its returned index belongs to the source array's index space, not an automatically rebased position.

## Exercise: build binary insertion sort

Use `stableInsertionPosition` to choose each candidate's destination, then shift the suffix of the sorted prefix. Compare outputs with the linear-search version and count comparisons and writes separately.

Explain why a measured comparison reduction does not establish a total runtime improvement for cheap integer comparisons. Continue with [Selection Sort](/swift-selection-sort/) for an algorithm that makes a different tradeoff between comparisons and writes.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
