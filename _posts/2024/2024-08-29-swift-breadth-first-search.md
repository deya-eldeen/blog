---
layout: post
hidden: true
title: "Breadth-First Search in Swift: Layers, Shortest Hops, and Multi-Source Search"
date: "2024-08-29"
last_modified_at: "2024-08-29"
permalink: /swift-breadth-first-search/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Breadth-first search explores a graph in layers of increasing edge count. Its queue discipline ensures every vertex at distance `d` is processed before newly discovered vertices at distance `d + 1`.

That provides shortest paths only when every edge has the same cost. A route with fewer transfers can still take longer in minutes if its edges have different travel times.

<!--more-->

These Swift 5.7 examples compute distances and parents from one or several sources. The queue uses an array plus a moving head, avoiding repeated front removal.

## Discovery assigns the minimum hop count

```swift
enum BFSFailure: Error { case invalidVertex }

struct BFSResult {
    let distances: [Int?]
    let parents: [Int?]

    func path(to goal: Int) -> [Int]? {
        precondition(distances.indices.contains(goal))
        guard distances[goal] != nil else { return nil }
        var reversed: [Int] = []
        var cursor: Int? = goal
        while let vertex = cursor {
            reversed.append(vertex)
            cursor = parents[vertex]
        }
        return reversed.reversed()
    }
}

func breadthFirst(_ graph: [[Int]], sources: [Int]) throws -> BFSResult {
    guard sources.allSatisfy({ graph.indices.contains($0) }),
          graph.allSatisfy({ $0.allSatisfy { graph.indices.contains($0) } }) else {
        throw BFSFailure.invalidVertex
    }
    var distances = Array<Int?>(repeating: nil, count: graph.count)
    var parents = Array<Int?>(repeating: nil, count: graph.count)
    var queue: [Int] = []
    for source in sources where distances[source] == nil {
        distances[source] = 0
        queue.append(source)
    }
    var head = 0
    while head < queue.count {
        let vertex = queue[head]
        head += 1
        for neighbor in graph[vertex] where distances[neighbor] == nil {
            distances[neighbor] = distances[vertex]! + 1
            parents[neighbor] = vertex
            queue.append(neighbor)
        }
    }
    return BFSResult(distances: distances, parents: parents)
}

let graph = [[1, 2], [3], [3], [4], [], []]
let result = try breadthFirst(graph, sources: [0])
assert(result.distances == [0, 1, 1, 2, 3, nil])
assert(result.path(to: 4) == [0, 1, 3, 4])
assert(result.path(to: 5) == nil)
assert(result.path(to: 0) == [0])
```

Parent links are created once on first discovery and point toward a source. Distances strictly decrease along those links, so reconstruction terminates for results produced by this function.

The result type is a teaching value; arbitrary manually constructed parent arrays could contain cycles. A production API can restrict construction or validate imported results.

## Mark when enqueueing, not when removing

If two vertices in one layer point to the same neighbor, marking only on dequeue allows duplicate pending entries. That can increase memory and complicate parent selection.

Setting distance before enqueue makes it the discovery marker. Each vertex enters the queue at most once. The source begins discovered at distance zero, preventing cycles from enqueueing it again.

The force unwrap of the current distance follows from that queue invariant. Every queued vertex has a distance assigned already.

## The layer invariant proves shortest paths

Suppose a vertex is first discovered from a vertex at distance `d`. It receives `d + 1`. Any shorter path would have a preceding vertex in an earlier layer, which would already have discovered it. Therefore first discovery is minimum hop distance.

$$
d(v)=1+\min_{u\to v}d(u)
$$

This equation describes reachable non-source vertices under unit edge cost. Unreachable vertices retain absence instead of an arbitrary large integer sentinel.

Neighbor order chooses among equally short paths. The sample visits `1` before `2`, so vertex `3` receives parent `1`. A different adjacency order can return another equally valid path.

## Multiple sources model nearest-origin problems

```swift
let nearest = try breadthFirst(graph, sources: [0, 5, 0])
assert(nearest.distances == [0, 1, 1, 2, 3, 0])
assert(nearest.path(to: 5) == [5])
let noSources = try breadthFirst(graph, sources: [])
assert(noSources.distances.allSatisfy { $0 == nil })
```

All unique sources start at distance zero. The wavefront computes the minimum hop distance from any source. Duplicate source entries do not produce duplicate queue items.

This fits nearest-exit grids, propagation from several initially active locations, and shortest connection to any member of a group. Directed edges still limit which directions propagation can follow.

To report which source owns a result, follow parents to the root or store an origin ID during discovery. Ties require a documented policy, commonly the source order combined with neighbor order.

## Queue choice determines whether the advertised bound survives

With indexed visited state and adjacency lists:

$$
T(V,E)=O(V+E),\qquad S_{\mathrm{aux}}=O(V).
$$

Repeated `Array.removeFirst()` could add quadratic shifting across the traversal. The head-index queue avoids that. It retains discovered integer IDs until the function ends, which is within the linear storage bound.

For long-lived queues holding reference-heavy payloads, consumed slots should be released or compacted. The [ring buffer](/swift-queues/) demonstrates that lifetime policy.

Scanning matrix rows instead of adjacency lists changes neighbor enumeration cost to `O(V²)` in a full traversal. The algorithm's queue discipline alone does not establish its total bound.

## Grids are implicit graphs

A grid need not allocate an adjacency list for every cell. Generate legal neighbors from coordinates and obstacle rules. Four-direction movement, diagonal movement, and corner cutting define different graphs.

If every move costs one, BFS remains appropriate. If diagonals have a different cost, ordinary BFS no longer minimizes travel cost. Use [Dijkstra or A*](/swift-shortest-paths/) with the actual edge weights.

Be careful with state identity. A puzzle may require a vertex to include both position and remaining keys. Marking only the position visited can discard a later visit with a different ability to proceed.

## Test distance and path properties

Every reachable non-source vertex should have a parent with distance one less. Every reconstructed adjacent pair must be an edge, and path length minus one must equal the stored distance.

Include disconnected vertices, self-loops, duplicate edges, multiple sources, empty graphs with no sources, and invalid endpoints. Test equal-length alternative routes without requiring an arbitrary one unless traversal order is part of the API.

## Early exit depends on the requested result

For one destination, ordinary unit-cost BFS can stop when that destination is first discovered because its hop count is already minimal. If the caller needs every vertex at that same distance, finish the relevant layer instead of returning immediately.

For all shortest paths, one parent per vertex is insufficient. Store all predecessor choices that achieve the same minimum distance, then enumerate paths under an output budget. The number of shortest paths can be exponential even when the graph is small.

An output limit should report truncation. Returning the first hundred paths without saying more exist changes the meaning of “all routes.”

## Multi-source search is not repeated single-source search

Starting all sources at zero lets one wavefront share work across their reachable regions. Running a full BFS independently from each source and taking minimum distances repeats traversal and requires a separate combination step.

The multi-source parent tree identifies one nearest source under the tie policy. If the application needs all equally near sources, retain origin sets or another representation and account for their potentially larger storage.

For directed reachability toward a set of goals, run multi-source search from those goals on the reversed graph. Searching the original graph instead answers which vertices the goals can reach, a different question.

## Exercise: support zero-one edge weights

Design a deque-based search for weights restricted to zero and one. Push zero-cost improvements to the front and unit-cost improvements to the back. Explain why first-discovery finalization from ordinary BFS must be reconsidered when zero-cost edges exist.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
