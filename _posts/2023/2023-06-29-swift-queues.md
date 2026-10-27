---
layout: post
hidden: true
title: "Queues in Swift: FIFO Without Repeated Array Shifts"
date: "2023-06-29"
last_modified_at: "2023-06-29"
permalink: /swift-queues/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A queue returns items in the order they arrived. That is the right discipline for breadth-first search, pending jobs, and event buffering. An array can represent those items, but repeatedly calling `removeFirst()` shifts storage and can make a linear traversal quadratic.

A ring buffer keeps a logical front index and reuses slots. The implementation is small enough to inspect, but its invariants matter: physical order is not logical order once the buffer wraps.

<!--more-->

These Swift 5.7 examples build a growable value queue. It is a synchronous container, not a concurrent channel with waiting, cancellation, or backpressure.

## Separate logical position from physical storage

For a capacity `c`, head index `h`, and logical offset `i`, the slot is:

$$
\operatorname{slot}(i)=(h+i)\bmod c.
$$

`count` disambiguates full and empty states even when the next insertion position equals the head. Live elements occupy exactly `count` logical positions beginning at the head.

```swift
struct RingQueue<Element> {
    private var storage: [Element?]
    private var head = 0
    private(set) var count = 0
    var isEmpty: Bool { count == 0 }

    init(capacity: Int = 4) {
        precondition(capacity > 0)
        storage = Array(repeating: nil, count: capacity)
    }

    mutating func enqueue(_ value: Element) {
        if count == storage.count { grow() }
        storage[(head + count) % storage.count] = .some(value)
        count += 1
    }

    mutating func dequeue() -> Element? {
        guard count > 0 else { return nil }
        let value = storage[head]!
        storage[head] = nil
        head = (head + 1) % storage.count
        count -= 1
        return .some(value)
    }

    private mutating func grow() {
        var larger = Array<Element?>(repeating: nil, count: storage.count * 2)
        for offset in 0..<count {
            larger[offset] = storage[(head + offset) % storage.count]
        }
        storage = larger
        head = 0
    }
}

var queue = RingQueue<Int>(capacity: 2)
queue.enqueue(1); queue.enqueue(2)
assert(queue.dequeue() == 1)
queue.enqueue(3)
queue.enqueue(4)
assert(queue.dequeue() == 2)
assert(queue.dequeue() == 3)
assert(queue.dequeue() == 4)
assert(queue.dequeue() == nil)
```

The example assumes feasible capacities that can double without integer overflow or allocation failure. A production bounded queue should reject or suspend producers when full rather than grow without limit.

The force unwrap is justified by the internal occupancy invariant. It is not permission to force-unwrap arbitrary input. Every enqueue creates an occupied outer optional, and every dequeue clears exactly the removed slot.

## Clear slots when removing values

Advancing `head` without clearing the slot leaves a reference retained until overwrite or buffer destruction. A queue of image buffers or tasks could then retain significant resources despite a logical count of zero.

The outer optional marks occupancy. If `Element` itself is optional, `.some(nil)` is an occupied slot carrying a nil element:

```swift
var optionalQueue = RingQueue<Int?>()
optionalQueue.enqueue(nil)
let presentNil: Int?? = optionalQueue.dequeue()
assert(presentNil != nil && presentNil! == nil)
assert(optionalQueue.dequeue() == nil)
```

This is why occupancy and element absence must not be conflated. A sentinel value such as zero would have the same problem for integer queues.

## Growth must copy in logical order

When a wrapped buffer grows, the occupied physical slots may be split across its end and beginning. Copying the raw storage array would preserve the wrong layout for a reset head.

`grow` walks logical offsets, places them consecutively in the new buffer, and resets the head to zero. The invariant is restored independently of the previous wrap position.

Ordinary enqueue and dequeue perform constant structural work. Growth is linear in the number of live elements. With geometric growth, enqueue is amortized constant-time along a unique-owner mutation sequence. Retaining copied queue versions can trigger additional copy-on-write separation costs.

Space follows capacity, not just count. This queue does not shrink, which avoids resize oscillation but retains its largest buffer. A shrink policy should use hysteresis and account for its own copying cost.

## Compare alternative queue representations

A head-indexed array with occasional compaction is another simple design. It avoids repeated shifts but needs a policy to release consumed elements and reclaim the prefix. Compaction should be occasional, not performed after every removal.

A two-stack queue moves an incoming stack to an outgoing stack only when needed. Its linear-history amortized behavior is excellent, while branching persistent versions can repeat reversals. See the [persistent queue implementation](/swift-persistent-data-structures/) for that caveat.

A linked queue offers constant pointer updates but allocates nodes and has less contiguous traversal. A deque library can provide a mature implementation when operations at both ends are needed. Choose according to access pattern and ownership, rather than treating linked structures as automatically faster.

## A model-based test catches wraparound errors

```swift
var tested = RingQueue<Int>(capacity: 3)
var model: [Int] = []
for step in 0..<200 {
    if step % 3 != 0 || model.isEmpty {
        tested.enqueue(step)
        model.append(step)
    } else {
        assert(tested.dequeue() == model.removeFirst())
    }
    assert(tested.count == model.count)
}
while !model.isEmpty { assert(tested.dequeue() == model.removeFirst()) }
assert(tested.isEmpty)
```

The intentionally small array model is easy to trust even though its removals are inefficient. The workload mixes wrapping, growth, and draining. Also retain a queue copy and verify later mutations leave that older value unchanged.

## FIFO does not imply fairness or thread safety

The queue defines removal order for values already enqueued. It does not define which concurrent producer gets to enqueue first, whether a waiting consumer is cancelled, or how many tasks may be buffered.

An actor or lock can protect access, but a useful work channel also needs a capacity and wake-up policy. Unbounded buffering can convert a throughput mismatch into growing memory use. Keep those scheduling decisions outside this container's claims.

## Trace a wrapped growth operation

With capacity four, suppose head is at physical index three and logical contents are `A, B, C`. They occupy physical slots three, zero, and one. Enqueueing `D` fills slot two; another insertion requires growth.

The larger array must receive `A, B, C, D` at positions zero through three. Copying physical slots zero through three would produce `B, C, D, A`, silently rotating FIFO order. A test that grows only before the first wrap will not catch this defect.

The mixed model test exercises this path, but keep a small explicit fixture too so a failure explains the geometry rather than only reporting a long operation sequence.

## Choose overload behavior before adding concurrency

A pending-work queue often receives items faster than a worker can process them. Possible policies include rejecting new items, dropping oldest items, coalescing repeated work, or suspending producers. These policies have different product meanings.

A live-location display may legitimately keep only the newest update. A payment ledger cannot discard old work because the buffer is full. An analytics queue might allow bounded loss only if the reporting contract says so.

The ring buffer implements storage, not that decision. A channel owner should expose the policy through its result type and metrics rather than silently increasing capacity forever.

## Queue order does not make an operation atomic

Removing a job and performing an external effect are separate steps. A worker crash between them can lose work unless a durability protocol records ownership and completion. Retrying after uncertain completion can duplicate effects.

For an in-memory BFS, losing the process loses the entire calculation and restart is straightforward. For a durable job system, acknowledgement, leases, idempotency, and recovery are part of the queue protocol. Sharing the word “queue” does not make the guarantees interchangeable.

## Exercise: add a fixed-capacity mode

Make enqueue report rejection when the queue is full. Verify rejected insertion leaves count and order unchanged. Then design a worker boundary that distinguishes “accepted,” “closed,” and “temporarily full” without pretending those are all an empty-queue condition.

Continue with [Breadth-First Search](/swift-breadth-first-search/) to use FIFO order in an algorithm.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
