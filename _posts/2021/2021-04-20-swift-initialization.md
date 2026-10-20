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

Swift has one non-negotiable rule about initialization: **every stored property must have a value before an instance can be used.** There's no "uninitialized" memory to stumble into later, no half-built object reachable from your code. Everything else about initializers, from free memberwise initializers to the two-phase process for classes, exists to enforce that rule while keeping initialization flexible.

<!--more-->

## Default values and custom initializers

The simplest way to satisfy the rule is to give every property a default value:

```swift
struct Fahrenheit {
    var temperature = 32.0
}

let freezing = Fahrenheit()
```

Or write an initializer that sets every property:

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
let absolute = Celsius(fromKelvin: 0)
```

Initializers have no names of their own, so their **argument labels** are how callers tell them apart. Choose labels that describe what the argument means, like `fromFahrenheit:` here.

`let` properties can be assigned exactly once during initialization, and never again afterwards.

## Memberwise initializers for structs

Structs get an automatic initializer with one parameter per stored property, in declaration order. Since Swift 5.1, properties with default values become parameters with defaults:

```swift
struct Size {
    var width = 0.0
    var height = 0.0
}

let a = Size()
let b = Size(width: 2)
let c = Size(width: 2, height: 3)
```

Classes don't get memberwise initializers, because the compiler can't know how you want inheritance to work.

### Two things that make the memberwise initializer disappear

**1. Writing your own initializer in the struct body.** Once you define an `init`, Swift assumes you want full control. To keep both, put your custom initializer in an **extension**:

```swift
struct Point {
    var x: Double
    var y: Double
}

extension Point {
    init(both value: Double) {
        self.init(x: value, y: value)    // delegate to the memberwise initializer
    }
}

let origin = Point(x: 0, y: 0)
let diagonal = Point(both: 5)
```

**2. A `private` property without a default value.** The memberwise initializer would have to take it as a parameter, which would leak it, so the initializer itself becomes `private`:

```swift
struct Token {
    private var secret: String
    var name: String
}

// let token = Token(secret: "abc", name: "api")   // ❌ 'Token' initializer is inaccessible due to 'private' protection level
```

Give the private property a default value, or write a public initializer, to fix this.

## Initializer delegation in value types

An initializer can call another initializer of the same type with `self.init(…)`. It's the cleanest way to avoid duplicating validation and setup:

```swift
struct Rect {
    var originX = 0.0, originY = 0.0
    var width = 0.0, height = 0.0

    init(originX: Double, originY: Double, width: Double, height: Double) {
        self.originX = originX
        self.originY = originY
        self.width = width
        self.height = height
    }

    init(centerX: Double, centerY: Double, width: Double, height: Double) {
        self.init(originX: centerX - width / 2, originY: centerY - height / 2,
                  width: width, height: height)
    }
}

let centered = Rect(centerX: 5, centerY: 5, width: 4, height: 2)
print(centered.originX, centered.originY)   // 3.0 4.0
```

## Failable initializers

Some inputs simply can't produce a valid instance. `init?` returns an optional, and can `return nil`:

```swift
struct Email {
    let address: String

    init?(_ address: String) {
        guard address.contains("@"), !address.hasPrefix("@") else { return nil }
        self.address = address
    }
}

if let email = Email("sam@example.com") {
    print(email.address)
}
let invalid = Email("not-an-email")   // nil
```

This pattern is a great way to **make invalid states unrepresentable**: if an `Email` exists, it passed validation. The rest of your code never has to check again.

Enums with raw values get a failable initializer for free, `init?(rawValue:)`, and you can write your own:

```swift
enum Weekday: Int {
    case monday = 1, tuesday, wednesday, thursday, friday, saturday, sunday

    init?(name: String) {
        switch name.lowercased() {
        case "mon", "monday": self = .monday
        case "sun", "sunday": self = .sunday
        default: return nil
        }
    }
}

print(Weekday(rawValue: 3) == .wednesday)   // true
print(Weekday(name: "Sun") == .sunday)      // true
print(Weekday(name: "Funday") == nil)       // true
```

When callers need to know **why** creation failed, use a throwing initializer instead:

```swift
enum PasswordError: Error {
    case tooShort, missingDigit
}

struct Password {
    let value: String

    init(_ value: String) throws {
        guard value.count >= 8 else { throw PasswordError.tooShort }
        guard value.contains(where: { $0.isNumber }) else { throw PasswordError.missingDigit }
        self.value = value
    }
}

do {
    _ = try Password("short")
} catch {
    print(error)   // tooShort
}
```

## Classes: designated and convenience initializers

Classes have two kinds of initializers:

- **Designated** initializers are the primary ones. They fully initialize the class's own properties and then call a **superclass** designated initializer.
- **Convenience** initializers are secondary shortcuts. They must call another initializer **of the same class**, eventually reaching a designated one.

The rule of thumb: designated initializers delegate **up**, convenience initializers delegate **across**.

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

Class initialization happens in two phases. This is how Swift guarantees that no method ever sees a half-built object, even across an inheritance chain:

1. **Phase 1, initializing storage.** Starting at the subclass and moving up, each class sets its *own* stored properties, then hands control to its superclass. Until the top of the chain is reached, you can't call methods, read properties, or use `self` as a value.
2. **Phase 2, customizing.** Once every stored property in the whole chain has a value, control comes back down, and each initializer may use `self` freely: call methods, set inherited properties, and so on.

```swift
class RecipeIngredient: Food {
    let quantity: Int

    init(name: String, quantity: Int) {
        self.quantity = quantity          // phase 1: own properties first
        super.init(name: name)            // then up the chain
        print("Created \(self.name)")     // phase 2: self is fully usable
    }

    override convenience init(name: String) {
        self.init(name: name, quantity: 1)
    }
}
```

The compiler enforces the order with errors that are worth recognizing:

- Setting `super.init` before your own properties: *"property 'self.quantity' not initialized at super.init call"*.
- Calling a method before `super.init`: *"'self' used in method call 'setup' before 'super.init' call"*.

Why the strictness? In other languages, a superclass initializer can call an overridden method that reads a subclass property before the subclass set it, a classic source of bugs. Two-phase initialization makes that impossible.

## Initializer inheritance

Subclasses **don't** inherit their superclass's initializers by default. If they did, a subclass with new stored properties could be created through an inherited initializer that knows nothing about them, leaving them uninitialized. Two rules bring initializers back automatically:

1. If a subclass defines **no designated initializers** of its own (and all its new properties have defaults), it inherits all of its superclass's designated initializers.
2. If a subclass provides **all** of its superclass's designated initializers, either through rule 1 or by overriding them, it also inherits all of the superclass's convenience initializers.

```swift
class ShoppingItem: RecipeIngredient {
    var purchased = false   // has a default, and no designated init of its own
}

let eggs = ShoppingItem(name: "Eggs", quantity: 6)   // inherited designated init
let milk = ShoppingItem(name: "Milk")                 // inherited convenience-style init
let unknown = ShoppingItem()                          // inherited from Food, via rule 2
print(milk.quantity, unknown.name)                    // 1 [Unnamed]
```

## Required initializers

`required init` forces every subclass to implement that initializer. Frameworks use it when they need to create instances of subclasses they've never seen. The most famous one is in UIKit:

```swift
class Shape {
    let sides: Int
    required init(sides: Int) { self.sides = sides }
}

class Polygon: Shape {
    let label: String

    init(label: String, sides: Int) {
        self.label = label
        super.init(sides: sides)
    }

    required init(sides: Int) {          // must be implemented, and marked `required` again
        label = "Polygon"
        super.init(sides: sides)
    }
}
```

That's why every `UIView` subclass with a custom initializer must also implement `required init?(coder:)`, the initializer storyboards use. If you never load the view from a storyboard, the usual implementation is `fatalError("init(coder:) has not been implemented")`.

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

    func squareIsBlack(row: Int, column: Int) -> Bool {
        squares[row * 8 + column]
    }
}

print(Chessboard().squareIsBlack(row: 7, column: 7))   // false
```

The closure runs before the instance exists, so it can't use `self` or other properties. If you need them, use a `lazy var` instead.

## Initializers or factory methods?

Static factory methods are sometimes clearer than another initializer, because they have a name:

```swift
extension Rect {
    static func square(side: Double) -> Rect {
        Rect(originX: 0, originY: 0, width: side, height: side)
    }
}

let tile = Rect.square(side: 32)
```

Use initializers for the main ways to construct a value, and named factory methods when a construction has a specific meaning ("square", "placeholder", "fromCache") that labels alone don't capture.

## Common pitfalls

- **Losing the memberwise initializer** by adding an `init` to the struct body. Move the custom one to an extension.
- **Private properties without defaults** that make the memberwise initializer private.
- **Doing heavy work in initializers**, like network calls. Initializers should set up state, quickly and predictably. Start work in a method.
- **Forgetting `required init?(coder:)`** in UIKit subclasses.
- **`init!` (implicitly unwrapped failable initializers)**: they exist mostly for Objective-C interop. In Swift code, prefer `init?` or `throws`.

## Interview questions

**What is two-phase initialization and why does Swift use it?**
Phase 1 initializes every stored property, from subclass up to the root class; phase 2 lets initializers customize the instance. It prevents methods from running on partially initialized objects.

**What's the difference between designated and convenience initializers?**
Designated initializers fully initialize the class and call a superclass designated initializer (delegate up). Convenience initializers must call another initializer of the same class (delegate across).

**Why don't subclasses inherit initializers by default?**
An inherited initializer wouldn't know about the subclass's new stored properties, which could leave them uninitialized. Swift only inherits initializers when that's provably safe.

**How do you keep a struct's memberwise initializer while adding a custom one?**
Define the custom initializer in an extension.

## Summary

- Every stored property needs a value before an instance is used; `let` properties are set exactly once.
- Structs get memberwise initializers (with default arguments), unless you define your own `init` in the body or have private properties without defaults.
- `init?` and `throws` handle invalid input, and make invalid states unrepresentable.
- Classes use designated (up) and convenience (across) initializers, two-phase initialization, and explicit inheritance rules; `required` forces subclasses to implement an initializer.
