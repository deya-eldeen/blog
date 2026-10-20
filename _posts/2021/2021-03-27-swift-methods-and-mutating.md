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
thumbnail: "images/covers/swift_methods_and_mutating_thumbnail.webp"
thumbnail_ready: true
---

Methods are functions that belong to a type. In classes they behave much like in any object-oriented language. Structs and enums add a twist: a method that changes the instance must be marked `mutating`. That one keyword tells you, the compiler, and every reader which operations can change a value, and understanding how it works under the hood explains a whole family of compiler errors.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_methods_and_mutating_thumbnail.webp"
 alt_text="An adjustment tool changing a value block beside a read-only inspection lens"
 caption="Methods and mutating in Swift"
 width="640"
 height="400"
%}

## Instance methods and `self`

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

Inside a method, `self` refers to the current instance, and you usually don't have to write it: `count` means `self.count`. You need `self.` explicitly when a parameter shadows a property, and in escaping closures inside classes, where Swift wants you to notice that you're capturing `self`.

## Why `mutating` exists

Structs and enums are **value types**. By default, their methods treat `self` as a constant, as if it were a `let`. To change a property, a method must declare that it mutates:

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

Because a mutating method changes the value, you can only call it on something mutable:

```swift
var game = Score()
game.add(10)          // fine

let finalScore = Score()
finalScore.add(10)    // ❌ cannot use mutating member on immutable value: 'finalScore' is a 'let' constant
```

### How it works: `self` is `inout`

A mutating method receives `self` as an **`inout` parameter**. Conceptually, `game.add(10)` is the same as calling a free function `add(&game, 10)`: the value is passed in, modified, and written back to the variable when the method returns. That model explains everything else about `mutating`:

- It needs a variable to write back to, so it can't be called on a `let`.
- It can change any property, or replace `self` entirely.
- It works anywhere you could pass `&something`: through optional chaining, on array elements, and on struct properties of class instances.

```swift
var maybeScore: Score? = Score()
maybeScore?.add(5)                     // mutates the wrapped value in place
print(maybeScore?.points ?? -1)        // 5

final class Match {
    var score = Score()
}

let match = Match()                    // a `let` reference...
match.score.add(3)                     // ...but `score` is a var property of the object
print(match.score.points)              // 3

var scores = [Score(), Score()]
scores[1].add(7)                       // mutates the element inside the array
```

The second example is worth a closer look: `match` is a `let`, yet we called a mutating method on its property. That's fine, because `let` only fixes the reference to the object; `score` is a `var` inside it, so there's a variable to write back to.

## Assigning to `self`

A mutating method can replace `self` entirely, which is especially natural for enums:

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

The same works in structs, for example a `reset()` that writes `self = Settings()` to restore every default at once.

## Classes don't need `mutating`

Class instances are references. Modifying an object doesn't change the reference stored in your variable, so there's nothing to write back:

```swift
final class Playlist {
    var songs: [String] = []

    func add(_ song: String) {
        songs.append(song)    // no `mutating`, and it works on a `let` reference
    }
}

let favorites = Playlist()
favorites.add("Clair de Lune")
```

Convenient, but it also means a class method can change shared state without any marker at the call site. The `mutating` keyword is one of the reasons value types are easier to reason about: you can see, in the type's interface and at every call site, which operations change a value.

## Mutating vs. non-mutating pairs

The standard library often provides two versions of an operation: one that mutates in place and one that returns a new value. The naming convention tells you which is which:

| Mutating (imperative verb) | Non-mutating (`-ed`, `-ing`, or noun) |
|---|---|
| `array.sort()` | `array.sorted()` |
| `array.reverse()` | `array.reversed()` |
| `array.append(x)` | `array + [x]` |
| `set.formUnion(other)` | `set.union(other)` |
| `x.negate()` | `-x` |

Follow the same convention in your own types, and implement one in terms of the other:

```swift
struct Vector {
    var x: Double
    var y: Double

    var length: Double {
        (x * x + y * y).squareRoot()
    }

    mutating func normalize() {
        let currentLength = length
        x /= currentLength
        y /= currentLength
    }

    func normalized() -> Vector {
        var copy = self
        copy.normalize()
        return copy
    }
}

let direction = Vector(x: 3, y: 4).normalized()
print(direction.x, direction.y)   // 0.6 0.8
```

The mutating version is usually the efficient one: it can work in place, and for copy-on-write storage like arrays, it avoids allocating a new buffer when the value isn't shared.

## Type methods

Methods marked `static` belong to the type, not to an instance. They're ideal for factory methods and helpers that don't need instance state:

```swift
struct Celsius {
    var degrees: Double

    static func fromFahrenheit(_ value: Double) -> Celsius {
        Celsius(degrees: (value - 32) * 5 / 9)
    }
}

let boiling = Celsius.fromFahrenheit(212)
```

In a class, `class func` works like `static func` but can be overridden by subclasses. `static func` in a class is equivalent to `final class func`.

## Methods are values too

You can refer to a method without calling it. `Type.method` gives you a function that takes an instance and returns the method bound to it:

```swift
let describeFunction = Counter.describe       // (Counter) -> () -> String
print(describeFunction(Counter(count: 4))())  // Count is 4

let lengths = [Vector(x: 3, y: 4), Vector(x: 6, y: 8)].map { $0.length }
```

Mutating methods are the exception. Because they need `inout` access to a variable, you can't turn them into a standalone function value:

```swift
let addFunction = Score.add   // ❌ cannot reference 'mutating' method as function value
```

## Protocols and `mutating`

If a protocol requirement might be implemented by a value type that changes itself, mark the requirement `mutating`. Classes can still satisfy it without the keyword:

```swift
protocol Resettable {
    mutating func reset()
}

struct Stopwatch: Resettable {
    var elapsed = 0.0
    mutating func reset() { elapsed = 0 }
}

final class Session: Resettable {
    var startedAt: Double? = 1
    func reset() { startedAt = nil }       // no `mutating` needed in a class
}
```

If you forget `mutating` in the protocol, structs can't implement the requirement in a way that changes their state.

## Advanced: `nonmutating set`

Occasionally a struct is a thin handle around a reference, for example a wrapper around a class or a `UserDefaults` key. Setting one of its computed properties doesn't really change the struct, so you can mark the setter `nonmutating` and allow it on `let` values:

```swift
final class Storage {
    var value = 0
}

struct Handle {
    let storage = Storage()

    var value: Int {
        get { storage.value }
        nonmutating set { storage.value = newValue }
    }
}

let handle = Handle()
handle.value = 9          // allowed even though `handle` is a let
print(handle.value)       // 9
```

Use this rarely: it's honest only when the struct is truly a reference-like handle.

## Common pitfalls

- **"Cannot use mutating member on immutable value"** usually means you're calling a mutating method on a `let`, on a function parameter (parameters are constants), or on the result of a function call (a temporary). Copy it into a `var`, or use an `inout` parameter.
- **Mutating a copy by accident.** `var item = items[0]; item.update()` changes the copy, not the array element. Use `items[0].update()`.
- **Mutating inside a `for-in` loop.** `for item in items { item.update() }` doesn't compile, because `item` is a constant copy. Loop over indices: `for i in items.indices { items[i].update() }`.
- **Missing `mutating` in a protocol**, which prevents value types from conforming properly.

## Interview questions

**What does `mutating` actually do?**
It makes `self` an `inout` parameter of the method, so the method can modify properties or replace `self`, and the result is written back to the variable it was called on.

**Why don't class methods need `mutating`?**
Because changing a class instance's properties doesn't change the reference held by the variable; there's nothing to write back.

**Why can you call a mutating method on a struct property of a `let` class instance?**
The `let` fixes the reference, but the object's `var` property is still mutable storage, so the write-back has somewhere to go.

**How do you name a mutating method and its non-mutating counterpart?**
An imperative verb for the mutating one (`sort`, `reverse`), and the `-ed`/`-ing` form or a noun for the one returning a new value (`sorted`, `reversed`).

## Summary

- Struct and enum methods that change `self` must be `mutating`; they receive `self` as `inout`.
- Mutating methods need a variable: they can't be called on `let` values, parameters, or temporaries.
- They can replace `self` entirely, and work through optional chaining, array subscripts, and class properties.
- Classes don't need `mutating`; protocols need it on requirements that value types may implement by mutation.
- Name mutating methods with verbs and non-mutating counterparts with `-ed`/`-ing` forms.
