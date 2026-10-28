---
layout: page
title: "Functional Programming in Swift"
subtitle: "Small, pure functions and immutable data: code that's easier to test and trust"
permalink: /swift-functional-programming/
hide: true
excluded: true
---

Functional programming (FP) builds programs out of functions: small, predictable pieces that take input, return output, and don't secretly change anything else. Swift isn't a purely functional language, but it borrows many of FP's best ideas: first-class functions, closures, value types, `map` and `filter`, and a strong preference for immutability with `let`.

You don't have to go all in to benefit. Even a little functional thinking makes code easier to test, easier to reason about, and safer to run concurrently.

This guide follows the path of objc.io's excellent book *Functional Swift*, from the core mindset to advanced abstractions. The articles develop original examples with executable checks, explain the limits of each technique, and finish with exercises that extend the design.

The series uses a Swift 5.7 baseline, released on [September 12, 2022](https://www.swift.org/blog/swift-5.7-released/). Article dates run from November 2022 through June 2024; the examples use language features and APIs available by those dates. You can follow the sections in order or start with an everyday collection problem and return to the underlying ideas.

{% include roadmap/legend.liquid %}

## 1. The Functional Mindset

- [Thinking Functionally: Functions as Values](/swift-functions-as-values/)
- [Pure Functions and Side Effects](/swift-pure-functions-side-effects/)
- [From Imperative to Declarative Code](/swift-imperative-to-declarative/)
- [Case Study: Wrapping Core Image Filters in Functions](/swift-functional-core-image/)
{: .roadmap-topics}

## 2. Everyday Functional Swift

- [Higher-Order Functions](/swift-higher-order-functions/)
- [`map`, `filter`, and `reduce`](/swift-map-filter-reduce/)
- [`compactMap` and `flatMap`](/swift-compactmap-flatmap/)
- [Optionals as a Functional Tool](/swift-functional-optionals/)
- [Enumerations and Algebraic Data Types](/swift-algebraic-data-types/)
{: .roadmap-topics}

## 3. Immutability and Testing

- [The Value of Immutability](/swift-immutability/)
- [Value Types and Copy-on-Write](/swift-copy-on-write/)
- [Property-Based Testing: The QuickCheck Approach in Swift](/swift-property-based-testing/)
{: .roadmap-topics}

## 4. Functional Data Structures

- [Purely Functional Data Structures](/swift-persistent-data-structures/)
- [Binary Search Trees and Tries, the Functional Way](/swift-functional-trees-tries/)
- [Iterators and Sequences](/swift-iterators-sequences/)
- [Lazy Sequences](/swift-lazy-sequences/)
{: .roadmap-topics}

## 5. Bigger Ideas

- [Building Diagrams with Functions](/swift-functional-diagrams/)
- [Parser Combinators](/swift-parser-combinators/)
- [Case Study: Building a Spreadsheet App](/swift-functional-spreadsheet/)
- [Functors, Applicative Functors, and Monads](/swift-functors-applicatives-monads/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-data-structures-and-algorithms/" next_title="Data Structures & Algorithms" %}
