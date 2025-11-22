---
layout: post
title: "Phantom Types in Swift"
date: "2025-10-15"
last_modified_at: "2025-10-15"
permalink: /swift-phantom-types/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swift_phantom_types_full.webp"
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Type Safety"
  - "Generics"
  - "Phantom Types"
---

Phantom types let you tuck extra meaning into Swift’s type system without changing anything at runtime. They live in a generic parameter purely for compile-time checks, which means you can stop category mistakes—mixing meters with feet or safe SQL with raw text—while keeping zero overhead.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/swift_phantom_types_full.webp"
 alt_text="Phantom Types In Swift" 
 caption="Phantom Types In Swift"
 width="960" 
 height="1568"
%}

## The basic idea

Consider a `Tagged` wrapper that carries a `Raw` value and a phantom `Tag` type:

```swift
struct Tagged<Tag, Raw> {
    let raw: Raw
    init(_ raw: Raw) { self.raw = raw }
}
```

`Tag` never appears as a stored property, but the compiler still tracks it. This means two wrappers with different tags are incompatible even if they share the same raw type.

## Eliminating category errors

Imagine working with units. Create tiny, empty types to tag your values:

```swift
enum MetersTag {}
enum FeetTag {}

typealias Meters = Tagged<MetersTag, Double>
typealias Feet   = Tagged<FeetTag, Double>
```

Now a function like `distanceInMeters` only accepts `Meters`. Passing a `Feet` value won’t compile, even though both carry a `Double` underneath. The compiler blocks the mix-up before it ever runs.

## Safer APIs with compile-time intent

Say you’re building SQL. You can mark raw SQL differently from sanitized SQL:

```swift
enum RawSQL {}
enum SafeSQL {}

typealias SQL<Flavor> = Tagged<Flavor, String>

func sanitize(_ input: SQL<RawSQL>) -> SQL<SafeSQL> {
    SQL<SafeSQL>("sanitize(\(input.raw))")
}

func execute(_ query: SQL<SafeSQL>) { /* ... */ }

let userInput = SQL<RawSQL>("DROP TABLE users;")
let safe = sanitize(userInput)
execute(safe)           // ✅
// execute(userInput)   // won’t compile, raw SQL rejected
```

The same trick keeps coordinate systems honest:

```swift
enum ViewSpace {}
enum WorldSpace {}

struct Point<Tag> {
    var x: Double
    var y: Double
}

typealias ViewPoint  = Point<ViewSpace>
typealias WorldPoint = Point<WorldSpace>

func convertToWorld(_ p: ViewPoint) -> WorldPoint {
    WorldPoint(x: p.x * 2, y: p.y * 2)
}

let local = ViewPoint(x: 10, y: 20)
let world = convertToWorld(local)
// convertToWorld(world) // won’t compile, can’t double-convert
```

By tagging points, you can’t accidentally convert the same point twice or pass a world-space point where a view-space point belongs.

## Real-world Swift uses

You can wrap identifiers to stop cross-wiring them. Tag `UserID` and `OrderID` so an order summary can never swap them. You can tag network payloads by version and make your decoder refuse to mix v1 with v2. You can tag UI points by layout or screen space to keep math from drifting between coordinate systems. The pattern stays the same: a phantom tag carries meaning the compiler understands, but your runtime values remain lean.

## Designing phantom types well

Keep tag types empty and name them for intent—`SafeSQL`, `Meters`, `WorldSpace`—so the purpose is clear at the call site. Lean on typealiases to keep code readable. Conform your wrapper (not the tag) to protocols like `Equatable` or `Codable` so you don’t leak the implementation detail everywhere.

## Pitfalls to avoid

It’s tempting to tag everything, but overuse makes APIs noisy. Save phantom types for places where mixing values would be a real bug. Don’t force tags into public protocols unless you want consumers to depend on them. Keep initializers narrow—like `init(rawValue:)` on the wrapper—so callers can’t bypass the validation you intend.

## Testing phantom-heavy code

You can even “test” the compiler by keeping small snippets that should fail to compile, annotated with `// expected-error` when using tools like SwiftSyntax. In regular unit tests, focus on the behavior of the wrapped values, and add one or two negative cases to prove cross-domain usage won’t build.

## When to reach for phantom types

Reach for phantom types when you want the compiler to guard against mixing domains, when runtime checks would be noisy or forgettable, and when you want zero-cost safety because the tags vanish after compilation. Skip them if the extra generic parameter harms ergonomics or if a simpler domain model or enum can express the same rule.

Phantom types are a gentle way to make invalid states unrepresentable in Swift. They turn assumptions into code the compiler enforces. Start with a small tag around your most error-prone values—IDs, units, or raw SQL—run it through your pipeline, and only expand when the safety gain is obvious.
