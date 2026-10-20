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

Inheritance lets one class build on another: a subclass gets its superclass's properties and methods, and can add new ones or override existing behavior. In Swift, only classes can inherit, each class has at most one superclass, and overriding is always explicit. Those rules keep inheritance useful without letting it become a maze.

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

Any class that doesn't inherit from anything is a **base class**. Swift has no universal root class like `NSObject` in Objective-C.

## Subclassing

```swift
class Bicycle: Vehicle {
    var hasBasket = false
}

let bike = Bicycle()
bike.hasBasket = true
bike.currentSpeed = 15
print("Bicycle: \(bike.description)")
```

`Bicycle` inherits `currentSpeed`, `description`, and `makeNoise()`, and adds `hasBasket`. Subclasses can be subclassed further:

```swift
class Tandem: Bicycle {
    var passengers = 0
}
```

## Overriding

To replace inherited behavior, mark the new version with `override`. The keyword is mandatory, and it's checked: you can't accidentally override something, and you can't claim to override a method that doesn't exist.

```swift
class Train: Vehicle {
    override func makeNoise() {
        print("Choo choo")
    }
}

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

`super` gives access to the superclass's version, so you can extend behavior instead of replacing it.

### Overriding property observers

A subclass can add observers to an inherited property:

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

## Polymorphism

A subclass instance can be used anywhere its superclass is expected, and calls go to the most specific override at runtime:

```swift
let vehicles: [Vehicle] = [Train(), Car(), Bicycle()]

for vehicle in vehicles {
    vehicle.makeNoise()      // Train prints "Choo choo"; the others are silent
}
```

This runtime lookup is called **dynamic dispatch**. It's what makes overriding work, and it has a small runtime cost compared with calling a function directly.

## Preventing overrides with `final`

Mark a method, property, or subscript `final` to stop subclasses from overriding it, or mark the whole class `final` to stop subclassing entirely:

```swift
final class Logger2 {
    func log(_ message: String) { print(message) }
}

class Account {
    final func id() -> String { "ACC-1" }
}
```

`final` documents intent, prevents fragile subclasses, and lets the compiler call methods directly instead of looking them up at runtime. Many Swift developers make every class `final` by default and remove it only when subclassing is actually designed for.

## Initializers and inheritance

Subclass initializers must initialize their own properties **before** calling `super.init`, and Swift has detailed rules about which initializers are inherited automatically. That's a topic for its own article. A quick taste:

```swift
class Animal {
    let name: String
    init(name: String) { self.name = name }
}

class Dog: Animal {
    let breed: String

    init(name: String, breed: String) {
        self.breed = breed        // first, the subclass's own properties
        super.init(name: name)    // then the superclass
    }
}
```

## When not to use inheritance

Inheritance creates a tight coupling between parent and child. A change in the superclass can quietly break subclasses, often called the "fragile base class" problem. Before subclassing, consider:

- **Protocols with extensions**, which share behavior across structs, enums, and classes without a hierarchy,
- **composition**, where an object *has* a helper instead of *being* a specialized version of something.

Inheritance still fits naturally when a framework is designed around it, like subclassing `UIViewController`, or when you genuinely have an "is a" relationship with shared state.

## Summary

- Only classes inherit, and each has at most one superclass.
- `override` is required and checked; `super` reaches the parent's implementation.
- Subclass instances can stand in for their superclass, with dynamic dispatch picking the right override.
- `final` prevents overriding and subclassing; prefer protocols and composition when there's no true "is a" relationship.
