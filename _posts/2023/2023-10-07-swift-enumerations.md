---
layout: post
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
---

In many languages, an enum is just a list of named integers. In Swift, enums are full-blown types: they can carry data, have methods and computed properties, conform to protocols, and even refer to themselves. They're one of the best tools Swift gives you for modeling a world where only certain states are possible.

<!--more-->

## The basics

```swift
enum CompassPoint {
    case north
    case south
    case east
    case west
}

var direction = CompassPoint.north
direction = .west       // the type is known, so the dot syntax is enough
```

Cases are values of the enum's type, not integers in disguise. A `CompassPoint` can only ever be one of those four.

## Exhaustive `switch`

The compiler knows every case, so a `switch` over an enum must handle all of them:

```swift
func describe(_ point: CompassPoint) -> String {
    switch point {
    case .north: "Up"
    case .south: "Down"
    case .east, .west: "Sideways"
    }
}
```

No `default` needed, and that's a feature: if you add a new case later, every `switch` that forgot it becomes a compile error instead of a silent bug.

## Raw values

Enums can be backed by raw values of type `String`, `Character`, or any integer or floating-point type:

```swift
enum Planet: Int {
    case mercury = 1, venus, earth, mars   // venus = 2, earth = 3, ...
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case delete                             // raw value "delete"
}

print(Planet.earth.rawValue)          // 3
print(HTTPMethod.post.rawValue)       // "POST"

let parsed = HTTPMethod(rawValue: "GET")   // HTTPMethod? -> .get
let unknown = Planet(rawValue: 42)         // nil
```

The failable `init?(rawValue:)` is perfect for decoding strings or numbers from outside your app.

## Associated values

This is where Swift enums leave other languages behind. Each case can carry its own data, of different types:

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

Associated values make **invalid states unrepresentable**. Compare a struct with optional fields, where `isLoading == true` and `error != nil` could accidentally both be true, with an enum where each state carries exactly its own data:

```swift
enum Screen {
    case loading
    case loaded(articles: [String])
    case failed(Error)
}
```

## Methods and computed properties

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

Methods that change `self` must be marked `mutating`:

```swift
enum Toggle {
    case on, off

    mutating func flip() {
        self = (self == .on) ? .off : .on
    }
}

var light = Toggle.off
light.flip()     // .on
```

## `CaseIterable`

Conforming to `CaseIterable` gives you an `allCases` collection for free, useful for pickers and tests:

```swift
for day in Weekday.allCases {
    print(day)
}
print(Weekday.allCases.count)    // 7
```

## Recursive enums

A case can contain the enum itself if you mark it `indirect`, which is a natural way to model trees and expressions:

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

## Optionals are enums

The most famous enum in Swift is one you use constantly. `Optional` is defined (roughly) as:

```swift
enum MyOptional<Wrapped> {
    case none
    case some(Wrapped)
}
```

Everything you know about optionals, from `if let` to `switch` with `.some` and `.none`, is enum pattern matching underneath.

## Summary

- Enums define a closed set of cases; `switch` must handle all of them.
- Raw values map cases to strings or numbers, with a failable initializer for parsing.
- Associated values attach data to each case and model states precisely.
- Enums can have methods, computed properties, `mutating` methods, protocol conformances, and `indirect` recursion.
