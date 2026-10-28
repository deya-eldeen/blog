---
layout: page
title: "Core Graphics"
subtitle: "Draw precise, scalable content and understand the cost of rendering it"
permalink: /core-graphics/
hide: true
excluded: true
---

Learn the geometry, drawing state, and image representations behind custom rendering on iOS. The topics progress from a drawing context to reusable renderers and performance checks. Article links will be added to this outline as content becomes available.

{% include roadmap/legend.liquid %}

## 1. Geometry and Contexts

- Points, Sizes, Rectangles, and Coordinate Systems
- Points vs. Pixels and Display Scale
- Drawing with `CGContext`
- Saving and Restoring Graphics State
- Translation, Rotation, and Affine Transforms
{: .roadmap-topics}

## 2. Paths and Appearance

- Building Paths with Lines and Bézier Curves
- Filling and Stroking Paths
- Line Width, Joins, Caps, and Dash Patterns
- Clipping Regions and Image Masks
- Gradients, Blend Modes, and Compositing
{: .roadmap-topics}

## 3. Images and Documents

- `CGImage`, `UIImage`, and Image Orientation
- Bitmap Contexts, Pixel Formats, and Color Spaces
- Resizing, Cropping, and Drawing Images
- Rendering Scalable Content into PDF
- Exporting Images with the Right Scale and Format
{: .roadmap-topics}

## 4. Rendering in an App

- Custom View Drawing and Invalidation
- Reusable Drawing Functions with Explicit Inputs
- Separating Geometry from UIKit and SwiftUI Rendering
- Rendering Offscreen Without Sharing Unsafe State
- Caching Rendered Output and Invalidating It Correctly
{: .roadmap-topics}

## 5. Verification and Performance

- Testing Geometry and Hit Regions
- Snapshot Testing with Controlled Rendering Inputs
- Reducing Overdraw and Repeated Drawing Work
- Profiling Image Memory and Rendering Cost
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/core-animation/" next_title="Core Animation" %}
