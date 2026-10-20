---
layout: post
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
---

Swift has no C-style `for (int i = 0; i < 10; i += 2)` loop. Ranges like `0..<10` handle steps of one, and for everything else there's `stride`: counting by twos, counting down, stepping through decimals, or walking through every third element of an array.

<!--more-->

## `stride(from:to:by:)` and `stride(from:through:by:)`

There are two forms, and the difference is whether the end value is included:

```swift
for i in stride(from: 0, to: 10, by: 2) {
    print(i)          // 0, 2, 4, 6, 8: stops BEFORE 10
}

for i in stride(from: 0, through: 10, by: 2) {
    print(i)          // 0, 2, 4, 6, 8, 10: includes 10 if it lands on it
}
```

A way to remember it: `to` works like `..<`, and `through` works like `...`.

`through` only includes the end value if the steps land on it exactly:

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
```

For a simple countdown by one, `reversed()` on a range reads just as well:

```swift
for seconds in (1...3).reversed() {
    print(seconds)
}
```

## Floating-point strides

`stride` works with any type that conforms to `Strideable`, including `Double`:

```swift
for angle in stride(from: 0.0, through: 1.0, by: 0.25) {
    print(angle)     // 0.0, 0.25, 0.5, 0.75, 1.0
}
```

With a step that can't be represented exactly in binary, like `0.1`, `through` can miss the end value because of rounding:

```swift
let tenths = Array(stride(from: 0.0, through: 0.3, by: 0.1))
print(tenths.count)   // 3, not 4: the last step lands just above 0.3, so it's dropped
```

Swift computes each value as `start + n * step` rather than adding the step repeatedly, which keeps errors from piling up, but the comparison with the end value can still go either way. When you need an exact number of steps, stride over integers and convert:

```swift
let exactTenths = (0...10).map { Double($0) / 10 }   // always 11 values
```

## Strides are lazy sequences

`stride` returns a `StrideTo` or `StrideThrough` value, a sequence that produces values on demand. It doesn't allocate an array, so even a huge stride is cheap:

```swift
let everyThousand = stride(from: 0, to: 1_000_000_000, by: 1_000)
print(everyThousand.first(where: { $0 > 5_500 }) ?? 0)    // 6000
```

All the usual sequence tools work: `map`, `filter`, `reduce`, `contains`, and so on.

```swift
let sumOfOdds = stride(from: 1, through: 99, by: 2).reduce(0, +)   // 2500
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

### Grid coordinates

```swift
let spacing = 50
for x in stride(from: 0, through: 200, by: spacing) {
    for y in stride(from: 0, through: 100, by: spacing) {
        print("Point at (\(x), \(y))")
    }
}
```

## Pitfalls

- **A step of zero** is a programming error and traps at runtime.
- **The wrong sign** gives an empty sequence, not an error: `stride(from: 0, to: 10, by: -1)` simply produces nothing.
- **Indices:** when striding over array indices, use `to: array.count` (exclusive) to stay in bounds.

## Summary

- `stride(from:to:by:)` excludes the end; `stride(from:through:by:)` includes it if a step lands on it.
- Negative steps count down; floating-point strides work but can be affected by rounding.
- Strides are lazy sequences, so they're cheap even for huge ranges.
- Great for every n-th element, chunking, and grids; a zero step traps, a wrong-sign step is empty.
