---
layout: page
title: "Protocol-Oriented Programming in Swift"
subtitle: "Share behavior through protocols, not class hierarchies"
permalink: /swift-protocol-oriented-programming/
hide: true
excluded: true
---

When Apple introduced Swift, it also introduced a slogan: *"Swift is a protocol-oriented language."* Instead of building deep class hierarchies, you describe capabilities with protocols, give them default behavior with extensions, and let any type, whether a struct, an enum, or a class, adopt exactly the capabilities it needs.

Most of the Swift standard library works this way, from `Equatable` and `Hashable` to `Sequence` and `Collection`. This guide shows how to use the same approach in your own code.

{% include roadmap/legend.liquid %}

## 1. Why Not Just OOP?

- [A Quick Refresher on OOP: Encapsulation, Inheritance, Polymorphism](/swift-oop-refresher-for-pop/)
- [The Limits of Class Inheritance in Swift](/swift-inheritance-limits/)
- [OOP vs. POP: Two Ways to Share Behavior](/swift-oop-vs-pop/)
{: .roadmap-topics}

## 2. Protocol Basics

- [Defining Protocols](/swift-protocols/)
- [Property and Method Requirements](/swift-protocol-requirements/)
- [Adopting Protocols in Structs, Enums, and Classes](/swift-protocol-conformance/)
- [Protocol Composition (`A & B`)](/swift-protocols-instead-of-multiple-inheritance/)
- [Class-Only Protocols (`AnyObject`)](/swift-class-only-protocols/)
{: .roadmap-topics}

## 3. Protocol Extensions

- [Default Implementations](/swift-protocol-default-implementations/)
- [Adding Behavior to Existing Types](/swift-extensions/)
- [Constrained Extensions (`where` Clauses)](/swift-constrained-protocol-extensions/)
- [Static vs. Dynamic Dispatch in Protocol Extensions](/swift-static-vs-dynamic-dispatch/)
{: .roadmap-topics}

## 4. Protocols and Generics

- [Generic Functions and Types with Protocol Constraints](/swift-generics/)
- [Associated Types](/swift-associated-types/)
- [Primary Associated Types](/swift-primary-associated-types/)
- [Protocol Inheritance](/swift-protocol-inheritance/)
- [Opaque Types (`some`) vs. Existentials (`any`)](/swift-opaque-and-boxed-types/)
- [Phantom Types](/swift-phantom-types/)
{: .roadmap-topics}

## 5. Errors and Protocols

- [The `Error` Protocol and Custom Error Types](/swift-error-handling/)
- [Typed Throws](/swift-typed-throws/)
- [Designing Error Handling Around Protocols](/swift-protocol-error-design/)
{: .roadmap-topics}

## 6. Design Patterns, the Protocol Way

- [Delegation](/swift-delegation/)
- [Observer](/swift-protocol-observer-pattern/)
- [Factory](/swift-protocol-factory-pattern/)
- [Strategy](/swift-composition-over-inheritance/)
- [Dependency Injection with Protocols](/swift-dependency-injection/)
{: .roadmap-topics}

## 7. Putting It Into Practice

- [Building a Small App with POP](/swift-pop-reading-list/)
- [Refactoring Class Hierarchies into Protocols](/swift-refactoring-inheritance-to-protocols/)
- [Testing with Protocols and Test Doubles](/test-doubles-in-swift/)
- [Performance Considerations](/swift-protocol-performance/)
- [When Protocols Are Overkill](/swift-when-protocols-are-overkill/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-functional-programming/" next_title="Functional Programming" %}
