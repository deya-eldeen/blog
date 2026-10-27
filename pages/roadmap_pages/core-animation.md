---
layout: page
title: "Core Animation"
subtitle: "Animate layers while keeping timing, interaction, and final state correct"
permalink: /core-animation/
hide: true
excluded: true
---

Understand the layer tree before adding movement. This outline covers animation state, timing, composition, interruption, and rendering performance. The entries are planned article titles, grouped as a learning path.

{% include roadmap/legend.liquid %}

## 1. Layers and State

- Views, Layers, and the Render Tree
- Model Layers vs. Presentation Layers
- Layer Geometry: Bounds, Position, and Anchor Points
- Implicit Animations and Layer Actions
- Transactions and Disabling Unwanted Animations
{: .roadmap-topics}

## 2. Explicit Animation

- Basic Animations and Persistent Final State
- Keyframe Animations and Motion Paths
- Spring Animations and Physical Parameters
- Animation Groups and Coordinated Properties
- Timing Functions and Perceived Motion
{: .roadmap-topics}

## 3. Timing and Interaction

- Begin Times, Durations, and Local Layer Time
- Repeating, Autoreversing, and Filling Animations
- Pausing, Resuming, and Scrubbing an Animation
- Interrupting and Retargeting from the Visible State
- Completion Callbacks, Cancellation, and Ownership
{: .roadmap-topics}

## 4. Specialized Layers

- Drawing and Animating `CAShapeLayer` Paths
- Gradient Layers and Animated Color Stops
- Masks, Shadows, Borders, and Rounded Corners
- Three-Dimensional Transforms and Perspective
- Choosing Layer Animation vs. UIKit Animation APIs
{: .roadmap-topics}

## 5. Quality and Performance

- Respecting Reduce Motion Without Losing Meaning
- Diagnosing Offscreen Rendering and Rasterization
- Finding Hitches and Expensive Layer Trees
- Testing Animation Outcomes Without Arbitrary Sleeps
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-audio-video/" next_title="Audio and Video" %}
