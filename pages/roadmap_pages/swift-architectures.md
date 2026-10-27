---
layout: page
title: "App Architectures in Swift"
subtitle: "How to organize an app so it stays easy to change"
permalink: /swift-architectures/
hide: true
excluded: true
---

Every app has an architecture, whether you chose one or not. Architecture decides where each piece of code lives, how data flows from the network to the screen, and how painful your next feature will be.

There's no single "best" architecture. Each one trades simplicity for structure in a different way. A weekend project and a banking app with fifty developers need very different things. This guide covers the architectures you'll meet in real iOS codebases, so you can recognize them, understand their trade-offs, and choose wisely.

Before diving in, it helps to know a few [design patterns](/swift-design-patterns/), especially delegation, observer, and coordinator.

Each article develops a concrete Swift example, its ownership and failure contracts, testing strategy, and limitations. Read the Swift blocks in order within an article; later blocks extend earlier definitions. The framework-independent examples explain architectural contracts, while the TCA article runs against a pinned library release.

Most examples use Swift 5.7. Articles using native Observation require Swift 5.9 and the iOS 17/macOS 14 generation; their dates follow those releases. The TCA article targets 1.7.0, whose Observation support [shipped in January 2024](https://www.pointfree.co/blog/posts/130-observation-comes-to-the-composable-architecture). Version and deployment requirements are called out where they matter.

{% include roadmap/legend.liquid %}

## 1. Model-View-Controller (MVC)

- [How Apple's MVC Works](/swift-mvc/)
- [Strengths and Weaknesses](/swift-mvc-tradeoffs/)
- [The "Massive View Controller" Problem](/swift-massive-view-controller/)
{: .roadmap-topics}

## 2. MVC Variants

- [MVC+VS: MVC with an Explicit View State](/swift-mvc-view-state/)
- [MVC+C: MVC with Coordinators](/swift-mvc-coordinators/)
- [MAVB: ModelAdapter-ViewBinder](/swift-mavb/)
{: .roadmap-topics}

## 3. Model-View-Presenter (MVP)

- [How MVP Works](/swift-mvp/)
- [When MVP Makes Sense](/swift-mvp-tradeoffs/)
{: .roadmap-topics}

## 4. Model-View-ViewModel (MVVM)

- [How MVVM Works](/swift-mvvm/)
- [Data Binding: Closures, Combine, and Observation](/swift-data-binding/)
- [MVVM-C: MVVM with Coordinators](/swift-mvvm-coordinators/)
- [MVVM in SwiftUI](/swift-mvvm-swiftui/)
{: .roadmap-topics}

## 5. Clean Architecture and VIPER

- [Clean Architecture Principles](/swift-clean-architecture/)
- [VIPER: View, Interactor, Presenter, Entity, Router](/swift-viper/)
- [Clean Swift (VIP)](/swift-clean-swift-vip/)
- [When the Extra Structure Pays Off](/swift-architecture-structure-cost/)
{: .roadmap-topics}

## 6. RIBs

- [Uber's RIBs: Router, Interactor, Builder](/swift-ribs/)
- [Use Cases for Large Teams and Apps](/swift-ribs-at-scale/)
{: .roadmap-topics}

## 7. Unidirectional Data Flow

- [Redux: State, Actions, and Reducers](/swift-redux/)
- [The Elm Architecture (TEA)](/swift-elm-architecture/)
- [The Composable Architecture (TCA)](/swift-composable-architecture/)
- [Lasso](/swift-lasso/)
{: .roadmap-topics}

## 8. Choosing an Architecture

- [Team Size and App Complexity](/swift-architecture-team-complexity/)
- [Testability](/swift-architecture-testability/)
- [UIKit vs. SwiftUI Considerations](/swift-uikit-swiftui-architecture/)
- [Migrating from One Architecture to Another](/swift-architecture-migration/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-testing/" next_title="Testing" %}
