---
layout: page
title: "Data Structures and Algorithms in Swift"
subtitle: "Understand the invariants, costs, and tradeoffs behind efficient Swift code"
permalink: /swift-data-structures-and-algorithms/
hide: true
excluded: true
---

Data structures decide how your data is stored; algorithms decide what you do with it. Together they're the difference between a list that scrolls smoothly and one that freezes, and between a search that takes milliseconds and one that takes minutes.

They're also the backbone of technical interviews. This guide starts with the containers you use every day and works up to the clever structures that power search engines, maps, and blockchains.

The new articles use Swift 5.7-compatible examples and dates from January 2023 through September 2025. Their language features, framework APIs, and pinned dependencies were available by those dates. Existing linked articles keep their original publication dates. The sorting comparison distinguishes the Swift 5.8 documentation guarantee for stable sorting from earlier implementation behavior.

Each topic develops a working implementation or a worked analysis, explains its correctness assumptions and complexity, and includes boundary cases and exercises. Equations and diagrams support the reasoning. The arrays article covers both arrays and dictionaries; the linked-list article develops persistent lists and queues, and the binary-search-tree article includes persistent update semantics. Dedicated hash-table, queue, and trie articles extend those foundations.

{% include roadmap/legend.liquid %}

## 1. Measuring Performance

- [Time and Space Complexity](/swift-time-space-complexity/)
- [Big O Notation and Common Complexity Classes](/swift-big-o/)
- [Analyzing Your Own Code](/swift-analyzing-algorithms/)
{: .roadmap-topics}

## 2. Elementary Data Structures

- [Arrays](/swift-arrays-and-dictionaries/)
- [Dictionaries and Hash Tables](/swift-hash-tables/)
- [Sets](/swift-set-data-structure-with-practical-example-pizza-cooking/)
- [Stacks](/swift-stacks/)
- [Queues](/swift-queues/)
- [Linked Lists](/swift-persistent-data-structures/)
{: .roadmap-topics}

## 3. Sorting

- [Comparing Sorting Algorithms](/swift-comparing-sorts/)
- [Bubble Sort](/swift-bubble-sort/)
- [Insertion Sort](/swift-insertion-sort/)
- [Selection Sort](/swift-selection-sort/)
- [Merge Sort](/swift-merge-sort/)
- [Quicksort](/swift-quicksort/)
{: .roadmap-topics}

## 4. Trees

- [Binary Trees](/swift-binary-trees/)
- [Binary Search Trees](/swift-functional-trees-tries/)
- [Heaps and Priority Queues](/swift-heaps-priority-queues/)
- [AVL Trees](/swift-avl-trees/)
- [Splay Trees](/swift-splay-trees/)
- [Tries](/swift-tries/)
{: .roadmap-topics}

## 5. Graphs

- [Graph Basics](/swift-graph-basics/)
- [Depth-First Search (DFS)](/swift-depth-first-search/)
- [Breadth-First Search (BFS)](/swift-breadth-first-search/)
- [Shortest Paths](/swift-shortest-paths/)
- [A* Pathfinding](/swift-a-star/)
- [Minimum Spanning Trees](/swift-minimum-spanning-trees/)
- [The SwiftGraph Library](/swift-swiftgraph/)
{: .roadmap-topics}

## 6. Advanced Topics

- [Dynamic Programming](/swift-dynamic-programming/)
- [Inverted Indexes](/swift-inverted-indexes/)
- [Bloom Filters](/swift-bloom-filters/)
- [HyperLogLog and Other Probabilistic Structures](/swift-hyperloglog/)
- [Merkle Trees](/swift-merkle-trees/)
- [Cryptographic Algorithms: Hashing (SHA) and Key Exchange (Diffie-Hellman)](/swift-cryptographic-algorithms/)
- [The Fourier Transform](/swift-fourier-transform/)
- [Parallel Algorithms and MapReduce](/swift-parallel-mapreduce/)
- [Linear Programming](/swift-linear-programming/)
{: .roadmap-topics}

## 7. Practice

The best way to learn algorithms is to solve problems with them:

- [Refresher: Solving a Few Problems](/problem_solving_swift_1_4/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-design-patterns/" next_title="Design Patterns" %}
