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
thumbnail: "images/covers/swift_structures_and_classes_thumbnail.webp"
thumbnail_ready: true
---

Structures and classes look almost identical in Swift: both have properties, methods, initializers, and extensions, and both can conform to protocols. The difference that matters is what happens when you **copy** one. A struct is a **value**: every copy is independent. A class instance is a **reference**: every copy points to the same object. That single fact shapes how your code behaves, how it performs, and which bugs it's prone to.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_structures_and_classes_thumbnail.webp"
 alt_text="Independent copied value containers beside two references to one shared object"
 caption="Structures and Classes in Swift: Value vs. Reference Types"
 width="640"
 height="400"
%}

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

The first visible difference: structs get a free **memberwise initializer**, `PointValue(x:y:)`. Classes must define their own `init`.

## Copying a value vs. sharing a reference

```swift
var a = PointValue(x: 0, y: 0)
var b = a          // b is an independent copy
b.x = 10
print(a.x)         // 0.0: a is unchanged

let c = PointObject(x: 0, y: 0)
let d = c          // d refers to the same object as c
d.x = 10
print(c.x)         // 10.0: both names see the change
```

With structs, every variable owns its own data, so a change can't leak into another part of your app. With classes, every reference sees the same object, so a change anywhere is visible everywhere. Sometimes that sharing is exactly what you want; often it's a source of bugs.

### What `let` means

Notice that `d` is a `let` constant, yet we changed `d.x`. For a class, `let` means "this name always refers to the same object", not "the object can't change". For a struct, `let` makes the **whole value** immutable, including all its properties:

```swift
let frozen = PointValue(x: 1, y: 1)
frozen.x = 5      // ❌ cannot assign to property: 'frozen' is a 'let' constant
```

That's a powerful guarantee: when you receive a struct as a `let`, nothing can change it, not even code elsewhere that holds a "copy".

### Mutating values inside collections

Because arrays and dictionaries also hold values, modifying a struct inside a collection modifies **that element in place**, and only it:

```swift
var waypoints = [PointValue(x: 0, y: 0), PointValue(x: 1, y: 1)]
waypoints[0].x = 5
print(waypoints[0].x)   // 5.0
```

If `PointValue` were a class, the same line would change an object that might also be referenced from somewhere else entirely.

## Identity

Class instances have an **identity**, independent of their contents. You can ask "are these the same object?" with the identity operator `===`:

```swift
let e = PointObject(x: 0, y: 0)
print(c === d)    // true: same object
print(c === e)    // false: different objects, even if their coordinates were equal
```

Structs have no identity. Two structs with the same values are interchangeable, which is exactly what you want for data like coordinates, money amounts, or dates. If you need equality for structs, adopt `Equatable`, which Swift synthesizes for you when all properties are `Equatable`:

```swift
struct Size: Equatable {
    var width: Double
    var height: Double
}

print(Size(width: 1, height: 2) == Size(width: 1, height: 2))   // true
```

## What only classes can do

- **Inheritance:** a class can subclass another and override its behavior.
- **Deinitializers:** a class can run cleanup code in `deinit` when its last reference goes away.
- **Shared ownership:** several parts of your app can hold the same instance, and ARC (Automatic Reference Counting) keeps it alive as long as anyone needs it. That's right for things that are inherently shared: a database connection, an image cache, a view controller.
- **Runtime type casting** between superclasses and subclasses, and Objective-C interoperability through `NSObject`.

Structs, in turn, can do something classes can't: **mutate through `mutating` methods with full value semantics**, and give you thread safety by default, because there's no shared mutable state.

## Under the hood: memory layout

Let's look at what these types actually cost:

```swift
import Foundation   // for class_getInstanceSize, from the Objective-C runtime

print(MemoryLayout<PointValue>.size)            // 16: two Doubles, stored inline
print(MemoryLayout<PointObject>.size)           // 8: just a reference (a pointer)
print(class_getInstanceSize(PointObject.self))  // 32: the object on the heap
```

A `PointValue` is exactly its two `Double`s, 16 bytes, stored wherever the value lives: in a local variable, in a parent struct, or directly inside an array's buffer. A `PointObject` variable is an 8-byte pointer to a **heap object** of 32 bytes: 16 bytes of header (a pointer to the class's metadata and the reference counts) plus the 16 bytes of properties.

That has practical consequences:

- **Allocation.** Creating a class instance means a heap allocation (and later a deallocation), which is much slower than writing 16 bytes to the stack.
- **Reference counting.** Every new reference to an object increments an atomic reference count, and every released one decrements it. Atomic operations are cheap but not free, and in hot loops they add up.
- **Locality.** An array of structs stores the values next to each other, which is great for CPU caches. An array of class instances stores pointers to objects that may be scattered across the heap.

Struct layout follows declaration order, with padding for alignment:

```swift
struct Padded {
    var flag: Bool      // 1 byte, then 7 bytes of padding so value is 8-byte aligned
    var value: Double
}

struct Compact {
    var value: Double
    var flag: Bool
}

print(MemoryLayout<Padded>.size, MemoryLayout<Compact>.size)        // 16 9
print(MemoryLayout<Padded>.stride, MemoryLayout<Compact>.stride)    // 16 16
```

`stride` is the distance between consecutive elements in an array, which includes trailing padding. It rarely matters, but it's good to know why a struct can be larger than the sum of its fields.

Swift doesn't promise *where* a value lives. Values captured by escaping closures, stored in a class, or too large to keep in registers can end up on the heap too. "Structs are on the stack" is a useful approximation, not a rule.

## Value types that contain references

Here's the trap that bites people who just learned "structs are values":

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
p2.name = "Lina"            // independent: name is a value
p2.settings.theme = "dark"  // shared! both profiles point to one Settings object
print(p1.settings.theme)    // dark
```

Copying a struct copies its **properties**. For a class property, the property is a reference, so the copy points to the same object. `Profile` is a value *type*, but it doesn't have value *semantics*.

To give a type real value semantics, make everything inside it a value too, or implement copy-on-write: keep the class private, and copy it before mutating whenever it's shared (`isKnownUniquelyReferenced`). That's how `Array`, `Dictionary`, and `String` provide value semantics with efficient storage, as described in [Arrays and Dictionaries in Swift](/swift-arrays-and-dictionaries/).

## Choosing between them

Apple's guidance is simple: **use structs by default**, and reach for a class when you need something only classes provide.

| Use a struct when… | Use a class when… |
|---|---|
| the type is data: a model, a configuration, a point, a request | you need a single shared instance whose identity matters |
| copies should be independent | you need inheritance, for example subclassing `UIViewController` |
| you want thread safety without locks | you need `deinit` to release a resource, like a file or socket |
| you want cheap creation and good cache locality | you need Objective-C interoperability (`NSObject`, KVO, `@objc`) |

A useful question to ask: "Does it make sense for two of these to be equal but different?" Two `Date`s representing the same instant are simply the same date: that's a value. Two network connections to the same server are still two connections: that's an object.

## Common pitfalls

- **Expecting sharing from a struct.** You pass a struct to a function, the function modifies its copy, and the caller's value doesn't change. Use `inout`, return the new value, or use a class if sharing is really the goal.
- **Unexpected sharing from a class.** You "copy" an array of class instances, change an element, and the original changes too. Copying an array of references copies the references.
- **Classes inside "value" types**, as shown above.
- **Huge structs copied in hot loops.** Copies of large structs are real memory copies. Keep big data in copy-on-write storage like arrays.
- **Using classes just for `deinit` logging or habit.** Each one adds allocation, reference counting, and shared mutable state.

## Interview questions

**What's the difference between a value type and a reference type?**
Assigning or passing a value type creates an independent copy; assigning a reference type creates another reference to the same instance.

**Does `let` make a class instance immutable?**
No. It makes the reference constant. The object's `var` properties can still change. For a struct, `let` makes the entire value immutable.

**Are structs always allocated on the stack?**
No. That's a common approximation. Swift decides storage based on how a value is used; values captured by escaping closures, stored inside classes, or of unknown size at compile time can live on the heap.

**What's the difference between value types and value semantics?**
A struct that contains a class reference is a value type, but copies share the referenced object, so it lacks value semantics. Value semantics means copies are fully independent.

## Summary

- Structs are values: copies are independent. Classes are references: copies share one object.
- `let` makes a struct fully immutable, but only fixes the reference for a class.
- Classes add identity (`===`), inheritance, `deinit`, and shared ownership through ARC, at the cost of heap allocation and reference counting.
- A struct is only truly a value if its contents are; class properties inside a struct are shared.
- Default to structs, and choose classes when identity, inheritance, or resource lifetime matter.
