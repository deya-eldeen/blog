---
layout: post
hidden: true
title: "Selection Sort in Swift: Minimum Selection and the Cost of Writes"
date: "2023-10-26"
last_modified_at: "2023-10-26"
permalink: /swift-selection-sort/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Selection sort repeatedly finds the smallest remaining element and moves it to the next output position. It performs many comparisons but relatively few exchanges. That tradeoff distinguishes it from insertion and bubble sort even though all three have quadratic worst-case time.

The algorithm is useful for understanding selection invariants and the difference between comparison cost and movement cost. Its simplicity does not make it the default choice for sorting application data.

<!--more-->

The Swift 5.7 implementation below sorts a copy using a strict comparator. Equal keys are preserved as values, but their original identity order is not guaranteed.

## Fix one position per pass

```swift
func selectionSorted<T>(_ input: [T], by before: (T, T) -> Bool) -> [T] {
    var values = input
    guard values.count > 1 else { return values }
    for start in 0..<(values.count - 1) {
        var best = start
        for candidate in (start + 1)..<values.count {
            if before(values[candidate], values[best]) { best = candidate }
        }
        if best != start { values.swapAt(start, best) }
    }
    return values
}

let examples: [[Int]] = [[], [1], [4, 1, 3, 2], [2, 2, 1], [1, 2, 3]]
for values in examples { assert(selectionSorted(values, by: <) == values.sorted()) }
assert(selectionSorted([1, 3, 2], by: >) == [3, 2, 1])
```

Before pass `start`, the preceding prefix contains the smallest elements in their final order. The inner scan chooses the minimum of the remaining suffix. Exchanging it with `start` extends the fixed prefix by one.

The final position needs no scan because every preceding position is already correct. The empty and singleton guard prevents constructing inappropriate loop ranges.

## Derive the comparison count

Unlike insertion sort, ordinary selection sort does not exploit an already sorted prefix beyond the one it explicitly builds. Each pass scans the whole remaining suffix:

$$
C(n)=(n-1)+(n-2)+\cdots+1=\frac{n(n-1)}2.
$$

That count holds for sorted, reversed, and random input under this implementation. There is no early exit merely because one selected minimum was already in the correct position; later suffix elements may still be unordered.

The number of exchanges is at most `n - 1`, and the `best != start` check avoids self-swaps. Each exchange still performs moves whose actual cost depends on element representation and compiler optimization.

## Fewer swaps do not automatically mean faster

If moving elements is expensive relative to comparing keys, selection sort's low exchange count can be attractive in a tightly bounded workload. But its quadratic comparisons remain, and sorting compact indices may be a better way to avoid moving large values.

Do not translate “few writes” directly into a storage-device endurance claim. A Swift array assignment is not one flash write. Filesystem buffering, encoding, and physical device behavior are separate layers.

For ordinary integer arrays, cache behavior and branch costs also matter. Benchmark the complete workload before preferring a quadratic algorithm based on one operation count.

## The long-distance swap breaks stability

```swift
struct Tagged: Equatable { let key: Int; let id: String }
let tagged = [Tagged(key: 2, id: "a"), Tagged(key: 2, id: "b"), Tagged(key: 1, id: "x")]
let result = selectionSorted(tagged) { $0.key < $1.key }
assert(result.map { $0.id } == ["x", "b", "a"])
```

The first exchange moves `a` past `b`, reversing equal-key identities even though the comparison itself is strict. Strict comparison is enough for stable adjacent bubble swaps; it is not enough for arbitrary exchanges.

A stable selection variant can remove the chosen minimum and shift intervening values right before inserting it. That preserves identity order but increases movement, giving up the main low-exchange property of the swap-based version.

An explicit secondary identity key can define a total order, but that is a different contract from preserving the source order of equivalent primary keys.

## Selection is a smaller task than sorting

Finding one minimum requires one scan, not repeated selection passes. Finding the best `k` elements can stop after `k` passes, giving `O(kn)` comparisons, though a heap or selection algorithm may be better for large inputs.

For `k = 1`, the linear scan is optimal in comparisons without additional assumptions. For `k` growing with `n`, repeated scans become expensive. Include `k` as an independent parameter instead of calling every partial-selection workload quadratic.

If output needs only the top twenty rows, [Heaps and Priority Queues](/swift-heaps-priority-queues/) offer a more scalable candidate structure than repeatedly selecting a minimum from the whole remaining dataset.

## Value semantics affect the API's memory cost

The loop itself keeps constant scalar state. The function returns a new array value, which can require `O(n)` result storage. On first mutation, copy-on-write may separate storage shared with the input.

A mutating `inout` version can reuse unique storage, but callers retaining other array versions can still trigger separation. State the ownership workload when making an in-place storage claim.

Reference-bearing elements remain shared objects. Reordering references does not clone their contents or protect a comparator from concurrent changes to their keys.

## Test selection invariants as well as final output

For a tracing implementation, inspect the fixed prefix after each pass: it must be ordered, and no remaining suffix element may precede its last value. This catches incorrect scan boundaries earlier than a final-array comparison.

Final tests should verify ordering, multiset preservation, empty input, duplicates, and descending comparators. Include the tagged counterexample to document the intended lack of stability.

A bounded exhaustive test over triples is useful because it covers every arrangement of a small key alphabet. Do not assert exact move counts against an implementation that may optimize swaps differently; count explicit algorithmic exchanges if that is the metric under study.

## A partial prefix can answer a bounded selection query

If a caller needs the smallest three values in order, selection can stop after fixing three positions. The remainder is not sorted and should not be exposed as though it were.

For fixed small `k`, repeated minimum selection has `O(kn)` work and constant structural state. A bounded heap has a different constant and memory profile, while an order-statistic selection algorithm can partition around the kth item without fully ordering either side.

The result contract matters: “which values belong to the smallest k” is weaker than “return those values in sorted order.” Include the final k-item sort when comparing an unordered partition approach with an already ordered prefix.

## Avoid making a teaching algorithm look universal

Selection sort's exact comparison count is useful evidence for a model. It does not establish a product performance target. Real sorts have different element sizes, key costs, and memory behavior.

A production decision should state the bounded domain where the quadratic scan is acceptable. If a screen later changes from fifty rows to fifty thousand imported records, that assumption must be reconsidered even if the implementation did not change.

## Tie policy is visible in partial selection too

When several records share the boundary score, different algorithms can choose different identities for the last selected position. Define whether all boundary ties are included, exactly k records are returned, or stable source order resolves them.

A score-only comparison and a hard k limit cannot satisfy all three policies simultaneously. Add explicit identity rules or broaden the output contract instead of relying on whatever record happens to be swapped first.

## Exercise: compare selection with insertion

Instrument comparisons and explicit assignments in both algorithms for sorted, reversed, and duplicate-heavy arrays. Define what counts as a write in the instrumentation. Explain why selection does the same number of comparisons on sorted input while insertion can finish with linear work.

Then implement the stable shifting variant and verify equal-key identity order. State exactly which cost increased to obtain that guarantee.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
