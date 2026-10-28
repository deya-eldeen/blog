---
layout: post
hidden: true
title: "Wrapping Core Image Filters in Swift Functions"
date: "2023-02-16"
last_modified_at: "2023-02-16"
permalink: /swift-functional-core-image/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Core Image, Composition]
thumbnail: assets/img/article-placeholder.svg
---
An image editor needs reusable recipes: blur then tint, tint then crop, or apply the same preset to a preview and an export. Passing a mutable `CIFilter` through every screen makes those recipes depend on setup order and the filter's previous inputs.

A function can describe one image transformation. A function factory binds its parameters, and a composition function builds a recipe. Core Image still owns the image-processing machinery; the functional layer gives the application a smaller interface for arranging it.

<!--more-->

The examples use Swift 5.7 and Apple's Core Image and Core Graphics frameworks. They use the established string-based filter API, available before this article's date, rather than depending on a newer language feature.

## Distinguish an image recipe from rendered pixels

`CIImage` describes image content and operations. Obtaining a filter's output image generally constructs more of that description; rendering through a context is a separate step. Apple's [Core Image Programming Guide](https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/CoreImaging/ci_tasks/ci_tasks.html) explains this deferred workflow.

That separation fits function composition well: build the recipe first, render where the application needs pixels. It also means an output image alone is not evidence that GPU rendering or export succeeded.

```swift
import CoreImage
import CoreGraphics

enum ImageRecipeError: Error {
    case invalidParameter
    case unavailableFilter(String)
    case missingOutput(String)
    case renderFailed
}

typealias ImageTransform = (CIImage) throws -> CIImage

func gaussianBlur(radius: Double) throws -> ImageTransform {
    guard radius.isFinite && radius >= 0 else {
        throw ImageRecipeError.invalidParameter
    }
    return { image in
        let name = "CIGaussianBlur"
        guard let filter = CIFilter(name: name) else {
            throw ImageRecipeError.unavailableFilter(name)
        }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(radius, forKey: kCIInputRadiusKey)
        guard let output = filter.outputImage else {
            throw ImageRecipeError.missingOutput(name)
        }
        return output
    }
}
```

The factory validates configuration once and returns a transformation. Applying the transformation creates a fresh filter, sets all inputs it needs, and returns the output description. There is no stored mutable filter whose last input can leak into another call.

The throwing type preserves failure. Force-unwrapping `CIFilter(name:)` would turn an unavailable filter into a crash, and silently returning the input would disguise a failed preset as success.

## Build a second operation with the same shape

```swift
func sepia(intensity: Double) throws -> ImageTransform {
    guard intensity.isFinite && (0...1).contains(intensity) else {
        throw ImageRecipeError.invalidParameter
    }
    return { image in
        let name = "CISepiaTone"
        guard let filter = CIFilter(name: name) else {
            throw ImageRecipeError.unavailableFilter(name)
        }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(intensity, forKey: kCIInputIntensityKey)
        guard let output = filter.outputImage else {
            throw ImageRecipeError.missingOutput(name)
        }
        return output
    }
}

func followed(
    _ first: @escaping ImageTransform,
    by second: @escaping ImageTransform
) -> ImageTransform {
    { image in try second(first(image)) }
}

let blur = try gaussianBlur(radius: 4)
let tone = try sepia(intensity: 0.7)
let softSepia = followed(blur, by: tone)
```

Composition preserves the failure channel: if the first transformation throws, the second does not run. This is sequential recipe construction, not parallel execution.

The order is explicit at the call site. Do not generalize from one pair of filters that happens to produce similar output. Cropping, compositing, distortions, and neighborhood operations frequently depend on order.

## Give extent a deliberate policy

Core Image can represent infinite images. Some filters expand the output extent, and blurring near a finite edge raises a question: what color exists outside the original bounds?

A common finite-image policy is to extend edge pixels before blurring and crop back to the input rectangle:

```swift
func boundedBlur(radius: Double) throws -> ImageTransform {
    let blur = try gaussianBlur(radius: radius)
    return { image in
        let bounds = image.extent
        guard !bounds.isEmpty && !bounds.isInfinite && !bounds.isNull else {
            throw ImageRecipeError.invalidParameter
        }
        let extended = image.clampedToExtent()
        return try blur(extended).cropped(to: bounds)
    }
}

let bounds = CGRect(x: 0, y: 0, width: 32, height: 24)
let input = CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: bounds)
let preset = followed(try boundedBlur(radius: 4), by: tone)
let output = try preset(input)
assert(output.extent == bounds)
```

Clamping is a chosen edge behavior, not a universal correction. A transparent background, a repeating texture, or an intentionally expanding shadow may require a different rule. Store that choice alongside the recipe's other business decisions.

The rectangle is expressed in image coordinates. UIKit display coordinates and device pixels introduce their own scaling and orientation concerns. Apply orientation consistently when loading input; avoid treating a view's bounds as an image's extent by accident.

## Render at a clear effect boundary

```swift
func render(
    _ image: CIImage,
    bounds: CGRect,
    using context: CIContext
) throws -> CGImage {
    guard !bounds.isEmpty && !bounds.isInfinite && !bounds.isNull else {
        throw ImageRecipeError.invalidParameter
    }
    guard let result = context.createCGImage(image, from: bounds) else {
        throw ImageRecipeError.renderFailed
    }
    return result
}

let context = CIContext()
let rendered = try render(output, bounds: bounds, using: context)
assert(rendered.width == 32 && rendered.height == 24)
```

The application should own and reuse an appropriate context instead of constructing one for every thumbnail. It also owns output format, color space, cancellation, and delivery to the UI. The small helper above uses the default rendering configuration; a color-critical export needs more explicit settings.

This boundary is where a recipe becomes actual output. Measure preview and export performance here, with representative image sizes. Timing closure construction mostly measures construction, not the full image-processing workload.

## Be precise about purity

The wrappers avoid shared mutable filter state and make parameters explicit. That gives useful local reasoning. It is still too strong to promise mathematically identical pixels on every device merely because the wrapper is a function.

Rendering depends on processing configuration and implementation details, including color management and numeric precision. An input image backed by an externally managed resource also has a lifetime and stability contract. Treat a stable recipe and a reproducible rendering environment as separate concerns.

Capturing a `CIFilter` once in the factory and mutating it for every call would weaken the design. Concurrent or interleaved calls could change its inputs. Fresh local filters avoid that particular shared-state problem; scheduling and resource management remain the renderer's responsibility.

## Test the contract at several levels

Configuration tests should reject negative, infinite, and NaN radii and out-of-range sepia intensities. Geometry tests should verify the bounded recipe preserves a finite input extent and handles nonzero origins.

Rendering tests should use tiny known images and inspect dimensions and selected pixel behavior. For visual comparisons, allow an appropriate tolerance and control color-space configuration. A byte-for-byte snapshot from one machine may be a poor portable oracle for floating-point image processing.

Composition can be tested separately with simple transforms that crop or translate a rectangle. Verify that the second operation sees the first operation's output and that a thrown first step prevents the second from running. That checks the wrapper's contract without making every test depend on GPU output.

## When the recipe needs to be data

A closure is convenient to execute but difficult to save or inspect. If users can reorder and persist a stack of edits, model operations as an enum such as `.blur(radius:)`, `.sepia(intensity:)`, and `.crop(rect:)`.

An interpreter can translate those values into the functions above. The editor then stores user intent as data, while the renderer remains responsible for execution. This also makes unsupported operations and migration of saved presets explicit.

## Case study: interpret a saved edit stack

The distinction between a saved recipe and an executable closure becomes concrete with a small edit language:

```swift
enum ImageEdit {
    case blur(radius: Double)
    case sepia(intensity: Double)
}

func compileRecipe(_ edits: [ImageEdit]) throws -> ImageTransform {
    let transforms: [ImageTransform] = try edits.map { edit in
        switch edit {
        case let .blur(radius): return try boundedBlur(radius: radius)
        case let .sepia(intensity): return try sepia(intensity: intensity)
        }
    }
    return { image in
        var current = image
        for transform in transforms {
            current = try transform(current)
        }
        return current
    }
}

let savedEdits: [ImageEdit] = [.blur(radius: 4), .sepia(intensity: 0.7)]
let interpreted = try compileRecipe(savedEdits)
let interpretedOutput = try interpreted(input)
assert(interpretedOutput.extent == bounds)
let identityRecipe = try compileRecipe([])
let identityOutput = try identityRecipe(input)
assert(identityOutput.extent == input.extent)
```

An empty edit stack is the identity transformation. The compiler validates each edit's parameters while building the recipe. Filter availability and output construction are still checked when the transformation runs.

The array preserves user order. Reordering edits produces another description; the renderer does not need to know which UI gesture caused the change. An undo entry can retain the earlier edit array rather than rendered pixels for every intermediate state.

Saving these values to disk would require a versioned schema. Enum case names alone are not a migration plan: a future blur implementation might interpret a radius differently, and an old preset may contain an operation no longer supported.

## Preview and export should share intent

A preview often uses a downsampled image while export uses full resolution. Applying the same numeric radius to both images does not necessarily produce the same apparent effect when they are displayed at the same size.

Define whether parameters are measured in source-image pixels, normalized image dimensions, or display-space units. The preview adapter can convert from the saved parameter model to its working resolution. Export performs the corresponding conversion for the original image.

This is a domain decision outside the function-composition machinery. A shared recipe is valuable only if its parameter semantics remain consistent across consumers.

Likewise, cropping before downsampling and after downsampling can produce different edge behavior and coordinate rounding. Preserve the user's intended crop rectangle in a canonical coordinate space and convert deliberately at the boundary.

## Cancellation and obsolete results belong to the owner

Dragging a slider can start many preview calculations. Even when each recipe is independent, a slower old render can finish after a newer one and overwrite the display.

Assign a generation to each requested preview and accept output only for the current generation. Cancel superseded work where the rendering API permits it, but retain the generation check because cancellation can race with completion.

The transformation closure should not consult a mutable global “current intensity” during rendering. Capture a coherent edit snapshot for each request. This makes the result attributable to one recipe version and allows deterministic reproduction of a reported visual issue.

Resource ownership also matters: input buffers must remain valid for as long as the image recipe needs them. A small immutable-looking `CIImage` reference does not imply every underlying external buffer has an unlimited lifetime.

## Define what a visual regression means

A geometry assertion proves the crop bounds, not the filter's visual effect. A render-dimension assertion proves an image was produced at the expected size, not that its colors match the intended preset.

Use a small fixture with deliberately chosen edges and colors for visual tests. Record the rendering configuration, compare within an appropriate tolerance, and keep failures inspectable as images. Test broad properties such as preserved alpha or a known color relationship when those express the product requirement more robustly than exact bytes.

For performance, compare full preview latency and peak memory with the same source resolution and output settings. A pipeline that constructs fewer Swift objects may still render more pixels or retain larger intermediate resources.

## Exercise: add a crop operation

Add a crop factory that validates a finite, nonempty rectangle. Compare cropping before and after a bounded blur on an image containing a high-contrast border. Explain which pixels contribute near the new edge.

Then represent the three operations as enum cases and build an interpreter. Test that encoding and decoding a preset preserves the operation order before evaluating any image.

Continue with [Higher-Order Functions](/swift-higher-order-functions/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
