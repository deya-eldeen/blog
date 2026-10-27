---
layout: post
hidden: true
title: "Using SwiftGraph in Swift: Model the Problem and Verify Library Semantics"
date: "2024-12-26"
last_modified_at: "2024-12-26"
permalink: /swift-swiftgraph/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A graph library can remove repetitive traversal and storage code, but it cannot choose the graph's meaning. Direction, vertex identity, weight units, unreachable results, and tie behavior remain application responsibilities.

This case study uses SwiftGraph for a small delivery network. We will distinguish a fewest-hop route from a minimum-weight route and put validation around the library boundary.

<!--more-->

The example pins [SwiftGraph 3.1.0](https://github.com/davecom/SwiftGraph/tree/3.1.0), whose tagged commit is dated February 19, 2021. It therefore predates this December 2024 article. The package declares Swift tools 5.0; the client below uses a Swift 5.7 manifest. The pin documents the API being taught, rather than claiming it is the newest release.

## Set up a small executable client

Create `Package.swift` and `Sources/GraphExample/main.swift`. The manifest belongs in its own file:

```swift
// Package.swift (separate file)
// swift-tools-version: 5.7
import PackageDescription

let package = Package(
    name: "GraphExample",
    dependencies: [
        .package(url: "https://github.com/davecom/SwiftGraph.git", exact: "3.1.0")
    ],
    targets: [
        .executableTarget(name: "GraphExample", dependencies: [
            .product(name: "SwiftGraph", package: "SwiftGraph")
        ])
    ]
)
```

Run `swift run GraphExample` from the package directory. Keep the resolved dependency revision in the application's reproducibility workflow. Do not add the dependency to an unrelated project merely to run this article's examples.

## Model weighted directed travel

```swift
import SwiftGraph

let routes = WeightedGraph<String, Int>(vertices: ["Depot", "A", "B", "Goal", "Island"])
routes.addEdge(from: "Depot", to: "A", weight: 7, directed: true)
routes.addEdge(from: "Depot", to: "B", weight: 2, directed: true)
routes.addEdge(from: "B", to: "A", weight: 2, directed: true)
routes.addEdge(from: "A", to: "Goal", weight: 1, directed: true)
routes.addEdge(from: "B", to: "Goal", weight: 9, directed: true)

let (distances, parents) = routes.dijkstra(root: 0, startDistance: 0)
assert(distances == [0, 4, 2, 5, nil])
let path = pathDictToPath(from: 0, to: 3, pathDict: parents)
assert(path.map { $0.u } + [3] == [0, 2, 1, 3])
assert(distances[4] == nil)
```

Weights represent integer travel units, and all are nonnegative. Vertex indices correspond to the supplied vertex array. The cheapest route goes through `B` and `A`, with total cost five, rather than choosing the fewest edges automatically.

The isolated vertex remains present because vertices were declared independently of edges. An edge-only import must preserve isolated entities explicitly if they matter to the domain.

## BFS asks a different question

```swift
let hops = routes.bfs(from: "Depot", to: "Goal")
assert(hops.count == 2)
assert(path.count == 3)
assert(hops.first?.u == 0 && hops.last?.v == 3)
```

BFS ignores travel weights and returns a two-edge route. Dijkstra returns a three-edge route with lower total weight. Both answers are correct for their respective objectives.

The fixture has alternative two-edge routes, so the test checks length and endpoints rather than depending on one arbitrary tie. If the UI requires reproducible tie behavior, normalize insertion order or apply an explicit application policy.

## Inspect absence before reconstructing a route

An empty edge path can mean a zero-edge source-to-itself route or no route. The distance array distinguishes reachable zero distance from unreachable absence for the weighted query.

Check reachability before interpreting a reconstructed edge list. Also handle invalid vertex IDs before calling an index-based method: array indexing inside a library may assume the caller already provided valid indices.

The convenience overload resolving a vertex object has its own missing-vertex behavior. A wrapper should map those cases into the application's structured result rather than expose a collection of ambiguous empty arrays.

## Validate the domain before invoking the algorithm

```swift
enum RouteInputFailure: Error { case duplicateVertex, unknownEndpoint, negativeWeight }

func validateRoutes(vertices: [String], edges: [(String, String, Int)]) throws {
    let known = Set(vertices)
    guard known.count == vertices.count else { throw RouteInputFailure.duplicateVertex }
    for (from, to, weight) in edges {
        guard known.contains(from), known.contains(to) else { throw RouteInputFailure.unknownEndpoint }
        guard weight >= 0 else { throw RouteInputFailure.negativeWeight }
    }
}
try validateRoutes(vertices: ["Depot", "Goal"], edges: [("Depot", "Goal", 5)])
```

A generic numeric weight type does not establish Dijkstra's nonnegative-weight requirement. Version 3.1.0 performs ordinary numeric addition, so the caller must also bound totals or select a representation and wrapper that handles overflow appropriately.

For strict checked-integer behavior and negative-cycle reporting, compare the explicit implementations in [Shortest Paths](/swift-shortest-paths/). Library adoption should preserve required failure semantics, not silently weaken them.

## Separate stable domain IDs from array positions

The source exposes convenient vertex-object and integer-index operations. Repeated object-to-index lookup can add linear searches. Resolve stable IDs to indices once during import when processing many edges.

Do not persist array indices as durable IDs if vertices can be removed or reordered. Keep a stable domain identifier and rebuild the mapping with each graph snapshot.

`WeightedGraph` is a reference type. Assigning it to another variable shares the same graph object. If background calculations need independent snapshots, construct an immutable representation or a controlled copy rather than assuming struct-like independence.

## Verify implementation claims at the pinned version

The [versioned source](https://github.com/davecom/SwiftGraph/tree/3.1.0/Sources/SwiftGraph) is the relevant reference for these method signatures and behaviors. A current README may describe a later API.

Likewise, do not copy an algorithmic complexity claim without inspecting the actual frontier and duplicate-entry behavior. Version 3.1.0's Dijkstra loop can process additional queued entries, and its numeric protocol constraint does not validate the problem's mathematical assumptions.

For a minimum spanning tree, use an undirected graph and verify connectivity. Applying an MST method to the directed delivery graph would answer the wrong model regardless of whether a method call compiles.

## Keep package behavior behind a small adapter

A delivery feature can expose a route request in stable domain IDs and return a typed result containing ordered IDs, total travel units, and the graph version. The adapter alone knows SwiftGraph indices and edge types.

This boundary makes tests clearer: domain tests verify reachability, cost, and route legality; adapter tests verify index mapping and the pinned package's result interpretation. Replacing the library later does not require changing every screen's model.

Do not convert every error into an empty route to simplify the interface. An unknown depot, an unreachable customer, and a valid zero-edge request require different responses.

## Test a version upgrade as a semantic change

Before changing the package pin, run the same fixtures against both versions. Compare distance values, unreachable behavior, directed-edge handling, and identity mapping. Equal-cost route identities may change even when optimal costs remain correct.

Review the new version's source and release notes for numeric and algorithmic changes. A successful build establishes source compatibility, not unchanged runtime contracts or improved performance.

Retain a small integration fixture with an isolated vertex and alternative routes. It protects assumptions that unit tests of only the application's own wrapper cannot establish independently.

## Reproducibility includes the toolchain

The exact tag fixes library source, while the Swift compiler and standard-library version can still change diagnostics, optimization, and dependency resolution behavior. Record them when reporting benchmark or compatibility results.

The article's historical release pin is intentional for its publication date. A new application should assess a currently supported release through its own compatibility and maintenance requirements, rather than adopting an old pin solely because an example uses it.

## A migration test should include reference semantics

Construct a graph, assign another reference to it, and add an edge through one reference. Both references observe the change because this package's graph is a class.

If an application adapter promises immutable snapshots, it must provide that stronger behavior itself, for example by building a fresh graph from a validated value model for each calculation. Merely hiding the class behind a protocol does not make copies independent.

This distinction matters when a UI edits topology while a background route query is running. Use a snapshot or isolation policy that prevents the library from seeing a partially updated graph. Unit tests should establish the adapter's promise rather than assuming it follows from the generic vertex and weight parameters.

A version upgrade is also an opportunity to recheck those ownership assumptions. API signatures rarely express every mutation, lifetime, and concurrency guarantee a consumer depends on.

## Exercise: build an application-facing adapter

Return one of invalid input, unreachable, or a route containing stable vertex IDs and total cost. Test source equal to goal, an isolated destination, duplicate IDs, equal-cost alternatives, and invalid weights. Keep the library type private so replacing it does not change the application's result contract.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
