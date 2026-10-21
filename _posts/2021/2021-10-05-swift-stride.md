---
layout: post
hidden: true
title: "stride in Swift"
date: "2021-10-05"
last_modified_at: "2021-10-05"
permalink: /swift-stride/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Basics"
  - "Collections"
thumbnail: "images/covers/swift_stride_thumbnail.webp"
thumbnail_ready: true
---

Swift has no C-style `for (int i = 0; i < 10; i += 2)` loop. Ranges like `0..<10` cover steps of one, and for everything else there's `stride`: counting by twos, counting down, stepping through decimals, or walking every third element of an array. Behind it is a small protocol, `Strideable`, which your own types can adopt too.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_stride_thumbnail.webp"
 alt_text="A fixed stride visiting positions zero, two, four and six"
 caption="stride in Swift"
 width="640"
 height="400"
%}

## `to` vs. `through`

There are two `stride` functions, and the only difference is whether the end value can be included:

```swift
for i in stride(from: 0, to: 10, by: 2) {
    print(i)          // 0, 2, 4, 6, 8: stops BEFORE 10
}

for i in stride(from: 0, through: 10, by: 2) {
    print(i)          // 0, 2, 4, 6, 8, 10: includes 10 when a step lands on it
}
```

An easy way to remember it: `to` works like `..<`, and `through` works like `...`.

`through` only includes the end value if the steps land on it **exactly**:

```swift
print(Array(stride(from: 0, through: 9, by: 2)))   // [0, 2, 4, 6, 8]
```

## Counting down

Use a negative step:

```swift
for seconds in stride(from: 3, through: 1, by: -1) {
    print("\(seconds)…")
}
print("Liftoff!")

print(Array(stride(from: 10, to: 0, by: -3)))   // [10, 7, 4, 1]
```

For a simple countdown by one, `reversed()` on a range reads just as well, and is equally efficient: it doesn't build an array, it just walks the range backwards.

```swift
for seconds in (1...3).reversed() {
    print(seconds)
}
```

## Floating-point strides

`stride` works with any `Strideable` type, including `Double`, `Float`, and `CGFloat`:

```swift
for angle in stride(from: 0.0, through: 1.0, by: 0.25) {
    print(angle)     // 0.0, 0.25, 0.5, 0.75, 1.0
}
```

Steps like `0.25` are exactly representable in binary. Steps like `0.1` are not, and that's where `stride` quietly protects you. Compare it with a hand-written loop that keeps adding the step:

```swift
let viaStride = Array(stride(from: 0.0, to: 1.0, by: 0.1))

var accumulator = 0.0
var viaAdding: [Double] = []
while accumulator < 1.0 {
    viaAdding.append(accumulator)
    accumulator += 0.1
}

print(viaStride.count, viaAdding.count)      // 10 11
print(viaStride.last!, viaAdding.last!)      // 0.9 0.9999999999999999
```

Repeated addition accumulates rounding error: after ten additions, the value is `0.9999999999999999`, which is still less than `1.0`, so the loop runs an extra time. `stride` instead computes each element as `start + n * step`, so errors don't pile up and you get the ten values you meant.

It can't make `0.1` exact, though. The comparison with the end value can still land on either side:

```swift
let tenths = Array(stride(from: 0.0, through: 0.3, by: 0.1))
print(tenths.count)   // 3, not 4: 3 × 0.1 is 0.30000000000000004, just above 0.3
```

When you need an exact number of steps, stride over integers and convert:

```swift
let exactTenths = (0...10).map { Double($0) / 10 }   // always 11 values, 0.0 to 1.0
```

## Strides are lazy sequences

`stride(from:to:by:)` returns a `StrideTo<T>`, and `stride(from:through:by:)` returns a `StrideThrough<T>`. Both are sequences that **compute values on demand**; they don't allocate an array. Even an enormous stride costs nothing until you iterate it:

```swift
let everyThousand = stride(from: 0, to: 1_000_000_000, by: 1_000)
print(everyThousand.first(where: { $0 > 5_500 }) ?? 0)    // 6000, after 7 steps
```

All the usual sequence tools work: `map`, `filter`, `reduce`, `contains`, `first(where:)`, `zip`, and so on.

```swift
let sumOfOdds = stride(from: 1, through: 99, by: 2).reduce(0, +)
print(sumOfOdds)   // 2500
```

## Practical examples

### Every n-th element

```swift
let frames = Array(0..<20)
let keyFrames = stride(from: 0, to: frames.count, by: 5).map { frames[$0] }
print(keyFrames)   // [0, 5, 10, 15]
```

### Chunking an array

```swift
let items = Array(1...10)
let chunks = stride(from: 0, to: items.count, by: 3).map {
    Array(items[$0..<min($0 + 3, items.count)])
}
print(chunks)   // [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]
```

### Pairs of neighbors

```swift
let readings = [3, 8, 4, 9, 2, 7]
let pairs = stride(from: 0, to: readings.count - 1, by: 2).map { (readings[$0], readings[$0 + 1]) }
print(pairs)   // [(3, 8), (4, 9), (2, 7)]
```

### Grid coordinates

```swift
let spacing = 50
var points: [(Int, Int)] = []
for x in stride(from: 0, through: 100, by: spacing) {
    for y in stride(from: 0, through: 50, by: spacing) {
        points.append((x, y))
    }
}
print(points.count)   // 6: x in 0, 50, 100 and y in 0, 50
```

## How it works: the `Strideable` protocol

`stride` works with any type conforming to `Strideable`, which needs two things:

- a `Stride` type describing a distance (for `Int`, it's `Int`; for `Double`, it's `Double`),
- `distance(to:)` and `advanced(by:)` to measure and move.

You can make your own types strideable:

```swift
struct Page: Strideable {
    let number: Int

    func distance(to other: Page) -> Int {
        other.number - number
    }

    func advanced(by n: Int) -> Page {
        Page(number: number + n)
    }
}

for page in stride(from: Page(number: 1), through: Page(number: 7), by: 3) {
    print("Page \(page.number)")     // Page 1, Page 4, Page 7
}
```

There's a bonus: when a type's `Stride` is an integer type, ranges of that type become **countable**, so you can iterate them and use `map` directly:

```swift
let firstPages = Page(number: 1)...Page(number: 3)
print(firstPages.map { $0.number })   // [1, 2, 3]
```

`Strideable` also gives you `<` and `==` through its `Comparable` conformance, based on `distance(to:)`.

## Beyond arithmetic steps

`stride` always adds the same amount. For other progressions, like doubling or following a chain of objects, use `sequence(first:next:)`, which is just as lazy:

```swift
let powersOfThree = Array(sequence(first: 1, next: { $0 < 100 ? $0 * 3 : nil }))
print(powersOfThree)   // [1, 3, 9, 27, 81, 243]
```

## Pitfalls

- **A step of zero** is a programming error and traps at runtime.
- **A step with the wrong sign** gives an empty sequence, not an error: `stride(from: 0, to: 10, by: -1)` produces nothing. If a stride mysteriously does nothing, check the sign.
- **Indices:** when striding over array indices, use `to: array.count` (exclusive) to stay in bounds, and remember that a neighbor-pair stride needs `count - 1`.
- **Floating-point ends:** don't rely on `through` hitting a non-representable end value.

## Interview questions

**What's the difference between `stride(from:to:by:)` and `stride(from:through:by:)`?**
`to` never includes the end value, like `..<`; `through` includes it if a step lands on it exactly, like `...`.

**Why is `stride` better than adding a `Double` step in a loop?**
`stride` computes each element as `start + n * step`, so rounding errors don't accumulate across iterations.

**Does `stride` create an array?**
No. It returns a lazy sequence (`StrideTo` or `StrideThrough`) that computes values as you iterate.

**How do you make your own type work with `stride`?**
Conform to `Strideable` by implementing `distance(to:)` and `advanced(by:)`.

## Summary

- `stride(from:to:by:)` excludes the end; `stride(from:through:by:)` includes it when a step lands on it.
- Negative steps count down; a zero step traps; a wrong-sign step yields nothing.
- Floating-point strides compute `start + n * step`, avoiding accumulated error, but can't make non-representable steps exact.
- Strides are lazy sequences, cheap even for huge ranges.
- Any `Strideable` type works with `stride`, and integer-strided types get countable ranges too.
