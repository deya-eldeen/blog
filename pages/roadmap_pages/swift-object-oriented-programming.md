---
layout: page
title: "Object-Oriented Programming in Swift"
subtitle: "Model your app's world with types that know what they are and what they do"
permalink: /swift-object-oriented-programming/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

Object-oriented programming (OOP) organizes code around *objects*: bundles of data and the behavior that belongs to it. UIKit, Foundation, and most of Apple's older frameworks are built this way, so understanding OOP is essential for reading and writing real iOS code.

Swift supports OOP fully, with its own twists: structs and enums can have methods too, there's no multiple class inheritance, and protocols often take the place of abstract classes. This guide covers the classic ideas and how they translate to Swift.

{% include roadmap/legend.liquid %}

## 1. Foundations

- Thinking in Objects: Modeling the Real World
- Classes, Structures, and Instances
- Value Types vs. Reference Types
- Reading and Drawing UML Class Diagrams
{: .roadmap-topics}

## 2. The Four Pillars

- Encapsulation
- Abstraction
- Inheritance and Specialization
- Polymorphism
{: .roadmap-topics}

## 3. How Classes Work in Swift

- Initializers and Deinitializers
- Designated and Convenience Initializers
- Overriding Methods and Properties
- Method Overloading
- `final` and Preventing Inheritance
- Type Properties and Methods (`static` and `class`)
- [The Root Class and NSObject](/swift-root-class-nsobject/)
{: .roadmap-topics}

## 4. Contracts and Relationships

- Contracting with Protocols
- Protocols Instead of Abstract Classes
- Protocols Instead of Multiple Inheritance
- Parent and Child Classes
- Composition Over Inheritance
- Delegation
{: .roadmap-topics}

## 5. Under the Hood

- Static vs. Dynamic Dispatch
- Access Control
- Reflection and Introspection
- Equality, Identity, and `Hashable`
- Deep Copy vs. Shallow Copy
{: .roadmap-topics}

## 6. Designing Good Objects

- The SOLID Principles
- Dependency Injection
- The Law of Demeter
- Common Anti-Patterns
- Mixing OOP with Functional Programming
{: .roadmap-topics}

## A Quick Tour of the Key Ideas

**Encapsulation** keeps an object's data and the code that changes it together, and hides the details behind a small public interface. In Swift, access control (`private`, `fileprivate`, `internal`, `public`) is how you draw that line.

**Abstraction** means exposing *what* something does while hiding *how*. A `PaymentProcessor` should offer `pay(amount:)`, not a dozen network details.

**Inheritance** lets a subclass reuse and extend a parent class. In Swift, only classes can inherit, and each class has at most one superclass. Structs and enums share behavior through protocols and extensions instead.

**Polymorphism** lets you treat different types through a common interface: a `[Shape]` array can hold circles and squares, and calling `area()` runs the right implementation for each. Swift achieves this with class inheritance *and* with protocols.

**SOLID** is a set of five design principles that keep object-oriented code flexible:

- **S**ingle Responsibility: a type should have one reason to change.
- **O**pen/Closed: open for extension, closed for modification.
- **L**iskov Substitution: subclasses must work anywhere their parent does.
- **I**nterface Segregation: prefer small, focused protocols over big ones.
- **D**ependency Inversion: depend on abstractions, not concrete types.

## Where OOP Falls Short

OOP is powerful, but it isn't free. Knowing its weak spots helps you decide when to reach for something else:

- **Shared mutable state.** Objects are references, so two parts of an app can change the same object, and bugs appear far from their cause. Swift's value types avoid this by giving each owner its own copy.
- **Fragile base classes.** A change in a parent class can quietly break its subclasses. Deep inheritance hierarchies make this worse.
- **Tight coupling.** Classes that create and depend on concrete classes are hard to test and hard to change. Protocols and dependency injection loosen this up.
- **Boilerplate.** Simple ideas can end up spread across many small classes.
- **Some runtime cost.** Dynamic dispatch and reference counting (ARC) add a little overhead compared with value types and static dispatch. It rarely matters, but it's there.

### The alternatives

Swift is a multi-paradigm language, so you can mix approaches freely:

- **Protocol-oriented programming:** share behavior through protocols and extensions, and use value types by default. This is the style Apple recommends for Swift.
- **Functional programming:** build programs from small, pure functions and immutable data, which makes code easier to test and reason about.
- **Declarative programming:** describe *what* you want and let the framework work out *how*. SwiftUI is the best-known example in the Apple world.
- **Procedural programming:** plain functions operating on data, a perfectly good fit for small scripts and tools.

{% include roadmap/guide_footer.liquid next_url="/swift-protocol-oriented-programming/" next_title="Protocol-Oriented Programming" %}
