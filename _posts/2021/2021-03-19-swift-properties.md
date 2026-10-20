---
layout: post
title: "Properties in Swift"
date: "2021-03-19"
last_modified_at: "2021-03-19"
permalink: /swift-properties/
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
  - "Properties"
---

Properties attach values to types. Some store data, some compute it on demand, some react when they change, and some belong to the type itself rather than to any instance. Knowing which kind to use keeps your types small, honest, and easy to read.

<!--more-->

## Stored properties

A stored property holds a value as part of an instance. `var` properties can change; `let` properties are set once, during initialization:

```swift
struct Book {
    let isbn: String        // never changes
    var title: String       // can change
    var pageCount = 0       // default value
}

var book = Book(isbn: "978-0-13-468599-1", title: "Draft")
book.title = "Final Title"
```

## Computed properties

A computed property doesn't store anything. It calculates its value every time you read it:

```swift
struct Rectangle {
    var width: Double
    var height: Double

    var area: Double {
        width * height
    }
}

let room = Rectangle(width: 4, height: 5)
print(room.area)   // 20.0
```

A computed property can also have a setter, which updates the stored properties it's derived from:

```swift
struct Temperature {
    var celsius: Double

    var fahrenheit: Double {
        get { celsius * 9 / 5 + 32 }
        set { celsius = (newValue - 32) * 5 / 9 }
    }
}

var today = Temperature(celsius: 20)
today.fahrenheit = 212
print(today.celsius)   // 100.0
```

Inside `set`, the new value is called `newValue` unless you name it: `set(degrees) { ... }`.

Keep computed properties cheap. Readers expect `x.area` to be fast; if the work is expensive, a method like `calculateArea()` sets the right expectation.

## Property observers

`willSet` and `didSet` run code around a change to a stored property:

```swift
final class StepCounter {
    var steps = 0 {
        willSet {
            print("About to set steps to \(newValue)")
        }
        didSet {
            if steps > oldValue {
                print("Added \(steps - oldValue) steps")
            }
        }
    }
}

let counter = StepCounter()
counter.steps = 200
```

Observers don't run while the property is being set inside its own type's initializer, only for later changes. They're great for small side effects, like updating a label or saving a setting. If you find yourself stacking lots of logic in `didSet`, consider making the change an explicit method instead.

## Lazy stored properties

A `lazy var` isn't computed until it's first used, which helps with expensive setup that may never be needed:

```swift
final class ReportScreen {
    lazy var formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter
    }()
}
```

Two things to know: `lazy` properties must be `var`, and their first initialization is **not thread-safe**. If two threads read a `lazy` property for the first time at the same moment, it can be initialized twice.

## Read-only properties

A property can be readable from outside but writable only inside the type:

```swift
struct BankAccount {
    private(set) var balance = 0.0

    mutating func deposit(_ amount: Double) {
        balance += amount
    }
}

var account = BankAccount()
account.deposit(50)
print(account.balance)       // 50.0
account.balance = 1_000_000  // ❌ the setter is private
```

A computed property with only a getter is read-only too.

## Type properties

Properties marked `static` belong to the **type**, not to an instance. There's exactly one copy, shared by everyone:

```swift
struct AppConfig {
    static let apiVersion = "v2"
    static var requestCount = 0
}

print(AppConfig.apiVersion)
AppConfig.requestCount += 1
```

Static stored properties are initialized lazily, on first access, and Swift guarantees that initialization happens only once, even across threads. That's why `static let shared = MyService()` is the standard way to write a singleton.

In classes, a computed type property can use `class var` instead of `static var` to let subclasses override it.

## Property wrappers

When the same property behavior keeps coming up, like clamping a value or storing it in `UserDefaults`, you can package it as a **property wrapper**, such as `@Clamped` or SwiftUI's `@State`. That deserves its own article.

## Summary

- Stored properties hold data; computed properties derive it on every read.
- `willSet` and `didSet` observe changes, but not during the type's own initializer.
- `lazy` delays expensive setup until first use; it isn't thread-safe.
- `private(set)` exposes a read-only property; `static` properties belong to the type and are initialized once.
