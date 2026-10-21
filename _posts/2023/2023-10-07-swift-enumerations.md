---
layout: post
hidden: true
title: "Enumerations in Swift"
date: "2023-10-07"
last_modified_at: "2023-10-07"
permalink: /swift-enumerations/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Enums"
  - "Basics"
thumbnail: "images/covers/swift_enumerations_thumbnail.webp"
thumbnail_ready: true
---

In many languages, an enum is just a list of named integers. In Swift, enums are full types: they can carry data, have methods and computed properties, conform to protocols, be generic, and even refer to themselves. Combined with exhaustive `switch`, they're the best tool Swift gives you for modeling a world where only certain states are possible, and for making the compiler point at every piece of code that needs to change when that world grows.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_enumerations_thumbnail.webp"
 alt_text="One selected enum case with associated data and two alternative cases"
 caption="Enumerations in Swift"
 width="640"
 height="400"
%}

## The basics

```swift
enum CompassPoint {
    case north
    case south
    case east
    case west
}

var direction = CompassPoint.north
direction = .west       // the type is known, so the leading dot is enough
```

Each case is a value of the enum's type, not an integer in disguise. A `CompassPoint` can only ever be one of those four, and it can never be "5" or `nil` unless you make it optional.

## Exhaustive `switch`

Because the compiler knows every case, a `switch` over an enum must handle all of them, and since Swift 5.9, it can produce a value directly:

```swift
func describe(_ point: CompassPoint) -> String {
    switch point {
    case .north: "Up"
    case .south: "Down"
    case .east, .west: "Sideways"
    }
}

print(describe(.west))   // Sideways
```

No `default` is needed, and that's a feature: when you add a new case later, every `switch` that doesn't handle it becomes a **compile error**, pointing at exactly the code that needs a decision. A `default` would silently swallow the new case.

## Raw values

Enums can be backed by raw values of type `String`, `Character`, or any integer or floating-point type. Integer raw values count up automatically, and `String` raw values default to the case name:

```swift
enum Planet: Int {
    case mercury = 1, venus, earth, mars   // venus = 2, earth = 3, mars = 4
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case delete                             // raw value "delete"
}

print(Planet.earth.rawValue)          // 3
print(HTTPMethod.post.rawValue)       // POST
print(HTTPMethod.delete.rawValue)     // delete

let parsed = HTTPMethod(rawValue: "GET")   // HTTPMethod? -> .get
let unknown = Planet(rawValue: 42)         // nil
print(parsed == .get, unknown == nil)      // true true
```

The failable `init?(rawValue:)` is perfect for turning strings or numbers from outside your app into safe, typed values, and `Codable` uses raw values automatically.

## Associated values

This is where Swift enums leave most other languages behind. Each case can carry its own data, of different types:

```swift
enum Barcode {
    case upc(Int, Int, Int, Int)
    case qrCode(String)
}

var product = Barcode.upc(8, 85909, 51226, 3)
product = .qrCode("ABCDEFGHIJKLMNOP")

switch product {
case .upc(let system, let manufacturer, let item, let check):
    print("UPC: \(system)-\(manufacturer)-\(item)-\(check)")
case .qrCode(let code):
    print("QR: \(code)")
}
```

Associated values can have labels, which document their meaning: `case rectangle(width: Double, height: Double)`.

### Making invalid states unrepresentable

Associated values let you model state precisely. Compare a struct where fields have to be kept in sync by convention:

```swift
struct ScreenFlags {
    var isLoading: Bool
    var articles: [String]?
    var error: Error?
    // Is `isLoading == true && error != nil` valid? Nothing stops it.
}
```

with an enum where each state carries exactly its own data:

```swift
enum Screen {
    case loading
    case loaded(articles: [String])
    case failed(Error)
}
```

The enum version simply can't be in a contradictory state. When the UI switches over it, the compiler makes sure every state is rendered.

## Methods, computed properties, and `mutating`

```swift
enum Weekday: Int, CaseIterable {
    case monday = 1, tuesday, wednesday, thursday, friday, saturday, sunday

    var isWeekend: Bool {
        self == .saturday || self == .sunday
    }

    func next() -> Weekday {
        Weekday(rawValue: rawValue % 7 + 1)!
    }
}

print(Weekday.friday.isWeekend)        // false
print(Weekday.sunday.next())           // monday
```

Methods that change the value must be `mutating`, and they can assign a whole new case to `self`:

```swift
enum Toggle {
    case on, off

    mutating func flip() {
        self = (self == .on) ? .off : .on
    }
}

var light = Toggle.off
light.flip()
print(light)    // on
```

Enums can't have stored properties: an enum value *is* one of its cases. Data lives in associated values, and derived information in computed properties.

## `CaseIterable`

Conforming to `CaseIterable` gives you an `allCases` collection for free, which is handy for pickers, settings screens, and tests:

```swift
print(Weekday.allCases.count)                        // 7
print(Weekday.allCases.filter(\.isWeekend).map { "\($0)" })   // ["saturday", "sunday"]
```

It's synthesized for enums without associated values.

## Synthesized conformances

Enums get several conformances for free:

- **`Equatable` and `Hashable`**, when all associated values are `Equatable`/`Hashable` (or there are none).
- **`Comparable`**, for enums without raw values, ordered by declaration.
- **`Codable`**, including, since Swift 5.5, enums with associated values:

```swift
enum Shape: Codable {
    case circle(radius: Double)
    case rectangle(width: Double, height: Double)
}

let shapesJSON = try JSONEncoder().encode([Shape.circle(radius: 2), .rectangle(width: 1, height: 3)])
print(String(decoding: shapesJSON, as: UTF8.self))
// [{"circle":{"radius":2}},{"rectangle":{"width":1,"height":3}}]  (key order may vary)
```

Each case becomes an object keyed by the case name, holding its labeled associated values.

## Recursive enums

A case can contain the enum itself if you mark it (or the whole enum) `indirect`, which stores that case's payload in a heap-allocated box. That's a natural way to model trees and expressions:

```swift
indirect enum Expression {
    case number(Int)
    case add(Expression, Expression)
    case multiply(Expression, Expression)

    func evaluate() -> Int {
        switch self {
        case .number(let value): value
        case .add(let left, let right): left.evaluate() + right.evaluate()
        case .multiply(let left, let right): left.evaluate() * right.evaluate()
        }
    }
}

// (2 + 3) * 4
let expression = Expression.multiply(.add(.number(2), .number(3)), .number(4))
print(expression.evaluate())   // 20
```

Without `indirect`, the enum would need to contain itself inline, which would make its size infinite.

## Generic enums: `Optional` and `Result`

Two of the most important types in Swift are generic enums:

```swift
enum MyOptional<Wrapped> {
    case none
    case some(Wrapped)
}

enum MyResult<Success, Failure: Error> {
    case success(Success)
    case failure(Failure)
}
```

Everything you know about optionals, from `if let` to `switch` with `.some` and `.none`, is enum pattern matching underneath, plus some syntax sugar like `?` and `nil`.

## Under the hood: enum layout

Enums are remarkably compact. Let's measure a few:

```swift
final class Node {}

enum Payload {
    case number(Int)
    case flag(Bool)
    case none
}

print(MemoryLayout<CompassPoint>.size)     // 1: four cases fit in one byte
print(MemoryLayout<Int?>.size)             // 9: an Int plus a tag byte
print(MemoryLayout<Node?>.size)            // 8: nil uses the invalid null pointer, no extra byte
print(MemoryLayout<Bool?>.size)            // 1: nil uses a spare bit pattern of Bool's byte
print(MemoryLayout<Payload>.size)          // 9: the largest payload, plus a tag
```

- A **simple enum** stores just a small **tag** identifying the case.
- An enum with **payloads** is as large as its largest payload, plus a tag when needed.
- The compiler reuses **spare bits** and **extra inhabitants** (bit patterns a type never uses) to store the tag for free. A class reference can never be null, so `Optional<Node>` uses the null pointer for `nil` and stays 8 bytes. `Bool` only uses 2 of its byte's 256 patterns, so `Bool?` still fits in one byte.

That's why optionals of class references are free, and why enums are such an efficient way to model state.

## Enums as namespaces

An enum with no cases can't be instantiated, which makes it a clean namespace for constants and helpers:

```swift
enum Constants {
    static let maxRetries = 3
    static let baseURL = "https://api.example.com"
}

print(Constants.maxRetries)
```

## Enums from other modules: `@unknown default`

Enums from Apple's frameworks may gain cases in future OS versions. Swift asks you to handle that possibility with `@unknown default`, which still warns about **known** cases you forgot, while handling **future** ones at runtime. The full story of why is in [ABI Stability in Swift](/swift-abi-stability/).

## Common pitfalls

- **Using `default` for your own enums**, which hides newly added cases.
- **Stringly-typed state** (`status == "loading"`) instead of an enum: typos compile, and the compiler can't check exhaustiveness.
- **Bool flags and optionals that must be kept consistent**, where an enum with associated values would make bad states impossible.
- **Raw values when you don't need them.** They're for interoperability (JSON, databases, user defaults), not a requirement.
- **Comparing cases with associated values with `==`.** Use `if case .loaded = state` to check just the case.

## Interview questions

**What's the difference between raw values and associated values?**
Raw values are fixed constants, one per case, all of the same type. Associated values are data attached to a particular instance of a case, and can differ in type per case.

**Why is `Optional<SomeClass>` the same size as the class reference?**
`nil` is stored using the null pointer, a bit pattern a valid reference never has, so no extra tag byte is needed.

**What does `indirect` do?**
It stores the case's associated values in a heap box, allowing an enum to contain itself recursively.

**Why avoid `default` in a `switch` over your own enum?**
So adding a case causes compile errors at every switch that must handle it, instead of silently running the default.

## Summary

- Enums define a closed set of cases; `switch` must handle all of them, and can produce a value since Swift 5.9.
- Raw values map cases to constants with a failable initializer; associated values attach data per case.
- Enums can have methods, computed properties, `mutating` methods, synthesized conformances (including `Codable`), and `indirect` recursion.
- They're compact: a small tag, the largest payload, and spare bits reused wherever possible.
- Use them to make invalid states unrepresentable.
