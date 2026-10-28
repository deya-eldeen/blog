---
layout: post
hidden: true
title: "Time and Space Complexity in Swift: Count Work, Copies, and Live Storage"
date: "2023-01-26"
last_modified_at: "2023-01-26"
permalink: /swift-time-space-complexity/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A feed can become slow even when each visible line of Swift looks harmless. A membership test inside a loop, an array copied on mutation, or a search performed for every row changes the cost of the whole feature. Complexity analysis makes those costs explicit before a benchmark tells you the current machine is fast enough.

Time complexity describes how work grows with input. Space complexity describes storage that must be live during that work. Neither is a stopwatch reading or an exact allocation count.

<!--more-->

These examples use Swift 5.7. We will preserve the order of the first occurrence while removing duplicate identifiers, then compare two implementations of the same contract.

## Define the input and the observable result

Let `n` be the number of identifiers, including duplicates, and `u` the number of distinct identifiers. The output must contain exactly those distinct values in first-occurrence order. Sorting would change that contract.

```swift
func uniqueByScanning(_ input: [Int]) -> [Int] {
    var output: [Int] = []
    for value in input {
        if !output.contains(value) { output.append(value) }
    }
    return output
}

func uniqueWithIndex(_ input: [Int]) -> [Int] {
    var seen: Set<Int> = []
    var output: [Int] = []
    for value in input {
        if seen.insert(value).inserted { output.append(value) }
    }
    return output
}

let ids = [7, 2, 7, 4, 2]
assert(uniqueByScanning(ids) == [7, 2, 4])
assert(uniqueWithIndex(ids) == uniqueByScanning(ids))
assert(uniqueWithIndex([]).isEmpty)
```

The first version searches the growing output for every input element. With all distinct values, it compares against prefixes of lengths zero through `n - 1`:

$$
\sum_{i=0}^{n-1}i=\frac{n(n-1)}{2}=\Theta(n^2).
$$

The second uses expected constant-time set operations for fixed-size integer keys, giving expected linear work and linear additional storage. Its guarantee depends on hashing behavior; it is not a deterministic constant-time bound against every possible key distribution.

## Count the operation that actually dominates

For integers, equality and hashing have bounded machine-word costs. For strings, both can involve key contents. If there are `n` identifiers of length up to `L`, include the cost of processing those contents rather than asserting that every dictionary lookup is free of key length.

Likewise, comparing two images, decoding a record, or computing a localized collation key may dominate traversal. A useful model names the unit: comparisons, bytes inspected, nodes visited, or network requests.

One network request is not constant wall-clock time just because it appears once in the source. A model can count requests while a separate latency model explains transport and server behavior. State which question the model answers.

## Separate output space from auxiliary space

Both implementations produce an output array of up to `u` integers. The indexed version additionally stores up to `u` set entries. If output space is excluded, say so; otherwise two authors can report different space bounds for the same program without disagreeing about the implementation.

Recursion also consumes storage. A recursive tree walk may need `O(h)` stack frames for height `h`, even if it never constructs an explicit stack. A balanced tree and a chain have very different heights.

Peak live storage matters more than summing every allocation ever made. A loop can allocate and release many temporary buffers while keeping only one live. Conversely, an undo history can retain old large buffers long after the newest state stops using them.

## Value semantics introduce conditional copying

```swift
var original = Array(0..<8)
var edited = original
edited[0] = 99
assert(original[0] == 0)
assert(edited[0] == 99)
```

Assignment preserves value independence without requiring an eager deep buffer copy. A later mutation of shared array storage may need a linear copy. Repeatedly creating an alias before each mutation can therefore change an apparently constant-time update into repeated linear work.

Read [Copy-on-Write](/swift-copy-on-write/) for the ownership mechanism. Complexity must describe the ownership scenario as well as the method name. Unique-owner append, shared-owner first mutation, and many retained versions are different workloads.

## Amortized work is different from worst-call work

An array can occasionally grow its buffer during append. With geometric capacity growth, the total elements copied over a long sequence of appends is bounded by a geometric sum:

$$
1+2+4+\cdots+2^k < 2^{k+1}.
$$

This supports amortized constant work per append under the growth model, while an individual append can be linear. Amortization is an accounting argument over a sequence, not a claim that the average random input is favorable.

Calling `reserveCapacity` once with a justified estimate can avoid some growth. Calling it for exactly one more element before every append can interfere with efficient growth. Capacity is a resource policy, not a ritual to add inside every loop.

## Validate the model with operation counts

```swift
func scanComparisons(_ input: [Int]) -> Int {
    var output: [Int] = []
    var comparisons = 0
    for value in input {
        var found = false
        for existing in output {
            comparisons += 1
            if existing == value { found = true; break }
        }
        if !found { output.append(value) }
    }
    return comparisons
}

for n in 0...20 {
    assert(scanComparisons(Array(0..<n)) == n * (n - 1) / 2)
}
```

This verifies the derived comparison count over a bounded domain. It does not measure allocator cost, cache misses, or set performance. Use a release-build benchmark to answer those runtime questions after establishing equal output behavior.

Test empty input, all duplicates, all distinct input, and interleaved repetitions. A useful property is that applying deduplication twice has no further effect. Also verify every output value came from the input and that first-occurrence order is preserved.

## Choose the tradeoff from the workload

For a tiny bounded list, a scan may be simpler and avoid a hash allocation. For a large feed, expected linear deduplication is usually a better starting point. If memory is tightly constrained, an in-place or sorted-input approach may be appropriate only if its ordering contract fits.

Complexity narrows the candidates. Measurements distinguish candidates whose asymptotic behavior is adequate. Neither should replace a statement of the feature's actual behavior.

## Case study: budget a scrolling feed refresh

Suppose a refresh receives ten thousand event IDs, while the visible screen shows twenty rows. Deduplicating the entire batch by repeated scans can still perform roughly fifty million integer comparisons in the all-distinct case. The small visible row count does not bound the preprocessing workload.

An indexed deduplication visits each ID once under expected hash behavior. If rendering then needs only twenty eligible rows, a bounded selection stage can avoid constructing view models for every remaining event. Analyze those stages separately: deduplication size, eligibility scans, output construction, and final display count are different dimensions.

A refresh pipeline may also keep the previous feed visible while constructing the next. Peak memory can then include old state, new input, a membership index, and new output simultaneously. Releasing temporary data before publishing the replacement can matter even when every individual stage is linear.

This is why “the algorithm uses O(n) space” needs a lifetime diagram or a clear ownership description when used to estimate a feature's memory budget.

## Use scaling experiments to challenge the model

If the modeled operation count is quadratic, doubling a sufficiently large input should approach four times that counted work. If elapsed time does not follow, investigate setup costs, early exits, compiler optimization, or a changed distribution rather than declaring the mathematics disproved.

Conversely, a fourfold timing increase is not proof of quadratic complexity. Crossing a cache or memory threshold can change constants abruptly. Count the modeled operation and profile runtime behavior to distinguish those causes.

A reproducible performance report states which input dimensions changed and which remained fixed. “Ten thousand records” is incomplete if key lengths, duplicate rate, or retained versions changed too.

## Distinguish total traffic from peak live memory

Imagine processing a thousand batches, each allocating a temporary buffer of one thousand integers and releasing it before the next batch. Allocation traffic can sum to a million integers while peak temporary storage stays near one batch.

Now retain all those buffers in a history array. The same per-batch code has a very different peak because the owner extends every lifetime. A local complexity explanation that ignores the history owner misses the feature's actual memory behavior.

Copy-on-write adds another distinction. Keeping a thousand unchanged aliases may share one buffer, while editing one element in every retained version can require a thousand separated buffers. The number of variables alone predicts neither outcome.

A useful measurement therefore reports allocation traffic, peak resident or retained memory, and the ownership scenario separately. These metrics explain different failure modes: allocator overhead, a transient memory spike, and long-lived retention are not interchangeable.

## Exercise: account for two sizes

Deduplicate `n` event IDs against a preexisting collection of `m` IDs while preserving new-event order. Derive the scan cost and the indexed cost, including index construction. Test `m = 0`, `n = 0`, and repeated events within the new batch.

Consult [Array](https://developer.apple.com/documentation/swift/array) and [Set](https://developer.apple.com/documentation/swift/set) for the collection contracts. Continue with [Big O](/swift-big-o/).

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
