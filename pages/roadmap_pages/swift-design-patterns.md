---
layout: page
title: "Design Patterns in Swift"
subtitle: "Proven solutions to problems you'll meet again and again"
permalink: /swift-design-patterns/
hide: true
excluded: true
---

Design patterns are named, reusable solutions to common design problems. Their names make tradeoffs easier to discuss, but recognizing a pattern is only the beginning. Each article below develops its contracts, implementation, failure paths, and testing strategy in Swift.

Many classic patterns come from the 1994 "Gang of Four" book, *Design Patterns*. Some are built right into Swift and Apple's frameworks (delegation, observers, singletons), while others need a Swift-flavored twist with protocols, closures, and value types.

The dedicated examples use a Swift 5.7 baseline, released on [September 12, 2022](https://www.swift.org/blog/swift-5.7-released/). The coordinator example requires iOS 16 or macOS 13 for `NavigationStack`. Related articles on delegation, observers, iteration, strategy, and dependency injection state their own language context.

Read the examples in order within each article: later Swift blocks extend the earlier definitions and include executable assertions. Diagrams show ownership, dispatch, and state transitions; equations appear where resource accounting or representation cost benefits from a precise model.

{% include roadmap/legend.liquid %}

## 1. Creational Patterns

How objects get created:

- [Singleton](/swift-singleton/)
- [Factory Method](/swift-factory-method/)
- [Abstract Factory](/swift-abstract-factory/)
- [Builder](/swift-builder/)
- [Prototype](/swift-prototype/)
- [Object Pool](/swift-object-pool/)
- [Lazy Initialization](/swift-lazy-initialization/)
- [Monostate](/swift-monostate/)
{: .roadmap-topics}

## 2. Structural Patterns

How objects are composed into bigger structures:

- [Adapter](/swift-adapter/)
- [Bridge](/swift-bridge-pattern/)
- [Composite](/swift-composite/)
- [Decorator](/swift-decorator/)
- [Facade](/swift-facade/)
- [Flyweight](/swift-flyweight/)
- [Proxy](/swift-proxy/)
{: .roadmap-topics}

## 3. Behavioral Patterns

How objects communicate and share responsibilities:

- [Delegation](/swift-delegation/)
- [Observer](/swift-protocol-observer-pattern/)
- [Publisher-Subscriber and Event Bus](/swift-publisher-subscriber/)
- [Chain of Responsibility](/swift-chain-of-responsibility/)
- [Command](/swift-command/)
- [Iterator](/swift-iterators-sequences/)
- [Mediator](/swift-mediator/)
- [Memento](/swift-memento/)
- [State](/swift-state-pattern/)
- [Strategy](/swift-composition-over-inheritance/)
- [Template Method](/swift-template-method/)
- [Visitor](/swift-visitor/)
- [Null Object](/swift-null-object/)
- [Specification](/swift-specification/)
{: .roadmap-topics}

## 4. App-Level Patterns

Patterns that shape how a whole app or feature is organized:

- [Coordinator](/swift-coordinator/)
- [Repository](/swift-repository/)
- [Dependency Injection](/swift-dependency-injection/)
- [Service Locator and Registry](/swift-service-locator-registry/)
- [Front Controller](/swift-front-controller/)
- [Three-Tier Architecture](/swift-three-tier-architecture/)
{: .roadmap-topics}

Looking for MVC, MVVM, and friends? They have a guide of their own: see [Architectures](/swift-architectures/).

{% include roadmap/guide_footer.liquid next_url="/swift-architectures/" next_title="Architectures" %}
