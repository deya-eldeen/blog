---
layout: post
title: "Static vs. Dynamic Dispatch in Swift"
date: "2022-04-02"
last_modified_at: "2022-04-02"
permalink: /swift-static-vs-dynamic-dispatch/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Performance"
  - "Protocols"
---

When you call a method, the program has to decide *which* implementation runs. Sometimes the compiler knows at compile time: that's **static dispatch**. Sometimes it can only be decided at runtime, based on the actual type of the object: that's **dynamic dispatch**. Swift uses both, and knowing which one applies explains some surprising protocol behavior and a few performance tricks.

<!--more-->

## Static dispatch

With static dispatch, the compiler knows the exact function to call and jumps straight to it. It can also **inline** the function, copying its body into the caller and enabling further optimizations.

Swift uses static dispatch for:

- methods on **structs and enums** (value types can't be subclassed),
- `final` methods and methods of `final` classes,
- `private` and `fileprivate` members of classes, when the compiler can see there are no overrides,
- methods defined **only** in protocol extensions,
- free functions and `static` methods on value types.

```swift
struct Calculator {
    func add(_ a: Int, _ b: Int) -> Int { a + b }   // statically dispatched
}
```

## Dynamic dispatch through tables

### Class virtual tables (vtables)

Each class has a table of function pointers for its overridable methods. A call looks up the method in the object's table at runtime, which is what makes overriding work:

```swift
class Animal {
    func speak() -> String { "..." }
}

class Dog: Animal {
    override func speak() -> String { "Woof" }
}

let pet: Animal = Dog()
print(pet.speak())   // "Woof": chosen at runtime from Dog's vtable
```

### Protocol witness tables

When you call a protocol requirement through a generic or an existential (`any Protocol`), Swift uses the conforming type's **witness table**, a table of that type's implementations of the protocol's requirements:

```swift
protocol Greeter {
    func greet() -> String
}

struct English: Greeter {
    func greet() -> String { "Hello" }
}

struct French: Greeter {
    func greet() -> String { "Bonjour" }
}

let greeters: [any Greeter] = [English(), French()]
for greeter in greeters {
    print(greeter.greet())        // looked up in each type's witness table
}
```

When the compiler can see the concrete type, for example in specialized generic code, it often turns these calls back into static calls.

### Objective-C message dispatch

Members marked `@objc dynamic` use the Objective-C runtime's `objc_msgSend`, the most flexible and slowest option. It's what makes KVO and [method swizzling](/swift-method-swizzling/) possible, because the implementation can be swapped at runtime.

## The protocol extension surprise

Here's the behavior that catches almost everyone. A method declared **in the protocol** is a requirement, dispatched through the witness table. A method that exists **only in an extension** is statically dispatched, based on the variable's declared type:

```swift
protocol Drawable {
    func draw() -> String          // requirement: dynamic dispatch
}

extension Drawable {
    func draw() -> String { "Default draw" }
    func describe() -> String { "Default describe" }   // NOT a requirement: static dispatch
}

struct Circle: Drawable {
    func draw() -> String { "Circle draw" }
    func describe() -> String { "Circle describe" }
}

let concrete = Circle()
print(concrete.draw())       // Circle draw
print(concrete.describe())   // Circle describe

let abstract: any Drawable = Circle()
print(abstract.draw())       // Circle draw: requirement, dynamic dispatch
print(abstract.describe())   // Default describe: extension-only, static dispatch!
```

The fix: if conforming types should be able to customize a method, **declare it in the protocol**, and keep the extension as its default implementation.

## Performance in practice

Dynamic dispatch costs an indirect call, but the bigger cost is what it prevents: the compiler can't inline a call when it doesn't know which function will run. In tight loops that matters; in typical app code it rarely does.

Ways to help the compiler:

- **Mark classes `final`** unless they're designed for subclassing. This is the easiest win and also documents intent.
- **Use `private`** where possible; the compiler can then prove there are no overrides.
- **Enable whole-module optimization**, the default for Release builds, so the compiler can see every subclass in the module and devirtualize calls.
- **Prefer generics or `some`** over `any` in performance-sensitive code, so the compiler can specialize.

```swift
final class FastRenderer {
    func render() -> String { "Rendered" }     // final class: static dispatch
}
```

## Summary

| Mechanism | Used for | Flexibility | Speed |
|---|---|---|---|
| Static | value types, `final`, extension-only protocol methods | none | fastest, inlinable |
| Vtable | overridable class methods | subclass overrides | fast |
| Witness table | protocol requirements via generics or `any` | any conforming type | fast |
| Message (`objc_msgSend`) | `@objc dynamic` members | runtime swapping | slowest |

- Protocol extension methods that aren't requirements are statically dispatched; declare them in the protocol to allow customization.
- `final`, `private`, and whole-module optimization help the compiler use static dispatch.
