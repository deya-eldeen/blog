---
layout: post
title: "Automatic Reference Counting (ARC) in Swift"
date: "2021-05-06"
last_modified_at: "2021-05-06"
permalink: /swift-automatic-reference-counting/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "ARC"
  - "Memory Management"
---

Swift manages memory for class instances with **Automatic Reference Counting**, or ARC. Every object keeps a count of how many strong references point at it, and when that count reaches zero, it's freed immediately. There's no garbage collector pausing your app, and you never call `free`, but there's one thing ARC can't do for you: break cycles.

<!--more-->

## How ARC counts

Each strong reference to a class instance adds one to its count. When a reference goes away, the count drops. At zero, `deinit` runs and the memory is released.

```swift
final class Person {
    let name: String
    init(name: String) { self.name = name; print("\(name) created") }
    deinit { print("\(name) freed") }
}

var ref1: Person? = Person(name: "Ada")   // count = 1
var ref2 = ref1                           // count = 2
var ref3 = ref1                           // count = 3

ref1 = nil                                // count = 2
ref2 = nil                                // count = 1
ref3 = nil                                // count = 0: "Ada freed"
```

The compiler inserts the retain and release operations for you at compile time, and the optimizer removes many of them. That's the "automatic" part.

ARC applies only to **reference types**: class instances and closures. Structs and enums are copied, not shared, so they don't need counting, although the class references stored inside them are counted.

## Strong reference cycles

ARC's one blind spot: if two objects hold strong references to each other, neither count can ever reach zero.

```swift
final class Tenant {
    let name: String
    var apartment: Apartment?
    init(name: String) { self.name = name }
    deinit { print("Tenant \(name) freed") }
}

final class Apartment {
    let unit: String
    var tenant: Tenant?
    init(unit: String) { self.unit = unit }
    deinit { print("Apartment \(unit) freed") }
}

var john: Tenant? = Tenant(name: "John")
var unit4A: Apartment? = Apartment(unit: "4A")

john?.apartment = unit4A
unit4A?.tenant = john

john = nil
unit4A = nil
// Nothing is printed: the two objects keep each other alive forever.
```

That's a **memory leak**. Both objects are unreachable from your code, but still in memory.

## Breaking cycles with `weak`

A `weak` reference doesn't increase the count. When the object it points to is freed, the weak reference automatically becomes `nil`, so it must be an optional `var`:

```swift
final class Lease {
    let unit: String
    weak var tenant: Tenant?     // doesn't keep the tenant alive
    init(unit: String) { self.unit = unit }
}
```

Use `weak` when the other object **may be freed first**. Delegates are the classic example: a table view shouldn't keep its delegate alive, so delegate properties are declared `weak`:

```swift
protocol DownloadDelegate: AnyObject {
    func didFinish()
}

final class DownloadTask {
    weak var delegate: DownloadDelegate?
}
```

The `AnyObject` constraint is required, because only class instances can be referenced weakly.

## Breaking cycles with `unowned`

An `unowned` reference also doesn't increase the count, but it isn't optional. It assumes the other object **always outlives** this one:

```swift
final class Customer {
    let name: String
    var card: CreditCard?
    init(name: String) { self.name = name }
}

final class CreditCard {
    let number: String
    unowned let customer: Customer    // a card never outlives its customer
    init(number: String, customer: Customer) {
        self.number = number
        self.customer = customer
    }
}
```

If that assumption turns out wrong and you access an `unowned` reference after its object is gone, Swift stops your app with a clear error rather than reading freed memory.

**Rule of thumb:** use `weak` unless you can prove the lifetime relationship. The optional is a small price for safety.

## Cycles through closures

Closures are reference types too, and they strongly capture the objects they use. If an object stores a closure that captures `self`, that's a cycle:

```swift
final class HTMLElement {
    let name: String
    let text: String?

    lazy var asHTML: () -> String = { [unowned self] in
        if let text = self.text {
            return "<\(self.name)>\(text)</\(self.name)>"
        }
        return "<\(self.name) />"
    }

    init(name: String, text: String? = nil) {
        self.name = name
        self.text = text
    }
}
```

The `[unowned self]` capture list breaks the cycle. Use `[weak self]` instead when the closure might outlive the object.

## Finding leaks

- Add a `print` to `deinit`, and check that it runs when you expect.
- Use Xcode's **Memory Graph Debugger** (the three-circle button in the debug bar) to see every object in memory and what's holding it.
- Run the **Leaks** template in Instruments during a typical session.

## ARC vs. garbage collection

| ARC | Tracing garbage collection |
|---|---|
| Frees memory as soon as the count reaches zero | Frees memory when the collector runs |
| Predictable timing, no pauses | Possible pauses, less predictable timing |
| Small cost on every retain and release | Cost concentrated in collection cycles |
| Can't detect cycles on its own | Collects cycles automatically |

## Summary

- ARC counts strong references to class instances and frees them at zero.
- Two objects referencing each other strongly leak; ARC can't detect this.
- `weak` (optional, becomes `nil`) and `unowned` (non-optional, must outlive) break cycles.
- Closures that capture `self` need capture lists when `self` stores them.
