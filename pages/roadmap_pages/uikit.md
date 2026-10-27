---
layout: page
title: "UIKit"
subtitle: "Build adaptable interfaces with explicit state and reliable lifecycles"
permalink: /uikit/
hide: true
excluded: true
---

Explore UIKit from view ownership and layout to reusable collections, navigation, and accessibility. The outline emphasizes the contracts that keep screens correct as data and presentation change. Topics remain unlinked until their articles are available.

{% include roadmap/legend.liquid %}

## 1. Views and Controllers

- Views, View Controllers, and the Responder Chain
- View Loading, Appearance, and Feature Lifetime
- Building Interfaces in Code and Interface Builder
- Target-Action, Delegates, and User Intent
- Keeping View Controllers Focused
{: .roadmap-topics}

## 2. Layout and Adaptation

- Auto Layout: Constraints, Priorities, and Intrinsic Size
- Safe Areas, Layout Margins, and Readable Content
- Stack Views and Composable Layouts
- Debugging Ambiguous and Unsatisfiable Constraints
- Adapting to Rotation, Multitasking, and Size Changes
{: .roadmap-topics}

## 3. Lists and Reusable Content

- Table Views: Data Sources, Delegates, and Reuse
- Collection Views and Compositional Layout
- Diffable Data Sources and Stable Item Identity
- Cell Configuration, Reuse, and Asynchronous Images
- Self-Sizing Cells and Dynamic Content
- Prefetching, Pagination, and Incremental Updates
{: .roadmap-topics}

## 4. Input and Presentation State

- Text Input, Validation, and Keyboard Coordination
- Gesture Recognizers and Interaction Conflicts
- Rendering Loading, Empty, Content, and Error States
- Preserving Selection, Focus, and Scroll Position
- Updating UI Safely from Asynchronous Work
{: .roadmap-topics}

## 5. Navigation and Composition

- Navigation Controllers and Interactive Back Navigation
- Modal Presentation and Dismissal Ownership
- Child View Controllers and Correct Containment
- Split Views, Scenes, and Multiple Windows
- Embedding SwiftUI with `UIHostingController`
{: .roadmap-topics}

## 6. Quality and Performance

- Dynamic Type and Content That Reflows
- VoiceOver Labels, Traits, and Focus Order
- Right-to-Left Layout and Localization
- State Restoration with Validated Identifiers
- Testing Controls and Navigation Through Real Interactions
- Finding Scrolling Hitches and Excessive Layout Work
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-networking/" next_title="Networking" %}
