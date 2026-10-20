---
layout: post
title: "Initialization in Swift"
date: "2021-04-20"
last_modified_at: "2021-04-20"
permalink: /swift-initialization/
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
  - "Classes"
---

Swift has one non-negotiable rule about initialization: **every stored property must have a value before an instance is used.** There's no "uninitialized" memory to stumble into later. Everything else, from memberwise initializers to the two-phase dance in class hierarchies, exists to enforce that rule while keeping initialization flexible.

<!--more-->

## Default values and simple initializers

The easiest way to satisfy the rule is to give properties default values:

```swift
struct Fahrenheit {
    var temperature = 32.0
}

let freezing = Fahrenheit()
```

Or write an `init` that sets everything:

```swift
struct Celsius {
    var temperature: Double

    init(fromFahrenheit fahrenheit: Double) {
        temperature = (fahrenheit - 32) / 1.8
    }

    init(fromKelvin kelvin: Double) {
        temperature = kelvin - 273.15
    }
}

let boiling = Celsius(fromFahrenheit: 212)
```

Initializers have no name of their own, so their **argument labels** are how you tell them apart.

## Memberwise initializers for structs

Structs get an automatic initializer with a parameter for each stored property, in declaration order. Properties with default values become optional parameters:

```swift
struct Size {
    var width = 0.0
    var height = 0.0
}

let a = Size()
let b = Size(width: 2)
let c = Size(width: 2, height: 3)
```

If you write your own `init` inside the struct, the memberwise one disappears. To keep both, put your custom initializer in an **extension**:

```swift
struct Point {
    var x: Double
    var y: Double
}

extension Point {
    init(both value: Double) {
        self.init(x: value, y: value)    // delegating to the memberwise init
    }
}

let origin = Point(x: 0, y: 0)
let diagonal = Point(both: 5)
```

## Failable initializers

Some inputs simply can't produce a valid instance. `init?` returns an optional and can `return nil`:

```swift
struct Email {
    let address: String

    init?(_ address: String) {
        guard address.contains("@") else { return nil }
        self.address = address
    }
}

if let email = Email("sam@example.com") {
    print(email.address)
}
let invalid = Email("not-an-email")   // nil
```

When you need to explain *why* creation failed, use a throwing initializer, `init(_:) throws`, instead.

## Classes: designated and convenience initializers

Classes have two kinds of initializers:

- **Designated** initializers fully initialize the class's own properties and call a superclass initializer.
- **Convenience** initializers are secondary shortcuts. They must call another initializer **of the same class**, eventually reaching a designated one.

```swift
class Food {
    let name: String

    init(name: String) {                 // designated
        self.name = name
    }

    convenience init() {                 // convenience
        self.init(name: "[Unnamed]")
    }
}

let mystery = Food()
print(mystery.name)   // [Unnamed]
```

## Two-phase initialization

Class initialization happens in two phases, which is how Swift guarantees that no method ever sees a half-built object:

1. **Phase 1:** each class in the hierarchy initializes its own stored properties, from the subclass upward. Until this finishes, you can't call methods or read `self`.
2. **Phase 2:** once every property has a value, each initializer can customize the instance further, using `self` freely.

```swift
class RecipeIngredient: Food {
    let quantity: Int

    init(name: String, quantity: Int) {
        self.quantity = quantity          // phase 1: own properties first
        super.init(name: name)            // then up the chain
        print("Created \(self.name)")     // phase 2: self is fully usable
    }
}
```

Swap the first two lines and the compiler refuses: a subclass must initialize its own properties *before* handing control to its superclass.

## Initializer inheritance

Subclasses don't inherit initializers by default, which prevents a subclass from being created half-initialized. Two rules bring them back automatically:

1. If a subclass defines **no designated initializers**, and all its new properties have defaults, it inherits all of the superclass's designated initializers.
2. If a subclass provides all of the superclass's designated initializers, by rule 1 or by overriding them, it also inherits all of the superclass's convenience initializers.

```swift
class ShoppingItem: RecipeIngredient {
    var purchased = false   // default value, and no designated init of its own
}

let item = ShoppingItem(name: "Eggs", quantity: 6)   // inherited
```

## Required initializers

`required init` forces every subclass to implement that initializer. It's how protocols and frameworks guarantee they can create any subclass, for example `required init?(coder:)` on `UIView`:

```swift
class Shape {
    let sides: Int
    required init(sides: Int) { self.sides = sides }
}

class Polygon: Shape {
    required init(sides: Int) {
        super.init(sides: sides)
    }
}
```

## Setting a property with a closure

For setup that needs a few lines, initialize a property with a closure that runs immediately. Note the `()` at the end:

```swift
struct Chessboard {
    let squares: [Bool] = {
        var board: [Bool] = []
        var isBlack = false
        for _ in 1...8 {
            for _ in 1...8 {
                board.append(isBlack)
                isBlack.toggle()
            }
            isBlack.toggle()
        }
        return board
    }()
}
```

The closure runs before the rest of the instance exists, so it can't use `self`.

## Summary

- Every stored property needs a value before an instance is used.
- Structs get memberwise initializers; keep them by putting custom ones in an extension.
- `init?` handles invalid input; `init throws` explains the failure.
- Classes use designated and convenience initializers, two-phase initialization, and explicit inheritance rules.
