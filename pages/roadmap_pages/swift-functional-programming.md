---
layout: page
title: "Functional Programming in Swift"
subtitle: "Small, pure functions and immutable data: code that's easier to test and trust"
permalink: /swift-functional-programming/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

Functional programming (FP) builds programs out of functions: small, predictable pieces that take input, return output, and don't secretly change anything else. Swift isn't a purely functional language, but it borrows many of FP's best ideas: first-class functions, closures, value types, `map` and `filter`, and a strong preference for immutability with `let`.

You don't have to go all in to benefit. Even a little functional thinking makes code easier to test, easier to reason about, and safer to run concurrently.

This guide follows the path of objc.io's excellent book *Functional Swift*, from the core mindset to advanced abstractions.

{% include roadmap/legend.liquid %}

## 1. The Functional Mindset

- Thinking Functionally: Functions as Values
- Pure Functions and Side Effects
- From Imperative to Declarative Code
- Case Study: Wrapping Core Image Filters in Functions
{: .roadmap-topics}

## 2. Everyday Functional Swift

- Higher-Order Functions
- `map`, `filter`, and `reduce`
- `compactMap` and `flatMap`
- Optionals as a Functional Tool
- Enumerations and Algebraic Data Types
{: .roadmap-topics}

## 3. Immutability and Testing

- The Value of Immutability
- Value Types and Copy-on-Write
- Property-Based Testing with QuickCheck
{: .roadmap-topics}

## 4. Functional Data Structures

- Purely Functional Data Structures
- Binary Search Trees and Tries, the Functional Way
- Iterators and Sequences
- Lazy Sequences
{: .roadmap-topics}

## 5. Bigger Ideas

- Building Diagrams with Functions
- Parser Combinators
- Case Study: Building a Spreadsheet App
- Functors, Applicative Functors, and Monads
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-data-structures-and-algorithms/" next_title="Data Structures & Algorithms" %}
