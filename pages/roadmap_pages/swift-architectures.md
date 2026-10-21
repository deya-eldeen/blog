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

{% include roadmap/legend.liquid %}

## 1. Model-View-Controller (MVC)

- How Apple's MVC Works
- Strengths and Weaknesses
- The "Massive View Controller" Problem
{: .roadmap-topics}

## 2. MVC Variants

- MVC+VS: MVC with an Explicit View State
- MVC+C: MVC with Coordinators
- MAVB: ModelAdapter-ViewBinder
{: .roadmap-topics}

## 3. Model-View-Presenter (MVP)

- How MVP Works
- When MVP Makes Sense
{: .roadmap-topics}

## 4. Model-View-ViewModel (MVVM)

- How MVVM Works
- Data Binding: Closures, Combine, and Observation
- MVVM-C: MVVM with Coordinators
- MVVM in SwiftUI
{: .roadmap-topics}

## 5. Clean Architecture and VIPER

- Clean Architecture Principles
- VIPER: View, Interactor, Presenter, Entity, Router
- Clean Swift (VIP)
- When the Extra Structure Pays Off
{: .roadmap-topics}

## 6. RIBs

- Uber's RIBs: Router, Interactor, Builder
- Use Cases for Large Teams and Apps
{: .roadmap-topics}

## 7. Unidirectional Data Flow

- Redux: State, Actions, and Reducers
- The Elm Architecture (TEA)
- The Composable Architecture (TCA)
- Lasso
{: .roadmap-topics}

## 8. Choosing an Architecture

- Team Size and App Complexity
- Testability
- UIKit vs. SwiftUI Considerations
- Migrating from One Architecture to Another
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/gentle-introduction-to-unit-testing/" next_title="Unit Testing" %}
