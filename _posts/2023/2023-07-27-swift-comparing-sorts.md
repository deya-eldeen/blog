---
layout: post
hidden: true
title: "Comparing Sorting Algorithms in Swift: Stability, Memory, and Real Workloads"
date: "2023-07-27"
last_modified_at: "2023-07-27"
permalink: /swift-comparing-sorts/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Choosing a sorting algorithm starts with a contract: what defines order, what happens to equal keys, how large the input can be, and how much extra storage is acceptable. A list of Big O labels cannot answer those questions alone.

For application code, the standard library is the usual starting point. Implementing classic sorts is valuable for understanding invariants and tradeoffs, and for recognizing when the real task is selection or indexing rather than sorting everything.

<!--more-->

The examples use Swift 5.7-compatible syntax. As of this article's July 2023 date, [SE-0372](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0372-document-sorting-as-stable.md), implemented in Swift 5.8, explicitly documents standard-library sorting as stable; the implementation had already been stable earlier. That distinction matters when discussing historical API guarantees.

## Compare implementations with the same output contract

| Algorithm, conventional array form | Best time | Worst time | Auxiliary storage | Stable? |
| --- | --- | --- | --- | --- |
| Bubble, with early exit | `O(n)` | `O(n²)` | `O(1)` | Yes with strict adjacent swaps |
| Insertion | `O(n)` | `O(n²)` | `O(1)` | Yes with strict shifts |
| Selection, swap-based | `O(n²)` | `O(n²)` | `O(1)` | Usually no |
| Merge | `O(n log n)` | `O(n log n)` | `O(n)` | Yes with left-first ties |
| Quicksort, in-place partitioning | `O(n log n)` balanced | `O(n²)` | Depends on recursion | Usually no |
| Heap sort | `O(n log n)` | `O(n log n)` | `O(1)` | No |

These rows describe particular conventional implementations. A functional quicksort allocating partition arrays has a different space profile. An adaptive merge sort can improve its best case. A copy-returning API allocates output even if the underlying algorithm is called in-place.

## A comparator must describe a coherent strict order

```swift
struct Ticket: Equatable {
    let id: Int
    let priority: Int
    let arrival: Int
}

func precedes(_ a: Ticket, _ b: Ticket) -> Bool {
    if a.priority != b.priority { return a.priority > b.priority }
    if a.arrival != b.arrival { return a.arrival < b.arrival }
    return a.id < b.id
}

let tickets = [
    Ticket(id: 3, priority: 2, arrival: 10),
    Ticket(id: 1, priority: 2, arrival: 10),
    Ticket(id: 2, priority: 1, arrival: 1)
]
assert(tickets.sorted(by: precedes).map { $0.id } == [1, 3, 2])
for ticket in tickets { assert(!precedes(ticket, ticket)) }
```

Using `<=` violates strictness because an item precedes itself. Reading a changing clock or mutating key state inside the comparator can make comparisons inconsistent during one sort.

Floating-point NaN needs a deliberate ordering policy because ordinary numeric comparisons do not behave like an ordinary total order over all floating-point values. Normalize or classify exceptional values before relying on sorting relationships.

## Stability preserves input order within equivalent keys

Two records can compare equivalent by the chosen key while differing in identity. Stability keeps their original relative order. This is useful when the input already carries a meaningful secondary order.

An explicit ID tie-breaker, as above, instead defines that secondary order directly. Stability and deterministic tie-breaking are different tools: a stable sort of a nondeterministically ordered source does not invent a deterministic order for equivalent records.

Test stability using tagged duplicate keys. Sorting integers alone cannot reveal the relative order of equal integers because their identities are indistinguishable.

## Comparison sorting has a lower bound with assumptions

A comparison sort must distinguish among `n!` possible permutations of distinct items. A binary decision tree needs enough leaves:

$$
2^h\ge n!\quad\Longrightarrow\quad h\ge\log_2(n!)=\Omega(n\log n).
$$

This is a worst-case comparison lower bound. Counting sort and radix sort use assumptions about key representation and range, so they are not counterexamples. Nearly sorted input or repeated keys also changes the information the algorithm must discover.

## Measure comparisons separately from total time

```swift
func countedSort<T>(_ input: [T], by before: (T, T) -> Bool) -> (values: [T], comparisons: Int) {
    var comparisons = 0
    let result = input.sorted { a, b in
        comparisons += 1
        return before(a, b)
    }
    return (result, comparisons)
}

let measured = countedSort([4, 1, 3, 1], by: <)
assert(measured.values == [1, 1, 3, 4])
assert(measured.comparisons > 0)
```

Do not assert an exact standard-library comparison count: that is an implementation detail. The instrumentation is useful for comparing growth or expensive key extraction, while a release benchmark measures allocations, moves, branches, and locality too.

If computing a sort key is expensive, decorate each item with its key once, sort the decorated values, then extract items. That trades storage for avoiding repeated key computation. Include decoration in the measured workload.

## Input distribution changes practical behavior

Test sorted, reversed, random, nearly sorted, and duplicate-heavy data. Insertion sort is adaptive to a small number of inversions. Three-way quicksort can handle equal keys better than a partition that repeatedly peels off one equal element.

The size and cost of elements matter too. Moving a large value can be more expensive than comparing an integer key. Sorting compact indices or references can reduce movement, but adds indirection and must preserve ownership and identity semantics.

A benchmark over ten integers cannot justify a decision about sorting a million reference-bearing records.

## Ask whether the consumer needs a full ordering

For one minimum, a linear scan is sufficient. For the best `k` items, a bounded heap may use `O(n log k)` work and `O(k)` retained candidates, followed by sorting those candidates if output order is required.

For repeated insertion and removal of the next priority, a priority queue avoids resorting the whole collection after each edit. For repeated exact lookup, hashing may be more appropriate than sorting at all.

The fastest full sort can still be unnecessary work when the actual question is smaller.

## Test correctness beyond ascending output

A sorting result must be ordered and preserve the input multiset. A function returning an empty array is ordered but wrong. For records, verify every original identity appears exactly once.

For a stable algorithm, compare original identity order within each key group. Include empty input, a single value, duplicates, and cases where the comparator orders descending rather than ascending.

## Case study: expensive display-name ordering

Suppose sorting people requires a normalized collation key. If the comparator computes that key for both items on every call, a comparison-efficient algorithm can still repeat expensive work many times.

Decorate each person with its key once, sort those decorated values, and then extract the person. Preserve an original position or stable ID if equal keys need a specified secondary rule. This changes the cost model from repeated key derivation to linear preprocessing plus comparisons of prepared keys.

The extra array and retained keys consume memory. If only one minimum is needed, computing each key once during a scan may be simpler and use less retained state. The output requirement still determines the right algorithm.

## Benchmark identities as well as values

For records with duplicate primary keys, attach unique IDs and verify the output contains exactly those IDs. Otherwise a sorting bug that duplicates one equal-key record and drops another can pass a key-only comparison.

Check stability separately from sortedness. A stable result must preserve original identity order within each equivalent-key class, while a deterministic explicit tie-breaker may intentionally replace that source order.

Use the same comparator and fixture for every implementation. Sorting ascending integers in one benchmark and allocating normalized string keys in another compares workloads rather than algorithms.

Finally, keep correctness checks outside the timed section when measuring the sort alone, but run them on every measured result. An optimized benchmark whose output is never observed can accidentally measure eliminated or incomplete work.

## Exercise: choose a report strategy

A report contains one million entries, but the UI displays only the twenty highest scores. Compare full sorting with a bounded min-heap retaining twenty candidates. Define a deterministic tie policy and include the final twenty-item ordering in both cost models.

Continue with [Bubble Sort](/swift-bubble-sort/), [Insertion Sort](/swift-insertion-sort/), and [Merge Sort](/swift-merge-sort/) for executable implementations.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
