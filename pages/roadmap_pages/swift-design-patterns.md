---
layout: page
title: "Design Patterns in Swift"
subtitle: "Proven solutions to problems you'll meet again and again"
permalink: /swift-design-patterns/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

Design patterns are named, reusable solutions to common design problems. Knowing them gives you two superpowers: you recognize problems you've seen before, and you can talk about solutions in a single word. Saying "let's use a coordinator" is a lot faster than explaining the whole idea.

Many classic patterns come from the 1994 "Gang of Four" book, *Design Patterns*. Some are built right into Swift and Apple's frameworks (delegation, observers, singletons), while others need a Swift-flavored twist with protocols, closures, and value types.

{% include roadmap/legend.liquid %}

## 1. Creational Patterns

How objects get created:

- Singleton
- Factory Method
- Abstract Factory
- Builder
- Prototype
- Object Pool
- Lazy Initialization
- Monostate
{: .roadmap-topics}

## 2. Structural Patterns

How objects are composed into bigger structures:

- Adapter
- Bridge
- Composite
- Decorator
- Facade
- Flyweight
- Proxy
{: .roadmap-topics}

## 3. Behavioral Patterns

How objects communicate and share responsibilities:

- Delegation
- Observer
- Publisher-Subscriber and Event Bus
- Chain of Responsibility
- Command
- Iterator
- Mediator
- Memento
- State
- Strategy
- Template Method
- Visitor
- Null Object
- Specification
{: .roadmap-topics}

## 4. App-Level Patterns

Patterns that shape how a whole app or feature is organized:

- Coordinator
- Repository
- Dependency Injection
- Service Locator and Registry
- Front Controller
- Three-Tier Architecture
{: .roadmap-topics}

Looking for MVC, MVVM, and friends? They have a guide of their own: see [Architectures](/swift-architectures/).

{% include roadmap/guide_footer.liquid next_url="/swift-architectures/" next_title="Architectures" %}
