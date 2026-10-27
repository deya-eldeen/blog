---
layout: post
hidden: true
title: "A* Pathfinding in Swift: Heuristics, Reopening, and Optimality"
date: "2024-10-31"
last_modified_at: "2024-10-31"
permalink: /swift-a-star/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A* adds a lower-bound estimate of remaining work to the cost already paid. It prioritizes vertices by estimated total route cost, which can focus search toward the goal without giving up optimality under the right assumptions.

The heuristic is part of the correctness contract. An overestimate can return a suboptimal route, and an inconsistent heuristic requires the implementation to reconsider vertices when a better route appears.

<!--more-->

This Swift 5.7 example uses the generic `Heap` from [Heaps and Priority Queues](/swift-heaps-priority-queues/); place that type before the code below. It supports a finite directed graph with nonnegative integer weights and reopens improved vertices.

## Distinguish paid cost from estimated cost

For a vertex `v`:

$$
f(v)=g(v)+h(v).
$$

`g` is the best known cost from the source, while `h` estimates remaining cost. Admissibility requires `h(v)` not exceed the true minimum remaining cost. Consistency additionally requires:

$$
h(u)\le w(u,v)+h(v)
$$

for each edge. The heuristic must be zero at the goal in this implementation. It is computed once per vertex so the search observes one coherent set of estimates.

## Keep authoritative scores separate from heap entries

```swift
struct AStarEntry { let vertex: Int; let paid: Int; let estimated: Int }
struct AStarRoute: Equatable { let vertices: [Int]; let cost: Int }
enum AStarFailure: Error { case invalidInput, overflow }

func aStar(
    _ graph: [[(to: Int, weight: Int)]], from start: Int, to goal: Int,
    heuristic: (Int) -> Int
) throws -> AStarRoute? {
    guard graph.indices.contains(start), graph.indices.contains(goal),
          graph.allSatisfy({ $0.allSatisfy { graph.indices.contains($0.to) && $0.weight >= 0 } }) else {
        throw AStarFailure.invalidInput
    }
    let estimates = graph.indices.map(heuristic)
    guard estimates.allSatisfy({ $0 >= 0 }), estimates[goal] == 0 else {
        throw AStarFailure.invalidInput
    }
    func sum(_ a: Int, _ b: Int) throws -> Int {
        let result = a.addingReportingOverflow(b)
        guard !result.overflow else { throw AStarFailure.overflow }
        return result.partialValue
    }
    var frontier = Heap<AStarEntry>(by: {
        if $0.estimated != $1.estimated { return $0.estimated < $1.estimated }
        if $0.vertex != $1.vertex { return $0.vertex < $1.vertex }
        return $0.paid < $1.paid
    })
    var paid = Array<Int?>(repeating: nil, count: graph.count)
    var parent = Array<Int?>(repeating: nil, count: graph.count)
    paid[start] = 0
    frontier.insert(AStarEntry(vertex: start, paid: 0, estimated: estimates[start]))
    while let entry = frontier.pop() {
        guard paid[entry.vertex] == entry.paid else { continue }
        if entry.vertex == goal {
            var path: [Int] = []
            var cursor: Int? = goal
            while let vertex = cursor { path.append(vertex); cursor = parent[vertex] }
            return AStarRoute(vertices: path.reversed(), cost: entry.paid)
        }
        for edge in graph[entry.vertex] {
            let candidate = try sum(entry.paid, edge.weight)
            if paid[edge.to] == nil || candidate < paid[edge.to]! {
                paid[edge.to] = candidate
                parent[edge.to] = entry.vertex
                frontier.insert(AStarEntry(vertex: edge.to, paid: candidate,
                    estimated: try sum(candidate, estimates[edge.to])))
            }
        }
    }
    return nil
}

let graph: [[(to: Int, weight: Int)]] = [
    [(1, 3), (2, 1)], [(3, 3)], [(1, 1), (3, 10)], []
]
let h = [5, 0, 4, 0]
let route = try aStar(graph, from: 0, to: 3, heuristic: { h[$0] })
assert(route == AStarRoute(vertices: [0, 2, 1, 3], cost: 5))
let zeroHeuristic = try aStar(graph, from: 0, to: 3, heuristic: { _ in 0 })
assert(zeroHeuristic?.cost == 5)
```

Old heap entries are snapshots. If a better route updates `paid`, a popped entry with the earlier cost is ignored. There is no permanent closed set preventing a later improvement from being expanded.

## Why reopening matters

In the fixture, vertex `1` can first be expanded at cost three, then improved to cost two through vertex `2`. The heuristic is admissible but inconsistent. Refusing to reopen vertex `1` would miss its improved continuation toward the goal.

With a consistent heuristic, a vertex's first nonstale removal has its optimal cost. With merely admissible estimates, reopening preserves the possibility of repairing earlier expansions.

Returning when the goal is discovered is too early: another frontier route can still improve it. The function returns when a nonstale goal entry is removed at minimum estimated priority.

## Choose a heuristic from the movement model

On a four-neighbor grid with unit movement cost, Manhattan distance is a lower bound. If each step costs at least `c`, multiply by that lower bound. Obstacles do not invalidate the estimate because they can only force longer travel.

Allowing cheap diagonals changes the bound. Manhattan distance can overestimate when a diagonal replaces two orthogonal moves. Use an estimate consistent with diagonal costs and corner-cutting rules.

For a road graph, straight-line distance can estimate distance, while distance divided by a valid maximum speed can estimate travel time. Units must agree with edge weights. A visually plausible heuristic in the wrong units has no optimality argument.

## The type checker cannot prove admissibility

The function validates nonnegative estimates and a zero goal estimate. It cannot infer true remaining costs to prove the heuristic is a lower bound. That remains the caller's contract.

For small graphs, compute exact goal distances on the reversed graph and check every heuristic value against them. Also check consistency edge by edge if that stronger property is claimed.

An intentionally inflated heuristic can be useful in a separately specified approximate search, but it should not be presented as this algorithm's optimal-route guarantee.

## Bound the actual implementation

With a consistent heuristic, successful expansions scan each vertex's outgoing edges once, while lazy duplicate heap entries add storage and pop work. An `O((V + E) log(E + 1))` style bound matches this duplicate-entry strategy under those assumptions.

With inconsistent admissible heuristics, reopening can increase expansions substantially; do not reuse the one-expansion-per-vertex bound. Memory includes score arrays, parents, and pending heap entries.

A resource-limited application should return budget exhaustion distinctly from “no route.” Emptying the frontier proves no reachable goal; stopping because memory or work budget ran out does not.

## The frontier lower bound explains goal removal

Assume a cheaper optimal route still exists when a goal with cost `C` is removed. Along that route, some frontier vertex has a discovered prefix and has not yet propagated the optimal continuation. With an admissible heuristic, its `g + h` cannot exceed the optimal route cost.

That would place a cheaper estimated entry ahead of the removed goal, contradicting minimum-priority removal, provided improved states are allowed to reenter the frontier. This is the reason reopening is part of the implementation's contract.

The argument is about the cost of the returned route. It does not promise A* expands the fewest possible nodes under every heuristic or tie policy. Claims about search efficiency need their own assumptions.

## Cache estimates only within a coherent environment

The code evaluates the heuristic once per vertex. If the heuristic reads a changing obstacle service or mutable goal, the cached values can mix different problem versions.

Capture the goal and required environmental facts before constructing estimates. A map update should create a new search snapshot or trigger an explicitly supported incremental-search policy.

Likewise, changing edge weights while the heap contains priorities calculated from old weights invalidates the reasoning. Cancellation alone is insufficient if a late old result can still overwrite a newer route; include a version check at publication.

## Tie-breaking changes work without changing the objective

When several entries have equal estimated cost, preferring a larger paid cost often drives search deeper toward the goal, while another policy may expand a wider band. Neither automatically improves every map.

Keep the primary estimated-cost order intact and compare expansion counts on representative fixtures. Tests should preserve optimal route cost while allowing different equally optimal paths unless a specific tie result is part of the product contract.

## Test unreachable and trivial goals without a special heuristic shortcut

```swift
let trivial = try aStar([[]], from: 0, to: 0, heuristic: { _ in 0 })
assert(trivial == AStarRoute(vertices: [0], cost: 0))
let unreachable = try aStar([[], []], from: 0, to: 1, heuristic: { _ in 0 })
assert(unreachable == nil)
```

A zero-edge route is a successful result, while an exhausted frontier with no goal is unreachable. Returning an empty path for both would discard that distinction.

On tiny maps, compare costs with zero-heuristic search for every source-goal pair, then independently verify path edges and summed cost. A matching cost without a legal reconstructed path could conceal a parent-update bug.

Keep an admissible inconsistent fixture in that suite. Testing only Manhattan grid estimates, which are consistent under ordinary unit orthogonal moves, would not exercise the reopening behavior this implementation promises.

## Exercise: validate a grid heuristic

Generate small blocked grids and compare A* costs with BFS under unit moves. Add diagonals and demonstrate a case where Manhattan distance overestimates. Track expansions separately from returned cost, and preserve optimality tests while experimenting with tie-breaking.

For the original framework, see Hart, Nilsson, and Raphael's [A Formal Basis for the Heuristic Determination of Minimum Cost Paths](https://www.cs.auckland.ac.nz/courses/compsci709s2c/resources/Mike.d/astarNilsson.pdf).

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
