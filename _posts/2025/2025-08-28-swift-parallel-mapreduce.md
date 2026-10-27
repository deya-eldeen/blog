---
layout: post
hidden: true
title: "Parallel Algorithms and MapReduce in Swift: Partition, Isolate, and Combine"
date: "2025-08-28"
last_modified_at: "2025-08-28"
permalink: /swift-parallel-mapreduce/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Parallel execution helps when independent work is large enough to repay scheduling, copying, and combination costs. Adding one task per element can make a calculation slower or exhaust memory while producing the same answer.

A useful design partitions input, gives each task private state, and combines completed values under one owner. MapReduce extends that pattern to keyed intermediate results and, in its original setting, distributed execution.

<!--more-->

The Swift 5.7 examples use structured task groups, available since Swift 5.5. They count normalized words in document batches with a bounded number of child tasks and checked count combination.

## Independent accumulators avoid shared mutation

```swift
enum CountFailure: Error { case invalidConfiguration, overflow }

func wordCounts(_ documents: [String]) throws -> [String: Int] {
    var counts: [String: Int] = [:]
    for document in documents {
        try Task.checkCancellation()
        for token in document.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }) {
            let key = String(token)
            let next = counts[key, default: 0].addingReportingOverflow(1)
            guard !next.overflow else { throw CountFailure.overflow }
            counts[key] = next.partialValue
        }
    }
    return counts
}

func parallelWordCounts(
    _ documents: [String], chunkSize: Int, maximumConcurrentTasks: Int
) async throws -> [String: Int] {
    guard chunkSize > 0, maximumConcurrentTasks > 0 else {
        throw CountFailure.invalidConfiguration
    }
    return try await withThrowingTaskGroup(of: [String: Int].self) { group in
        var nextStart = 0
        func nextChunk() -> [String]? {
            guard nextStart < documents.count else { return nil }
            let end = nextStart + min(chunkSize, documents.count - nextStart)
            defer { nextStart = end }
            return Array(documents[nextStart..<end])
        }
        for _ in 0..<min(maximumConcurrentTasks, documents.count) {
            guard let chunk = nextChunk() else { break }
            group.addTask { try wordCounts(chunk) }
        }
        var total: [String: Int] = [:]
        while let partial = try await group.next() {
            for (key, count) in partial {
                let sum = total[key, default: 0].addingReportingOverflow(count)
                guard !sum.overflow else { throw CountFailure.overflow }
                total[key] = sum.partialValue
            }
            if let chunk = nextChunk() {
                group.addTask { try wordCounts(chunk) }
            }
        }
        return total
    }
}

let documents = ["Swift values", "Swift functions", "Values and functions", ""]
let sequential = try wordCounts(documents)
let parallel = try await parallelWordCounts(documents, chunkSize: 2, maximumConcurrentTasks: 2)
assert(parallel == sequential)
assert(parallel == ["swift": 2, "values": 2, "functions": 2, "and": 1])
let empty = try await parallelWordCounts([], chunkSize: 1, maximumConcurrentTasks: 2)
assert(empty.isEmpty)
```

Only the parent mutates `nextStart` and the final dictionary. Children receive independent chunk values and own their local dictionaries. Concurrent tasks never write into one shared dictionary.

The refill strategy starts another chunk only after consuming one completed result, bounding the number of outstanding child tasks. A task count is not a promise of the same number of CPU cores or simultaneous execution.

## Completion order and result order are different

Task-group results arrive in completion order. Integer count addition is associative and commutative within the supported nonoverflowing domain, so that order does not change dictionary contents.

The dictionary's traversal order is not a presentation guarantee. Sort keys before serializing a deterministic textual report.

For a transformation whose output must preserve input order, attach each chunk's input index and assemble results by index. Concatenating completion-order arrays would silently reorder the dataset.

Floating-point summation is not exactly associative. Changing grouping or scheduling can change the last bits. Use a reproducible reduction strategy or a numerically appropriate tolerance if floating-point results must be compared.

## Chunking controls overhead and imbalance

Tiny chunks increase task creation and merge overhead. Huge chunks reduce scheduling flexibility and can leave one slow worker dominating completion time.

Document count is only an approximate work measure: one document can contain far more text than another. A byte or token budget can improve balance, while extremely large documents may need their own internal partitioning policy.

Copying chunk arrays also contributes allocation and reference-lifetime cost. Slices can avoid some copying but retain their base storage. Measure peak memory over the complete task-group lifetime rather than only the local accumulator size.

## Cancellation is cooperative

The worker checks cancellation at document boundaries. A very large single document can delay that response until its inner loop finishes. Add bounded periodic checks or document-size limits if cancellation latency matters.

If a child or merge throws, structured task-group scope controls sibling cancellation and waits for child completion before returning. That does not roll back external effects already performed by a child.

The worker is a calculation. Adding file writes or network requests changes retry, cancellation, and partial-success semantics and needs an explicit effect protocol.

## Work and span bound speedup

If `W` is total work and `S` is the longest dependency chain, execution on `P` processors cannot beat:

$$
T_P\ge\max(W/P,S).
$$

Amdahl's idealized bound for serial fraction `s` is:

$$
\operatorname{speedup}(P)\le\frac{1}{s+(1-s)/P}.
$$

Real scheduling, allocation, and memory bandwidth add overhead beyond that ideal. The serial merge can become the bottleneck even while workers tokenize independently.

Benchmark sequential and parallel versions on the same input in optimized builds. Include partitioning and merging, and test several chunk sizes. A slower small-input parallel result is evidence about overhead, not a failure of the asymptotic model.

## Local task groups are not a distributed MapReduce runtime

The [original MapReduce paper](https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/) describes keyed intermediate data, partitioning, and distributed execution machinery. This example performs a local map-and-combine calculation in one process.

A distributed implementation additionally needs shuffle, serialization, worker failure handling, retries, and a policy for duplicate effects. An associative combiner helps reduce transferred data, but it does not establish exactly-once external writes.

## Test partition independence across several budgets

```swift
for size in [1, 2, 3, 20] {
    for limit in [1, 2, 4] {
        let tested = try await parallelWordCounts(documents, chunkSize: size, maximumConcurrentTasks: limit)
        assert(tested == sequential)
    }
}
do {
    _ = try await parallelWordCounts(documents, chunkSize: 0, maximumConcurrentTasks: 2)
    assertionFailure("Invalid partition configuration must fail")
} catch CountFailure.invalidConfiguration {}
```

A limit of one is a useful semantic check: the task-group machinery should still produce the sequential answer. A chunk larger than the input checks the final partial-batch path.

These tests do not prove a maximum physical thread count. They verify the API's result across scheduling configurations. Instrument outstanding tasks separately if that bound is a public operational promise.

## A combiner needs sufficient statistics

Word counts combine by adding each key's count. An average cannot generally combine by averaging partial averages; retain each partial sum and sample count, then divide once after combination.

For ordered summaries such as a longest consecutive run, a chunk may need prefix, suffix, total length, and interior maximum. Returning only the interior maximum loses information about a run crossing the boundary.

Design the partial result from the combination law before writing task code. Parallelizing an insufficient summary only makes the wrong result arrive through more tasks.

A merge tree can reduce serial combination depth, but it may increase temporary storage and change floating-point grouping. Analyze that tradeoff using both work and span rather than assuming every additional task contributes useful parallelism.

## Exercise: preserve ordered output

Parallelize a document-to-summary transformation whose output order must match input order. Return indexed chunk results and assemble them deterministically. Test uneven durations, cancellation, a child failure, and a limit of one concurrent task, while verifying no input summary is duplicated or omitted.

See Swift's [Concurrency chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/) for task-group lifetime and isolation concepts.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
