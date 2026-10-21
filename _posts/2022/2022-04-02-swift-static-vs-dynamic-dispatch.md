---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_static_vs_dynamic_dispatch_thumbnail.webp"
thumbnail_ready: true
---

When your code calls a method, the program has to decide *which* implementation runs. Sometimes the compiler knows at compile time: that's **static dispatch**. Sometimes it can only be decided at runtime, based on the actual type of the value: that's **dynamic dispatch**. Swift uses four different mechanisms, and knowing which one applies explains a few notorious protocol bugs, why `final` makes code faster, and how features like KVO and swizzling are even possible.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_static_vs_dynamic_dispatch_thumbnail.webp"
 alt_text="A direct call path beside a call routed through a runtime lookup table"
 caption="Static vs. Dynamic Dispatch in Swift"
 width="640"
 height="400"
%}

## Static dispatch

With static (or direct) dispatch, the compiler knows the exact function to call and emits a direct call to it. Even better, it can **inline** the function, copying its body into the caller, which unlocks further optimizations like constant folding and removing redundant retains.

Swift uses static dispatch for:

- methods of **structs and enums** (value types can't be subclassed),
- **`final`** methods, and all methods of `final` classes,
- `private` and `fileprivate` class members, when the compiler can see they aren't overridden,
- methods defined **only** in protocol extensions (not declared in the protocol),
- free functions and `static` methods of value types.

```swift
struct Calculator {
    func add(_ a: Int, _ b: Int) -> Int { a + b }   // statically dispatched, inlinable
}

print(Calculator().add(2, 3))
```

## Dynamic dispatch, mechanism 1: class vtables

Each class has a **virtual table** (vtable): an array of function pointers for its overridable methods. A subclass copies its parent's table and replaces the entries it overrides. Calling an overridable method loads the object's class, indexes into the table, and jumps to whatever function is there:

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

The cost is an indirect call, a few instructions. The bigger cost is what it prevents: the compiler can't inline a call when it doesn't know which function will run.

## Mechanism 2: protocol witness tables

When code works with a protocol, either through a generic parameter or an existential (`any Protocol`), the concrete type isn't known at that point. Each conformance has a **protocol witness table**: a table of that type's implementations ("witnesses") of the protocol's requirements. A call to a requirement looks up the right function in the table:

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

An `any Greeter` value is a box holding the value plus pointers to its type metadata and witness table. When the compiler *can* see the concrete type, for example in a generic function it has specialized for `English`, it turns the witness-table call back into a static call.

## Mechanism 3: Objective-C message sending

Members marked `@objc dynamic` (and all methods of Objective-C classes) are called through the Objective-C runtime's `objc_msgSend`, which looks up the method by its **selector** (name) at runtime, using per-class caches. It's the most flexible mechanism, and the slowest, but it's what makes runtime tricks possible: KVO swaps an object's class for a hidden subclass, and [method swizzling](/swift-method-swizzling/) swaps method implementations, because the lookup happens by name at call time.

Note that `@objc` alone only **exposes** a method to Objective-C. Swift code still calls an `@objc` method through its vtable, unless it's also `dynamic`.

## The protocol extension surprise

Here's the behavior that catches almost every Swift developer at some point. A method declared **in the protocol** is a requirement, dispatched through the witness table. A method that exists **only in an extension** is a plain function, dispatched **statically** based on the variable's declared type:

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
print(abstract.draw())       // Circle draw: requirement, looked up at runtime
print(abstract.describe())   // Default describe: extension-only, chosen by the static type!
```

`Circle.describe()` doesn't override anything. It **shadows** the extension method, and which one runs depends on how the value is typed at the call site. The fix: if conforming types should be able to customize a method, **declare it in the protocol**, and keep the extension as the default implementation.

## The subclass surprise

A related, even sneakier bug involves classes. If a base class gets a protocol requirement from a **default implementation**, and a subclass later adds its own version, the subclass's method is ignored whenever the call goes through the protocol, or even through the base class type:

```swift
protocol Welcomer {
    func welcome() -> String
}

extension Welcomer {
    func welcome() -> String { "default welcome" }
}

class BaseScreen: Welcomer {}             // uses the default implementation

class HomeScreen: BaseScreen {
    func welcome() -> String { "home welcome" }   // not an override of anything
}

let viaProtocol: any Welcomer = HomeScreen()
let viaBase: BaseScreen = HomeScreen()
let viaSubclass = HomeScreen()

print(viaProtocol.welcome())   // default welcome
print(viaBase.welcome())       // default welcome
print(viaSubclass.welcome())   // home welcome
```

`BaseScreen`'s witness table points at the extension's default, and `HomeScreen.welcome()` is a new method, not an override (there was nothing in `BaseScreen`'s vtable to override). The fix is to implement the method in the base class, so subclasses can `override` it:

```swift
class FixedBaseScreen: Welcomer {
    func welcome() -> String { "base welcome" }
}

class FixedHomeScreen: FixedBaseScreen {
    override func welcome() -> String { "home welcome" }
}

let fixed: any Welcomer = FixedHomeScreen()
print(fixed.welcome())   // home welcome
```

## Making code faster: helping the compiler choose static dispatch

The compiler uses static dispatch whenever it can prove which implementation will run. You can help it:

- **Mark classes `final`** unless they're designed for subclassing. It's the easiest win, and it documents intent.
- **Use `private` and `fileprivate`** where possible: the compiler can see the whole file and prove there are no overrides.
- **Enable whole-module optimization** (the default for Release builds): the compiler sees every file in the module at once and can prove that `internal` classes and methods are never overridden, devirtualizing their calls.
- **Prefer generics over `any` in hot code.** Generic functions can be **specialized** for concrete types, turning witness-table calls into direct, inlinable calls. Existentials always go through the box.

```swift
final class FastRenderer {
    func render() -> String { "Rendered" }   // final: statically dispatched
}

func renderAll<T: Drawable>(_ items: [T]) -> [String] {
    items.map { $0.draw() }   // specialized per T when the call site is visible
}

print(renderAll([Circle(), Circle()]))
```

Keep the scale in mind: an indirect call costs nanoseconds. Dispatch matters in tight loops, like rendering, parsing, and numeric code, and almost never in UI event handlers. Measure with Instruments before contorting a design for it.

## Summary table

| Mechanism | Used for | Flexibility | Speed |
|---|---|---|---|
| Static | value types, `final`, `private`, extension-only protocol methods | none | fastest, inlinable |
| Vtable | overridable class methods | subclass overrides | fast (indirect call) |
| Witness table | protocol requirements via generics or `any` | any conforming type | fast (indirect call) |
| Message (`objc_msgSend`) | `@objc dynamic` members, Objective-C classes | swizzling, KVO, runtime lookup | slowest |

## Interview questions

**Why does a method defined only in a protocol extension sometimes not get "overridden"?**
It isn't a requirement, so it's statically dispatched based on the variable's static type. Conforming types' methods with the same name only shadow it. Declare it in the protocol to make it dynamically dispatched.

**How does `final` improve performance?**
It guarantees no overrides, so the compiler can call the method directly and inline it instead of looking it up in the vtable.

**What's a protocol witness table?**
A per-conformance table of function pointers implementing a protocol's requirements, used to call requirements when the concrete type isn't statically known.

**When does Swift use `objc_msgSend`?**
For `@objc dynamic` members and methods of Objective-C classes. Plain `@objc` members are still called from Swift through vtables.

## Summary

- Static dispatch calls a known function directly and allows inlining; Swift uses it for value types, `final`, `private`, and extension-only protocol methods.
- Classes dispatch overridable methods through vtables; protocols use witness tables; `@objc dynamic` uses Objective-C messaging.
- Extension-only protocol methods are chosen by static type; declare customizable methods in the protocol.
- A subclass can't customize a protocol requirement its superclass got from a default implementation, unless the superclass implements it.
- `final`, `private`, whole-module optimization, and generics help the compiler use static dispatch.
