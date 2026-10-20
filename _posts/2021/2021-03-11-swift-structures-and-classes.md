---
layout: post
title: "Structures and Classes in Swift: Value vs. Reference Types"
date: "2021-03-11"
last_modified_at: "2021-03-11"
permalink: /swift-structures-and-classes/
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

Structures and classes look almost identical in Swift: both have properties, methods, and initializers, and both can conform to protocols. The difference that matters is what happens when you copy one. A struct is a **value**; a class instance is a **reference**. That single fact shapes how your code behaves, how it performs, and which bugs it's prone to.

<!--more-->

## Same syntax, different semantics

```swift
struct PointValue {
    var x: Double
    var y: Double
}

final class PointObject {
    var x: Double
    var y: Double

    init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}
```

The first visible difference: structs get a free **memberwise initializer**, `PointValue(x:y:)`, while classes must define their own `init`.

## Copying a value vs. sharing a reference

```swift
var a = PointValue(x: 0, y: 0)
var b = a          // b is an independent copy
b.x = 10
print(a.x)         // 0.0

let c = PointObject(x: 0, y: 0)
let d = c          // d refers to the same object
d.x = 10
print(c.x)         // 10.0
```

With structs, every variable owns its own data, and changes can't leak to other parts of your app. With classes, every reference sees the same object, so a change anywhere is visible everywhere.

Notice also that `d` is a `let` constant, yet we changed `d.x`. A `let` reference means "always points to the same object", not "the object can't change". A `let` struct, by contrast, is fully immutable:

```swift
let frozen = PointValue(x: 1, y: 1)
frozen.x = 5      // ❌ cannot assign to property: 'frozen' is a 'let' constant
```

## Identity

Because class instances are shared, they have an **identity**. You can ask "are these the same object?" with `===`:

```swift
let e = PointObject(x: 0, y: 0)
print(c === d)    // true, same object
print(c === e)    // false, equal coordinates but different objects
```

Structs have no identity; two structs with the same values are interchangeable.

## What only classes can do

- **Inheritance:** a class can subclass another and override its behavior. Structs can't inherit, though they can share behavior through protocols.
- **Deinitializers:** classes can run cleanup code in `deinit` when the last reference goes away.
- **Reference counting:** class instances are managed by ARC, so several owners can share one object, which is exactly what you want for shared resources like a database connection or a cache.
- **Type casting at runtime** between superclasses and subclasses.

## Where they live

Swift doesn't promise where values are stored, but in practice:

- Small structs are usually stored **inline**: in a local variable, in the containing struct, or directly in an array's buffer. Creating one costs almost nothing.
- Class instances are allocated on the **heap**, and every copy of the reference updates a reference count. That's cheap, but not free, and it adds up in hot loops.

Collections like `Array` and `Dictionary` are structs too, using **copy-on-write**: copies share storage until one is modified.

## Choosing between them

Apple's guidance is simple: **use structs by default.** Reach for a class when you need one of the things only classes do:

| Use a struct when… | Use a class when… |
|---|---|
| the type is data: a model, a configuration, a point | you need shared, mutable state with a single identity |
| copies should be independent | you need inheritance or Objective-C interoperability |
| you want thread-safe-by-default values | you need a `deinit` to manage a resource |

SwiftUI views are structs, as are most model types. View controllers, managers, and caches tend to be classes.

## A common trap: classes inside structs

A struct containing a class reference only copies the reference:

```swift
final class Settings {
    var theme = "light"
}

struct Profile {
    var name: String
    let settings: Settings
}

let p1 = Profile(name: "Sam", settings: Settings())
var p2 = p1
p2.name = "Lina"            // independent
p2.settings.theme = "dark"  // shared! p1 sees "dark" too
print(p1.settings.theme)    // dark
```

If you want true value semantics, make everything inside the struct a value type too, or implement copy-on-write yourself.

## Summary

- Structs are values: copies are independent. Classes are references: copies share one object.
- `let` makes a struct fully immutable, but only fixes the reference for a class.
- Classes add identity (`===`), inheritance, `deinit`, and shared ownership through ARC.
- Default to structs; choose classes when you need shared identity or class-only features.
