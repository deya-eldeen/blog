---
layout: post
hidden: true
title: "Shortest Paths in Swift: Dijkstra, Bellman-Ford, and Weight Assumptions"
date: "2024-09-26"
last_modified_at: "2024-09-26"
permalink: /swift-shortest-paths/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A shortest-path algorithm minimizes a defined sum of edge weights. Breadth-first search minimizes edge count only when all edges have equal cost. Dijkstra's method requires nonnegative weights; Bellman-Ford supports negative edges and can detect a reachable negative cycle.

Choosing among them is a correctness decision before it is a performance decision.

<!--more-->

These Swift 5.7 implementations use integer weights, explicit absence for unreachable distances, and checked addition. Any explored candidate sum that overflows is reported as an error, rather than wrapped or treated as infinity.

## Relaxation is the common operation

For an edge `u → v` with weight `w`, a route through `u` improves `v` when:

$$
d(u)+w(u,v)<d(v).
$$

Only reachable sources of an edge can propose a route. An absent distance means unreachable so far, not a numeric value to add to.

```swift
enum PathFailure: Error { case invalidGraph, negativeWeight, overflow, negativeCycle }

func addingCost(_ a: Int, _ b: Int) throws -> Int {
    let result = a.addingReportingOverflow(b)
    guard !result.overflow else { throw PathFailure.overflow }
    return result.partialValue
}

func dijkstra(_ graph: [[(to: Int, weight: Int)]], from source: Int) throws -> [Int?] {
    guard graph.indices.contains(source),
          graph.allSatisfy({ $0.allSatisfy { graph.indices.contains($0.to) } }) else {
        throw PathFailure.invalidGraph
    }
    guard graph.allSatisfy({ $0.allSatisfy { $0.weight >= 0 } }) else {
        throw PathFailure.negativeWeight
    }
    var distance = Array<Int?>(repeating: nil, count: graph.count)
    var settled = Array(repeating: false, count: graph.count)
    distance[source] = 0
    for _ in graph.indices {
        var best: Int?
        for vertex in graph.indices where !settled[vertex] && distance[vertex] != nil {
            if best == nil || distance[vertex]! < distance[best!]! { best = vertex }
        }
        guard let vertex = best else { break }
        settled[vertex] = true
        for edge in graph[vertex] where !settled[edge.to] {
            let candidate = try addingCost(distance[vertex]!, edge.weight)
            if distance[edge.to] == nil || candidate < distance[edge.to]! {
                distance[edge.to] = candidate
            }
        }
    }
    return distance
}

let graph: [[(to: Int, weight: Int)]] = [
    [(1, 7), (2, 2)], [(3, 1)], [(1, 2), (3, 9)], [], []
]
let distances = try dijkstra(graph, from: 0)
assert(distances == [0, 4, 2, 5, nil])
```

The next settled vertex has the smallest tentative distance. With nonnegative weights, any route through an unsettled vertex cannot later make that distance smaller. Negative edges break this argument, so they are rejected before traversal.

## This implementation deliberately uses a linear frontier scan

Selecting the next vertex costs `O(V)` across up to `V` iterations; scanning outgoing edges adds `O(E)`. The result is `O(V² + E)` time and `O(V)` auxiliary storage, excluding the input.

Replacing the frontier with a binary heap can improve sparse-graph performance. A simple approach inserts a new entry on every improvement and ignores popped entries whose stored distance no longer matches the authoritative distance.

That implementation may hold `O(E)` entries and needs a bound such as `O((V + E) log(E + 1))` for its lazy-duplicate strategy. An indexed decrease-key heap has a different storage and operation model. Do not claim the indexed-heap bound for an implementation that does not maintain an index.

## Bellman-Ford allows improvements without settling early

```swift
struct WeightedEdge { let from: Int; let to: Int; let weight: Int }

func bellmanFord(vertices: Int, edges: [WeightedEdge], from source: Int) throws -> [Int?] {
    guard vertices > 0, (0..<vertices).contains(source), edges.allSatisfy({
        (0..<vertices).contains($0.from) && (0..<vertices).contains($0.to)
    }) else { throw PathFailure.invalidGraph }
    var distance = Array<Int?>(repeating: nil, count: vertices)
    distance[source] = 0
    for _ in 0..<max(0, vertices - 1) {
        var changed = false
        for edge in edges {
            guard let base = distance[edge.from] else { continue }
            let candidate = try addingCost(base, edge.weight)
            if distance[edge.to] == nil || candidate < distance[edge.to]! {
                distance[edge.to] = candidate
                changed = true
            }
        }
        if !changed { break }
    }
    for edge in edges {
        guard let base = distance[edge.from] else { continue }
        let candidate = try addingCost(base, edge.weight)
        if distance[edge.to] == nil || candidate < distance[edge.to]! {
            throw PathFailure.negativeCycle
        }
    }
    return distance
}

let edges = [WeightedEdge(from: 0, to: 1, weight: 4),
             WeightedEdge(from: 0, to: 2, weight: 5),
             WeightedEdge(from: 1, to: 2, weight: -2)]
let negativeEdgeResult = try bellmanFord(vertices: 4, edges: edges, from: 0)
assert(negativeEdgeResult == [0, 4, 2, nil])
do {
    _ = try bellmanFord(vertices: 2, edges: [
        WeightedEdge(from: 0, to: 1, weight: 1),
        WeightedEdge(from: 1, to: 0, weight: -2)
    ], from: 0)
    assertionFailure("A reachable negative cycle has no finite shortest distance")
} catch PathFailure.negativeCycle {}
```

Without a reachable negative cycle, a shortest path can be chosen with at most `V - 1` edges. Repeated relaxation discovers such paths. A further improvement proves a reachable negative cycle.

Updates within a pass can propagate farther depending on edge order, but `V - 1` passes remain sufficient. Early exit is valid when a complete pass makes no change.

## Reachability qualifies the cycle claim

A negative cycle in a disconnected component does not affect paths from the chosen source. The final check skips edges whose source has no distance.

If a reachable negative cycle cannot lead to a particular target, that target may still have a finite shortest distance. This teaching API rejects the whole source query when any reachable negative cycle exists; a richer API can classify affected targets separately.

Bellman-Ford takes `O(VE)` relaxation work in the usual worst case and `O(V)` distance storage. It is not simply a slower Dijkstra: it solves a broader weight domain.

## Reconstruction and ties need policy

Store the predecessor edge whenever a strict improvement occurs. Reconstruct backward from a reachable target, then reverse. Preserve edge identity if parallel edges can have different weights.

Updating predecessors on equal distance without a rule can introduce cycles through zero-weight edges. Strict improvements avoid many such problems; deterministic tie-breaking needs careful additional design.

## A negative edge is not the same as a negative cycle

A directed acyclic graph can contain negative edges and still have well-defined finite shortest paths. A topological-order relaxation can solve that case in linear graph traversal work after obtaining the order.

A reachable negative cycle permits arbitrarily cheaper walks by repeating it. There is then no finite minimum for targets reachable from that cycle under the usual walk-based problem definition.

For an undirected graph, representing a negative edge as two directed arcs creates a negative closed walk by going out and back. Whether repeated traversal is allowed therefore matters to the problem statement. Shortest simple path with unrestricted negative weights is a different problem from the standard relaxation formulation.

## Infinity should remain separate from a representable cost

Using `Int.max` as an unreachable sentinel makes an actual route of cost `Int.max` ambiguous. Adding any positive edge to that sentinel can also overflow before reachability is checked.

The optional distance arrays preserve the distinction. Checked addition then handles a candidate beyond the supported numeric range as an explicit failure. The current API reports overflow even if another representable route might exist; that is its fail-fast arithmetic policy.

An alternative application can use a wider representation or selectively ignore provably irrelevant overflowing candidates, but that requires a careful ordering and reachability argument. Silent wrapping is never a valid replacement for either policy.

## A path result should carry its cost units

A route of weight five is not meaningful without knowing whether the edges measure seconds, meters, or a composite score. Keep the unit and graph version in the application-facing result.

If turn penalties or remaining fuel affect future moves, position alone is not a sufficient vertex state. Expand the state model so edge costs depend only on the represented state and action before applying a standard shortest-path algorithm.

## Validate rejection behavior directly

```swift
do {
    _ = try dijkstra([[(to: 1, weight: -1)], []], from: 0)
    assertionFailure("Dijkstra must reject its unsupported weight domain")
} catch PathFailure.negativeWeight {}
do {
    _ = try dijkstra([[(to: 1, weight: Int.max)], [(to: 2, weight: 1)], []], from: 0)
    assertionFailure("An explored overflowing candidate must be reported")
} catch PathFailure.overflow {}
let disconnectedCycle = try bellmanFord(vertices: 3, edges: [
    WeightedEdge(from: 1, to: 2, weight: -1),
    WeightedEdge(from: 2, to: 1, weight: 0)
], from: 0)
assert(disconnectedCycle == [0, nil, nil])
```

The final fixture protects the source-qualified cycle contract. Rejecting every negative cycle anywhere in the input would be a different API and would unnecessarily fail this query.

Error tests should verify the documented numeric policy rather than demand a wrapped distance. They also make a future move to a wider numeric representation reviewable: changed range behavior is then an explicit contract update.

## Exercise: compare with exhaustive small paths

On tiny nonnegative graphs, enumerate simple source-to-target paths and compare minimum costs with Dijkstra. Add disconnected vertices, zero weights, parallel edges, and overflow candidates. Then add negative edges and compare Bellman-Ford on graphs without reachable negative cycles.

Stanford's [Shortest Path Algorithms notes](https://web.stanford.edu/class/cs97si/07-shortest-path-algorithms.pdf) provide the underlying weight assumptions and relaxation framework.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
