---
layout: post
title: "Inheritance in Swift"
date: "2021-04-12"
last_modified_at: "2021-04-12"
permalink: /swift-inheritance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "OOP"
  - "Classes"
---

Inheritance lets one class build on another: a subclass gets its superclass's properties and methods, can add new ones, and can override existing behavior. Swift keeps inheritance deliberately simple and explicit: only classes inherit, each class has at most one superclass, overriding requires the `override` keyword, and you can forbid it with `final`. Those rules keep the power of inheritance while avoiding many of its traditional traps.

<!--more-->

## A base class

```swift
class Vehicle {
    var currentSpeed = 0.0

    var description: String {
        "traveling at \(currentSpeed) km/h"
    }

    func makeNoise() {
        // Vehicles in general don't make a specific noise.
    }
}
```

Any class that doesn't inherit from another is a **base class**. Unlike Objective-C, where almost everything inherits from `NSObject`, Swift has no universal root class: `Vehicle` stands on its own.

## Subclassing

```swift
class Bicycle: Vehicle {
    var hasBasket = false
}

let bike = Bicycle()
bike.hasBasket = true
bike.currentSpeed = 15
print("Bicycle: \(bike.description)")   // Bicycle: traveling at 15.0 km/h
```

`Bicycle` inherits `currentSpeed`, `description`, and `makeNoise()`, and adds `hasBasket`. Subclasses can themselves be subclassed:

```swift
class Tandem: Bicycle {
    var passengers = 0
}
```

Only classes can inherit. Structs and enums share behavior differently: through protocols and protocol extensions.

## Overriding

To replace inherited behavior, prefix the new implementation with `override`. The keyword is mandatory and checked in both directions: you can't override something by accident, and you can't claim to override something that doesn't exist (a typo in the method name becomes a compile error, not a silently unused method).

### Methods

```swift
class Train: Vehicle {
    override func makeNoise() {
        print("Choo choo")
    }
}
```

### Properties

You can override any inherited property, stored or computed, by providing a getter (and a setter if needed):

```swift
class Car: Vehicle {
    var gear = 1

    override var description: String {
        super.description + " in gear \(gear)"
    }
}

let car = Car()
car.currentSpeed = 25
car.gear = 3
print(car.description)   // traveling at 25.0 km/h in gear 3
```

`super` gives access to the superclass's implementation, so you can **extend** behavior instead of replacing it. Calling `super` is a judgment call per method: for UIKit lifecycle methods like `viewDidLoad()`, always call it; for a method whose whole job you're replacing, don't.

There are a few rules about property overrides:

- You can make an inherited read-only property **read-write**, by providing both a getter and a setter.
- You **can't** make an inherited read-write property read-only: subclasses must support everything the superclass promised. The compiler says: *"cannot override mutable property with read-only property"*.
- You **can't** override a property with a new stored property (*"cannot override with a stored property"*), because that would require two storage slots for one property. Override with a computed property or with observers instead.

### Property observers

A subclass can observe an inherited property, even one the superclass doesn't observe itself:

```swift
class AutomaticCar: Car {
    override var currentSpeed: Double {
        didSet {
            gear = Int(currentSpeed / 10) + 1
        }
    }
}

let automatic = AutomaticCar()
automatic.currentSpeed = 35
print(automatic.gear)   // 4
```

### Covariant return types

An override can return a **more specific** type than the method it overrides. Callers that know they have a subclass get the precise type, without casting:

```swift
class Animal {
    func makeOffspring() -> Animal { Animal() }
}

class Cat: Animal {
    override func makeOffspring() -> Cat { Cat() }
}

let kitten = Cat().makeOffspring()   // typed as Cat, not Animal
print(type(of: kitten))              // Cat
```

## Polymorphism and dynamic dispatch

A subclass instance can be used anywhere its superclass is expected. When you call an overridable method, Swift picks the implementation based on the object's **actual** type at runtime, not on the declared type of the variable:

```swift
let vehicles: [Vehicle] = [Train(), Car(), Bicycle()]

for vehicle in vehicles {
    vehicle.makeNoise()      // the Train prints "Choo choo"; the others are silent
}
```

This is called **dynamic dispatch**. Each class has a table of function pointers for its overridable methods, called a **virtual table** or vtable, and a call looks up the right entry at runtime. It's what makes overriding work. The cost is small (an indirect call), but it prevents the compiler from inlining the method, which matters in hot code.

## Preventing overrides with `final`

Mark a method, property, or subscript `final` to stop subclasses from overriding it, or mark a whole class `final` to stop it from being subclassed:

```swift
final class AuditLogger {
    func log(_ message: String) { print(message) }
}

class Account {
    final func identifier() -> String { "ACC-1" }   // subclasses can't change this
    func monthlyFee() -> Double { 5 }                // but they can change this
}
```

`final` does three things at once:

1. **Documents intent:** this class wasn't designed to be subclassed.
2. **Prevents fragile subclasses** that depend on implementation details.
3. **Enables static dispatch:** the compiler knows exactly which method will run, so it can call it directly and inline it.

Many Swift teams make every class `final` by default, and remove it only when subclassing is a deliberate part of the design. With whole-module optimization (the default for release builds), the compiler can also infer "effectively final" for `internal` and `private` classes that it can see have no subclasses.

## `class` vs. `static` members

Type methods and computed type properties can be declared `class` instead of `static` when you want subclasses to override them:

```swift
class Shape {
    class var defaultName: String { "Shape" }
    static let sidesUnknown = -1          // static: can't be overridden
}

class Square: Shape {
    override class var defaultName: String { "Square" }
}

print(Square.defaultName)   // Square
```

`static` in a class is shorthand for `final class`.

## Initializers and inheritance

Initialization is where inheritance has the most rules. In short: a subclass initializer must give values to all of its own new stored properties **before** calling `super.init`, and Swift only inherits initializers automatically in specific situations. It's a big enough topic for an article of its own. A quick taste:

```swift
class Pet {
    let name: String
    init(name: String) { self.name = name }
}

class Dog: Pet {
    let breed: String

    init(name: String, breed: String) {
        self.breed = breed        // 1. the subclass's own properties first
        super.init(name: name)    // 2. then the superclass
    }
}
```

## "Abstract" methods

Swift has no `abstract` keyword. When a base class needs subclasses to provide an implementation, a common pattern is to trap in the base version:

```swift
class Report {
    func render() -> String {
        fatalError("Subclasses must override render()")
    }
}

final class SalesReport: Report {
    override func render() -> String { "Sales: 42" }
}

print(SalesReport().render())
```

It works, but the mistake is only caught at runtime. A **protocol** expresses the same requirement and is checked at compile time, which is usually the better design.

## When not to use inheritance

Inheritance creates tight coupling between parent and child. A change in the superclass can quietly break subclasses, which is known as the **fragile base class problem**. Deep hierarchies also make it hard to know where behavior comes from. Before subclassing, consider:

- **Protocols with extensions**, which share behavior across structs, enums, and classes without a hierarchy.
- **Composition**, where an object *has* a helper instead of *being* a specialized version of something:

```swift
protocol PaymentMethod {
    func charge(_ amount: Double) -> Bool
}

struct CardPayment: PaymentMethod {
    func charge(_ amount: Double) -> Bool { amount < 1_000 }
}

final class Checkout {
    private let paymentMethod: PaymentMethod   // has-a, swappable, easy to test

    init(paymentMethod: PaymentMethod) {
        self.paymentMethod = paymentMethod
    }

    func pay(_ amount: Double) -> Bool {
        paymentMethod.charge(amount)
    }
}

print(Checkout(paymentMethod: CardPayment()).pay(30))   // true
```

Inheritance still fits naturally when a framework is built around it, like subclassing `UIViewController` or `UIView`, or when you genuinely have an "is a" relationship with shared state and behavior.

A good check is the **Liskov substitution principle**: anywhere the superclass is used, a subclass must work correctly without callers noticing. If a subclass has to throw "not supported" for some inherited method, the hierarchy is wrong.

## Common pitfalls

- **Forgetting `super`** in lifecycle overrides like `viewDidLoad()`, `viewWillAppear(_:)`, or `prepareForReuse()`.
- **Overriding to remove behavior**, which usually violates Liskov substitution.
- **Deep hierarchies** where one change ripples through many subclasses.
- **Leaving classes open by accident.** Without `final`, any subclass anywhere in the module can override your methods.

## Interview questions

**Can structs inherit?**
No. Only classes support inheritance. Structs and enums share behavior through protocols.

**Why does Swift require `override`?**
To make overriding explicit and checked: you can't override by accident, and a misspelled override is a compile error.

**What does `final` do for performance?**
It lets the compiler use static dispatch, calling the method directly and potentially inlining it, instead of looking it up in the vtable.

**Can you override a stored property?**
Not with another stored property. You can override it with a computed property, or add observers to it.

## Summary

- Only classes inherit, and each has at most one superclass.
- `override` is required and checked; `super` reaches the parent's implementation.
- Overrides can make read-only properties read-write (not the reverse), add observers, and return more specific types.
- Subclass instances can stand in for their superclass, with dynamic dispatch choosing the override at runtime.
- `final` prevents overriding and enables static dispatch; prefer composition and protocols when there's no true "is a" relationship.
