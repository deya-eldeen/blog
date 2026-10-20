---
layout: post
title: "Opaque and Boxed Types in Swift: some vs. any"
date: "2022-10-19"
last_modified_at: "2022-10-19"
permalink: /swift-opaque-and-boxed-types/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Generics"
  - "Protocols"
---

`some View` is in every SwiftUI file, and `any Error` is in most error-handling code. Both keywords put a protocol where a type is expected, but they mean very different things. `some` hides one specific type from the reader while the compiler still knows it. `any` puts a value of *whatever* conforming type in a box. Picking the right one affects flexibility, performance, and which protocols you can use at all.

<!--more-->

## A shared example

```swift
protocol Shape {
    func draw() -> String
}

struct Square: Shape {
    var size: Int
    func draw() -> String { "■ size \(size)" }
}

struct Triangle: Shape {
    var size: Int
    func draw() -> String { "▲ size \(size)" }
}
```

## `some`: opaque types

An opaque type means "a specific type that conforms to this protocol; I won't tell you which one".

```swift
func makeLogo() -> some Shape {
    Square(size: 3)
}

let logo = makeLogo()
print(logo.draw())
```

The caller only knows that `logo` is *some* `Shape`. The compiler knows it's a `Square`, and treats it exactly like one: no boxing, no runtime lookup.

The catch: it must be **one** type. Every return path has to produce the same concrete type:

```swift
func makeShape(pointy: Bool) -> some Shape {
    if pointy {
        return Triangle(size: 2)
    }
    return Square(size: 2)      // ❌ ...the return statements in its body do not have matching underlying types
}
```

### Why use `some`?

It lets you change the implementation without changing the API, and it hides complicated types. SwiftUI is the classic case: a view's `body` might really be a deeply nested type like `VStack<TupleView<(Text, ModifiedContent<Image, …>)>>`. Writing `some View` keeps that private, while SwiftUI still sees the exact type to diff efficiently.

### `some` in parameters

In parameter position, `some` is shorthand for a generic parameter:

```swift
func render(_ shape: some Shape) -> String {
    shape.draw()
}

// Same as:
func renderGeneric<S: Shape>(_ shape: S) -> String {
    shape.draw()
}
```

## `any`: existential (boxed) types

An existential type is a box that can hold a value of **any** conforming type, and the type inside can change:

```swift
var current: any Shape = Square(size: 1)
current = Triangle(size: 1)          // fine: the box now holds a Triangle

let shapes: [any Shape] = [Square(size: 1), Triangle(size: 2), Square(size: 3)]
for shape in shapes {
    print(shape.draw())
}
```

That's the flexibility you need for heterogeneous collections, or for storing "some delegate" in a property.

### What the box costs

To make this work, Swift wraps the value in an **existential container**. Small values are stored inline in the box; larger ones are allocated on the heap. Method calls go through a lookup table at runtime. It's usually fast enough, but in hot code `some` or generics let the compiler specialize and inline instead.

Since Swift 5.6, writing `any` is the explicit way to spell an existential. The keyword makes the cost visible.

## Protocols with associated types

`some` and `any` behave differently with protocols that have associated types or `Self` requirements, like `Equatable` or `Collection`. `some` always works, because the compiler knows the concrete type:

```swift
func makeNumbers() -> some Collection {
    [1, 2, 3]
}
```

With `any`, you can store the value, but you lose information about the associated type:

```swift
let anyCollection: any Collection = [1, 2, 3]
print(anyCollection.count)       // fine
```

**Primary associated types** (Swift 5.7) let you constrain it. Many standard protocols declare one, such as `Collection<Element>`:

```swift
func evens(from numbers: some Collection<Int>) -> [Int] {
    numbers.filter { $0.isMultiple(of: 2) }
}

let boxed: any Collection<Int> = Set([1, 2, 3, 4])
print(evens(from: [1, 2, 3, 4]))
print(boxed.count)
```

## Opening an existential

You can pass an `any Shape` to a function that takes `some Shape`. Swift "opens" the box and calls the generic function with the concrete type inside (Swift 5.7+):

```swift
let mystery: any Shape = Triangle(size: 5)
print(render(mystery))        // works: the existential is opened automatically
```

## Choosing between them

| Use `some` when… | Use `any` when… |
|---|---|
| a function always returns the same concrete type | values of different types must live in the same variable or array |
| you want the compiler to optimize with the real type | the type must change at runtime, like a swappable strategy or a delegate |
| you're writing SwiftUI views | you're storing errors, as in `any Error` |
| the protocol has associated types you need to use | flexibility matters more than raw performance |

A good default: **reach for `some` first**, and switch to `any` when you genuinely need to mix types.

## Summary

- `some P` is an opaque type: one fixed concrete type, hidden from the caller but known to the compiler.
- `any P` is an existential: a box that can hold any conforming value, with some runtime cost.
- `some` in parameters is shorthand for generics; existentials can be opened into them.
- Primary associated types allow constraints like `some Collection<Int>` and `any Collection<Int>`.
