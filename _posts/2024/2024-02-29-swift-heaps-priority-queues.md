---
layout: post
hidden: true
title: "Heaps and Priority Queues in Swift: Maintain the Next Best Item"
date: "2024-02-29"
last_modified_at: "2024-02-29"
permalink: /swift-heaps-priority-queues/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A priority queue repeatedly returns the next best item according to an ordering. A binary heap supports that operation without keeping the entire array sorted. Its invariant is local: every parent has priority at least as high as its children.

That is enough to find the best item at the root, but not enough to iterate all items in sorted order or search arbitrary values quickly.

<!--more-->

These Swift 5.7 examples implement a generic min- or max-priority heap, demonstrate bottom-up construction, and use a small heap to retain a top-k result.

## Store a complete tree in an array

For index `i > 0`, the parent is `(i - 1) / 2`. Children are `2i + 1` and `2i + 2`, when those indices exist. Completeness keeps the height logarithmic without pointers or rotations.

```swift
struct Heap<Element> {
    private var storage: [Element]
    private let before: (Element, Element) -> Bool
    var count: Int { storage.count }
    var peek: Element? { storage.first }

    init(_ elements: [Element] = [], by before: @escaping (Element, Element) -> Bool) {
        storage = elements
        self.before = before
        if storage.count > 1 {
            for index in stride(from: storage.count / 2 - 1, through: 0, by: -1) {
                siftDown(index)
            }
        }
    }

    mutating func insert(_ value: Element) {
        storage.append(value)
        var child = storage.count - 1
        while child > 0 {
            let parent = (child - 1) / 2
            guard before(storage[child], storage[parent]) else { break }
            storage.swapAt(child, parent)
            child = parent
        }
    }

    mutating func pop() -> Element? {
        guard !storage.isEmpty else { return nil }
        if storage.count == 1 { return storage.removeLast() }
        let result = storage[0]
        let last = storage.removeLast()
        storage[0] = last
        siftDown(0)
        return result
    }

    private mutating func siftDown(_ start: Int) {
        var parent = start
        while parent < storage.count / 2 {
            let left = 2 * parent + 1
            let right = left + 1
            var best = left
            if right < storage.count && before(storage[right], storage[left]) { best = right }
            guard before(storage[best], storage[parent]) else { break }
            storage.swapAt(parent, best)
            parent = best
        }
    }
}

var heap = Heap([5, 1, 4, 1, 3], by: <)
var popped: [Int] = []
while let value = heap.pop() { popped.append(value) }
assert(popped == [1, 1, 3, 4, 5])
assert(heap.pop() == nil)
```

The loop condition for a parent with children must include every nonleaf node. For an even-length array, the final parent has only a left child. For an odd-length array, it can have both; tests should cover both layouts.

## Repair only the path affected by an update

Insertion appends at the next complete-tree position. All old parent-child relationships remain valid, so only the path from the new leaf toward the root can violate priority.

Removal replaces the root with the last leaf, maintaining completeness. Only the downward path from the root may now violate priority. Exchange with the better child, not merely the left child, or the other child can remain above its new parent in priority.

$$
T_{\mathrm{peek}}=O(1),\qquad T_{\mathrm{insert}}=O(\log n),\qquad
T_{\mathrm{pop}}=O(\log n).
$$

Array growth and copy-on-write can add occasional linear storage work. These structural heap bounds assume the backing array's ownership and allocation costs are accounted for separately.

## Bottom-up construction is linear

Repeated insertion gives an `O(n log n)` upper bound. Bottom-up heapification is better: leaves need no repair, nodes one level above need at most one downward step, and progressively fewer nodes can travel farther.

$$
\sum_{h\ge0}O\left(\frac{n}{2^{h+1}}h\right)=O(n).
$$

This sum explains why multiplying `n` nodes by the full height is too pessimistic. Most nodes do not have full-height paths available.

The constructor begins with the last nonleaf and works upward, ensuring both child subheaps are already valid before repairing their parent.

## Keep only the candidates the result needs

```swift
func largest(_ k: Int, in values: [Int]) -> [Int] {
    guard k > 0 else { return [] }
    var candidates = Heap<Int>(by: <)
    for value in values {
        candidates.insert(value)
        if candidates.count > k { _ = candidates.pop() }
    }
    var result: [Int] = []
    while let value = candidates.pop() { result.append(value) }
    return result.reversed()
}

assert(largest(3, in: [8, 1, 9, 3, 7]) == [9, 8, 7])
assert(largest(0, in: [1, 2]).isEmpty)
assert(largest(5, in: [2, 1]) == [2, 1])
```

A min-heap discards the smallest retained candidate when there are too many. The heap size is at most `k + 1`; processing costs `O(n log(k + 1))`, with final ordered extraction adding `O(k log k)` when enough items exist.

Ties are retained as repeated values. For records, define a secondary identity policy if exactly `k` equivalent-score items must be selected deterministically.

## Equal priorities do not imply stable scheduling

A heap does not normally preserve arrival order among equivalent priorities. A scheduler needing FIFO ties can compare `(priority, sequenceNumber)` with a monotonically assigned sequence number.

Mutable priorities also need a policy. Changing an object's priority through an external reference does not automatically repair the heap. Use an explicit update operation with index tracking, or insert a new version and ignore stale entries when popped.

That stale-entry approach is common in shortest-path implementations, but requires an authoritative current distance or version to reject obsolete work.

## Test against a sorted reference

Generate insert and pop sequences, compare each popped value with a small sorted-array model, and test constructors at sizes zero through several complete-tree boundaries. Include duplicate priorities and descending comparators.

Also verify that every inserted identity is removed exactly once. A heap can return ordered values while accidentally duplicating one equal-key object and losing another.

## Compare a mixed workload with a sorted reference

```swift
var testedHeap = Heap<Int>(by: <)
var heapModel: [Int] = []
for step in 0..<120 {
    if step % 3 == 0 && !heapModel.isEmpty {
        heapModel.sort()
        assert(testedHeap.pop() == heapModel.removeFirst())
    } else {
        let value = (step * 17) % 29
        testedHeap.insert(value)
        heapModel.append(value)
    }
    assert(testedHeap.peek == heapModel.min())
    assert(testedHeap.count == heapModel.count)
}
```

The repeated small value range exercises equal priorities. A constructor-only test would miss a defect that occurs after interleaved insertion and root replacement.

For a library-quality implementation, add an internal invariant checker that compares every child with its parent. That catches a violation even if the next few popped values happen to remain correct.

## Priority queues are not sorted collections

The backing array has only a parent-child guarantee. Its left-to-right order is not a sorted sequence, and searching for an arbitrary item remains linear without another index.

An application needing both priority updates by ID and minimum removal can maintain a dictionary of heap positions, updating it on every exchange. That adds a consistency invariant across two structures. A missed position update can mutate the wrong job while the heap still looks locally ordered.

Alternatively, insert versioned entries and discard stale versions when removed. That simplifies updates but can retain obsolete entries and increase memory. Choose the policy from update frequency and lifetime, and test stale-entry cleanup explicitly.

## Exercise: add stable job priorities

Wrap each job with a priority and insertion sequence. Test that equal-priority jobs emerge in arrival order. Define overflow and lifecycle scope for the sequence counter, then explain why mutating a job's priority externally would violate the container contract.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
