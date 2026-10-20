---
layout: post
title: "Methods and mutating in Swift"
date: "2021-03-27"
last_modified_at: "2021-03-27"
permalink: /swift-methods-and-mutating/
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
  - "Value Types"
---

Methods are functions that belong to a type. In classes they work much like in any object-oriented language, but structs and enums add a twist: a method that changes the instance must be marked `mutating`. That keyword is small, and it's one of the clearest signals in Swift about what a piece of code is allowed to do.

<!--more-->

## Instance methods

```swift
struct Counter {
    var count = 0

    func describe() -> String {
        "Count is \(count)"
    }
}

let counter = Counter()
print(counter.describe())
```

Inside a method, `self` refers to the instance. You only need to write `self.` when a parameter has the same name as a property.

## Why `mutating` exists

Structs and enums are **value types**. By default, their methods treat `self` as immutable, like a `let`. If a method needs to change a property, you must say so:

```swift
struct Score {
    var points = 0

    func addBroken(_ value: Int) {
        points += value          // ❌ left side of mutating operator isn't mutable: 'self' is immutable
    }

    mutating func add(_ value: Int) {
        points += value
    }
}
```

A `mutating` method gets an `inout` copy of `self`. When it returns, the new value is written back to the variable you called it on. That's why you can only call mutating methods on variables:

```swift
var game = Score()
game.add(10)          // fine

let finalScore = Score()
finalScore.add(10)    // ❌ cannot use mutating member on immutable value
```

The keyword makes mutation visible in the type's interface: you can tell which methods change the value just by reading the declarations.

## Assigning to `self`

A mutating method can even replace `self` entirely, which is especially useful for enums:

```swift
enum TrafficLight {
    case red, yellow, green

    mutating func next() {
        switch self {
        case .red: self = .green
        case .green: self = .yellow
        case .yellow: self = .red
        }
    }
}

var light = TrafficLight.red
light.next()   // .green
```

## Classes don't need `mutating`

Class instances are references, and the reference doesn't change when you modify the object, so there's nothing to write back:

```swift
final class Playlist {
    var songs: [String] = []

    func add(_ song: String) {
        songs.append(song)    // no `mutating` needed
    }
}

let favorites = Playlist()    // even a `let` works
favorites.add("Clair de Lune")
```

This is convenient, but it also means a class method can change shared state without any marker at the call site. That's one reason value types are easier to reason about.

## Mutating vs. non-mutating pairs

The standard library often offers two versions of an operation: one that mutates in place and one that returns a new value. The naming convention tells you which is which:

| Mutating (verb) | Non-mutating (noun or `-ed`/`-ing`) |
|---|---|
| `array.sort()` | `array.sorted()` |
| `array.reverse()` | `array.reversed()` |
| `set.formUnion(other)` | `set.union(other)` |
| `string.append("!")` | `string + "!"` |

Follow the same convention in your own types:

```swift
struct Vector {
    var x: Double
    var y: Double

    mutating func normalize() {
        let length = (x * x + y * y).squareRoot()
        x /= length
        y /= length
    }

    func normalized() -> Vector {
        var copy = self
        copy.normalize()
        return copy
    }
}
```

## Type methods

Methods marked `static` belong to the type itself:

```swift
struct Temperature {
    var celsius: Double

    static func fromFahrenheit(_ value: Double) -> Temperature {
        Temperature(celsius: (value - 32) * 5 / 9)
    }
}

let boiling = Temperature.fromFahrenheit(212)
```

In classes, `class func` works like `static func` but can be overridden by subclasses.

## Protocols and `mutating`

If a protocol method might be implemented by a struct that changes itself, mark the requirement `mutating`. Classes can still implement it without the keyword:

```swift
protocol Resettable {
    mutating func reset()
}

struct Timer3: Resettable {
    var elapsed = 0.0
    mutating func reset() { elapsed = 0 }
}
```

## Summary

- Methods are functions attached to a type; `self` is the current instance.
- Struct and enum methods that change `self` must be `mutating`, and can only be called on variables.
- Mutating methods can assign a whole new value to `self`.
- Name mutating methods with verbs (`sort`) and non-mutating ones with `-ed`/`-ing` forms (`sorted`).
