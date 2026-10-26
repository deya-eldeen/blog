---
layout: post
hidden: true
title: "Building Diagrams with Functions in Swift: A Small Layout Language"
date: "2024-03-21"
last_modified_at: "2024-03-21"
permalink: /swift-functional-diagrams/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Graphics, Composition]
thumbnail: assets/img/article-placeholder.svg
---
A drawing API often starts as a sequence of commands: move here, set a color, draw a rectangle, restore the context. That works, but layout rules and rendering effects quickly become tangled.

Another approach represents the diagram as a value. Functions combine diagrams into larger diagrams, a layout interpreter calculates geometry, and a renderer turns that geometry into output. The same description can then support preview, export, and tests.

<!--more-->

This Swift 5.7 case study builds a tiny rectangle language and an SVG renderer. It is intentionally smaller than a UI framework: no text measurement, constraints, animation, or platform view lifecycle.

## Define the vocabulary before the renderer

```swift
import Foundation

struct DiagramSize: Equatable {
    let width: Double
    let height: Double
}

enum Ink: String {
    case blue = "#2563eb"
    case orange = "#ea580c"
    case green = "#16a34a"
}

indirect enum Diagram {
    case rectangle(DiagramSize, Ink)
    case beside(Diagram, Diagram, gap: Double)
    case above(Diagram, Diagram, gap: Double)
}

func rectangle(width: Double, height: Double, ink: Ink) -> Diagram {
    precondition(width.isFinite && height.isFinite && width >= 0 && height >= 0)
    return .rectangle(DiagramSize(width: width, height: height), ink)
}

func beside(_ left: Diagram, _ right: Diagram, gap: Double = 0) -> Diagram {
    precondition(gap.isFinite && gap >= 0)
    return .beside(left, right, gap: gap)
}

func above(_ top: Diagram, _ bottom: Diagram, gap: Double = 0) -> Diagram {
    precondition(gap.isFinite && gap >= 0)
    return .above(top, bottom, gap: gap)
}
```

The enum is a small language. Rectangle is a primitive; beside and above are composition operations. The factories are ordinary functions returning descriptions, so constructing a diagram does not draw anything.

The example assumes callers use these factories and modest dimensions whose sums remain finite. The enum cases themselves are accessible in this single-file demonstration. A production module should hide unchecked construction or validate the whole description before interpreting external input.

Preconditions are suitable for programmer mistakes, not user-facing validation. An editor accepting arbitrary dimensions should return structured errors instead of terminating the process.

## Give each composition a measurement rule

```swift
func measured(_ diagram: Diagram) -> DiagramSize {
    switch diagram {
    case let .rectangle(size, _):
        return size
    case let .beside(left, right, gap):
        let a = measured(left)
        let b = measured(right)
        return DiagramSize(width: a.width + gap + b.width, height: max(a.height, b.height))
    case let .above(top, bottom, gap):
        let a = measured(top)
        let b = measured(bottom)
        return DiagramSize(width: max(a.width, b.width), height: a.height + gap + b.height)
    }
}

let blue = rectangle(width: 80, height: 40, ink: .blue)
let orange = rectangle(width: 30, height: 60, ink: .orange)
let row = beside(blue, orange, gap: 10)
let picture = above(row, rectangle(width: 120, height: 20, ink: .green), gap: 5)
assert(measured(row) == DiagramSize(width: 120, height: 60))
assert(measured(picture) == DiagramSize(width: 120, height: 85))
```

The rules are explicit: a row adds widths and takes the maximum height; a column takes the maximum width and adds heights. This language aligns rows at the top and columns at the left.

Different alignment policies deserve representation. Centering a shorter child changes its origin, not its intrinsic size. Padding changes the enclosing size. Keeping those distinctions explicit prevents one operation from quietly taking responsibility for another.

## Interpret the description into placed primitives

```swift
struct PlacedRectangle: Equatable {
    let x: Double
    let y: Double
    let size: DiagramSize
    let ink: Ink
}

func layout(_ diagram: Diagram) -> [PlacedRectangle] {
    var output: [PlacedRectangle] = []
    func place(_ current: Diagram, x: Double, y: Double) {
        switch current {
        case let .rectangle(size, ink):
            output.append(PlacedRectangle(x: x, y: y, size: size, ink: ink))
        case let .beside(left, right, gap):
            place(left, x: x, y: y)
            place(right, x: x + measured(left).width + gap, y: y)
        case let .above(top, bottom, gap):
            place(top, x: x, y: y)
            place(bottom, x: x, y: y + measured(top).height + gap)
        }
    }
    place(diagram, x: 0, y: 0)
    return output
}

let placed = layout(picture)
assert(placed.count == 3)
assert(placed[0].x == 0 && placed[0].y == 0)
assert(placed[1].x == 90 && placed[1].y == 0)
assert(placed[2].x == 0 && placed[2].y == 65)
```

The layout output is still data. It can be inspected without a graphics context. That gives tests a stable target: positions and dimensions rather than a screenshot with platform-dependent antialiasing.

Traversal order also defines painting order. This language places each primitive once and lists left or top children before right or bottom children. If overlapping operations are added, the renderer must preserve the intended stacking policy.

## Render SVG without coupling it to layout

```swift
func svg(_ diagram: Diagram) -> String {
    let size = measured(diagram)
    let rectangles = layout(diagram).map { item in
        "<rect x=\"\(item.x)\" y=\"\(item.y)\" " +
        "width=\"\(item.size.width)\" height=\"\(item.size.height)\" " +
        "fill=\"\(item.ink.rawValue)\"/>"
    }.joined()
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" " +
        "viewBox=\"0 0 \(size.width) \(size.height)\">" + rectangles + "</svg>"
}

let exported = svg(picture)
assert(exported.contains("viewBox=\"0 0 120.0 85.0\""))
assert(exported.components(separatedBy: "<rect ").count - 1 == 3)
```

Foundation supplies the string-splitting helper used in the assertion. The diagram and layout calculations themselves use only standard Swift types.

The output contains only numeric geometry and closed enum color values. Adding user-authored labels would require XML escaping, and adding external image URLs would require a resource policy. A renderer should validate whatever new vocabulary it accepts.

Writing the returned string to disk or displaying it in a web view is an effect outside this function. A second renderer could draw the placed rectangles through Core Graphics while reusing the same layout interpretation.

## The representation determines which questions are easy

We could represent a diagram as a drawing closure. That is convenient to execute, but difficult to inspect, serialize, or transform. A syntax tree preserves the operations as data.

With the tree, another interpreter can count primitives, replace colors, calculate bounds, or serialize an editable description. A closure representation would need extra metadata to answer those questions.

This is a recurring functional design choice: functions compose execution; data descriptions compose intent. Choose based on whether the application needs to examine the structure before running it.

## Compositional does not automatically mean efficient

`layout` calls `measured` on subtrees while traversing. In a deeply nested composition, the same subtree can be measured repeatedly, producing quadratic work in an unfavorable shape.

A better implementation can perform one measurement pass that creates an annotated tree containing each node's size, then a placement pass that reads those cached sizes. Another option combines measurement and construction into one intermediate representation.

The optimization should preserve the same public layout rules. Keep the simple interpreter as a reference over small generated diagrams and compare the optimized output against it.

Deeply nested input can also exhaust recursive traversal. A production editor can bound nesting or use an explicit stack. Resource limits belong alongside geometric validity when descriptions come from files or users.

## Algebraic laws need the right notion of equality

Two differently grouped rows with zero gap can produce the same placed geometry even though their syntax trees differ. Equality of syntax is stronger than equality of rendered meaning.

With nonzero gaps, regrouping requires care because each composition introduces its own gap. Above and beside are not interchangeable, and neither is commutative: swapping children changes positions and painting order.

An empty diagram can serve as an identity only after its spacing behavior is defined. Does placing an empty diagram beside a rectangle add a gap? An innocent-looking identity law can fail if the combinator always inserts spacing.

Write laws against the chosen interpretation, such as measured size or placed geometry, and restrict their assumptions explicitly. This makes algebra useful for refactoring rather than decorative terminology.

## Test geometry and output separately

Geometry tests should cover unequal child sizes, nested rows and columns, zero-size primitives, and nonzero gaps. Assert the enclosing size and the child origins.

Renderer tests should check element count, attributes, and well-formed output. Avoid making every layout test compare a long SVG string; a formatting change should not obscure whether geometry is still correct.

For a Core Graphics renderer, add a few visual snapshots to cover clipping and painting. Keep most layout tests independent of the rendering backend so failures point to the right layer.

## Transform the description without touching the renderer

A recoloring operation illustrates the benefit of retaining the syntax tree. It changes primitive styling while preserving composition:

```swift
func recolored(_ diagram: Diagram, ink: Ink) -> Diagram {
    switch diagram {
    case let .rectangle(size, _):
        return .rectangle(size, ink)
    case let .beside(left, right, gap):
        return .beside(recolored(left, ink: ink), recolored(right, ink: ink), gap: gap)
    case let .above(top, bottom, gap):
        return .above(recolored(top, ink: ink), recolored(bottom, ink: ink), gap: gap)
    }
}

let monochrome = recolored(picture, ink: .green)
assert(measured(monochrome) == measured(picture))
assert(layout(monochrome).allSatisfy { $0.ink == .green })
assert(layout(picture)[0].ink == .blue)
```

The original picture remains unchanged. Neither layout nor the SVG renderer needs a special monochrome mode because both already interpret the transformed description.

Other structural transformations could remove invisible primitives, replace a palette, or attach accessibility descriptions. Keep each transformation's preservation contract explicit: recoloring preserves geometry, while padding intentionally changes it.

## Test an algebraic claim through its interpretation

For zero-gap rows with top alignment, regrouping beside operations preserves the placed geometry:

```swift
let green = rectangle(width: 20, height: 10, ink: .green)
let leftGrouped = beside(beside(blue, orange), green)
let rightGrouped = beside(blue, beside(orange, green))
assert(measured(leftGrouped) == measured(rightGrouped))
assert(layout(leftGrouped) == layout(rightGrouped))
```

The syntax trees differ, but their interpretation matches. A property test can generate small finite diagrams and check this law within the supported geometry range.

If alignment or spacing rules change, reconsider the law instead of preserving the test blindly. An algebraic statement is useful only when its assumptions match the actual language semantics.

## Add another interpreter before adding platform state

A useful next interpreter returns a list of bounds or a textual tree for debugging. Neither requires a live UI view. This keeps the diagram language inspectable even when a rendering backend fails.

A Core Graphics interpreter should receive a context from its owner and preserve any required graphics state around its work. The context's lifetime, thread use, and coordinate transform belong at that boundary.

The model can remain platform-independent while the renderer handles platform coordinate conventions. For example, an SVG-style downward-positive y-axis may differ from a particular Core Graphics context configuration. Convert once in the renderer rather than spreading compensating sign changes through layout functions.

## Keep cached measurement attached to the right version

If measurement is cached, the cache must correspond to the exact description and all measurement dependencies. Text would add font, size, and shaping configuration; image primitives would add intrinsic dimensions.

Attaching measured sizes to an immutable annotated tree is one way to preserve that relationship. A global cache keyed only by a node's display name would be unsafe if the node's content changes.

The same design principle appears throughout functional code: stable inputs support reuse, while cached derived facts still need a correct identity and invalidation model.

## Exercise: add padding and centered alignment

Add a padding case with explicit top, left, bottom, and right values. Define its measurement and placement rules, then test a padded row inside a column.

Next add vertical alignment to beside. A shorter child should move within the row's measured height while the row's size remains unchanged. Compare top, center, and bottom alignment using the same primitives.

For the language building blocks, see [Recursive Enumerations](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/enumerations/#Recursive-Enumerations). Continue with [Parser Combinators](/swift-parser-combinators/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
