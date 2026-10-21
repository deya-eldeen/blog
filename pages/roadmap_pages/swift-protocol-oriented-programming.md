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

- A Quick Refresher on OOP: Encapsulation, Inheritance, Polymorphism
- The Limits of Class Inheritance in Swift
- OOP vs. POP: Two Ways to Share Behavior
{: .roadmap-topics}

## 2. Protocol Basics

- Defining Protocols
- Property and Method Requirements
- Adopting Protocols in Structs, Enums, and Classes
- Protocol Composition (`A & B`)
- Class-Only Protocols (`AnyObject`)
{: .roadmap-topics}

## 3. Protocol Extensions

- Default Implementations
- Adding Behavior to Existing Types
- Constrained Extensions (`where` Clauses)
- Static vs. Dynamic Dispatch in Protocol Extensions
{: .roadmap-topics}

## 4. Protocols and Generics

- Generic Functions and Types with Protocol Constraints
- Associated Types
- Primary Associated Types
- Protocol Inheritance
- Opaque Types (`some`) vs. Existentials (`any`)
- [Phantom Types](/swift-phantom-types/)
{: .roadmap-topics}

## 5. Errors and Protocols

- The `Error` Protocol and Custom Error Types
- Typed Throws
- Designing Error Handling Around Protocols
{: .roadmap-topics}

## 6. Design Patterns, the Protocol Way

- Delegation
- Observer
- Factory
- Strategy
- Dependency Injection with Protocols
{: .roadmap-topics}

## 7. Putting It Into Practice

- Building a Small App with POP
- Refactoring Class Hierarchies into Protocols
- [Testing with Protocols and Test Doubles](/test-doubles-in-swift/)
- Performance Considerations
- When Protocols Are Overkill
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-functional-programming/" next_title="Functional Programming" %}
