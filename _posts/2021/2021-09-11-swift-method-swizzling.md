---
layout: post
hidden: true
title: "Method Swizzling in Swift"
date: "2021-09-11"
last_modified_at: "2021-09-11"
permalink: /swift-method-swizzling/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Objective-C"
  - "Runtime"
thumbnail: "images/covers/swift_method_swizzling_thumbnail.webp"
thumbnail_ready: true
---

Method swizzling swaps the implementation behind a method at runtime, so calling one method actually runs different code. It's an Objective-C runtime technique that analytics SDKs, crash reporters, accessibility tools, and debugging utilities use to hook into classes they don't own, like `UIViewController`. It still works from Swift, but with important limits, and it should be one of the last tools you reach for. This article explains how it works, how to do it correctly, and why it so often goes wrong.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_method_swizzling_thumbnail.webp"
 alt_text="Crossed dispatch connections exchanging two method implementations"
 caption="Method Swizzling in Swift"
 width="640"
 height="400"
%}

## How Objective-C finds a method

To understand swizzling, you need a mental model of Objective-C's dynamic dispatch:

- A **selector** (`SEL`) is a method's name, like `viewDidAppear:`.
- An **implementation** (`IMP`) is a C function pointer to the method's code.
- Each class has a **method list** mapping selectors to implementations, plus a pointer to its superclass.
- Calling a method compiles to `objc_msgSend(object, selector, …)`. At runtime, it looks up the selector in the object's class (with a per-class cache to make repeated lookups fast), walks up the superclass chain if needed, and jumps to the implementation it finds.

Because the selector-to-implementation mapping lives in mutable runtime data, you can change it while the app runs. **Swizzling is editing that table.**

## Which Swift methods can be swizzled

Swift classes don't use `objc_msgSend` for ordinary method calls. Swift uses static dispatch or vtables, which the Objective-C runtime can't touch. A method is only affected by swizzling when it's called through the Objective-C runtime:

| Declaration | Called from Objective-C | Called from Swift |
|---|---|---|
| Plain Swift method | not visible | not swizzlable |
| `@objc func` | swizzled | **not swizzled**: Swift calls it directly |
| `@objc dynamic func` | swizzled | swizzled: Swift sends a message |
| Method from an Objective-C class (UIKit, Foundation) | swizzled | swizzled |

The middle row is the trap. `@objc` only *exposes* a method to the runtime; Swift code calling it still uses Swift's own dispatch. Here's the proof:

```swift
import Foundation
import ObjectiveC

class Greeter: NSObject {
    @objc func greet() -> String { "Hello" }
    @objc func swizzledGreet() -> String { "Hello, swizzled!" }
}

if let original = class_getInstanceMethod(Greeter.self, #selector(Greeter.greet)),
   let replacement = class_getInstanceMethod(Greeter.self, #selector(Greeter.swizzledGreet)) {
    method_exchangeImplementations(original, replacement)
}

let greeter = Greeter()
print(greeter.greet())                                               // Hello: Swift's direct call ignores the swizzle
print(greeter.perform(#selector(Greeter.greet))!.takeUnretainedValue()) // Hello, swizzled!: a message send sees it
```

For your own Swift methods to be reliably swizzled, they must be `@objc dynamic`, which forces every call through `objc_msgSend`.

## The classic idiom

The standard pattern exchanges the original implementation with a new method that **calls itself** to reach the original:

```swift
class Tracker: NSObject {
    @objc dynamic func trackScreen() -> String {
        "screen tracked"
    }

    @objc dynamic func logged_trackScreen() -> String {
        // After the exchange, this selector points at the ORIGINAL implementation,
        // so this call runs the original trackScreen(), not this method again.
        let result = logged_trackScreen()
        return "[log] " + result
    }
}

if let original = class_getInstanceMethod(Tracker.self, #selector(Tracker.trackScreen)),
   let logged = class_getInstanceMethod(Tracker.self, #selector(Tracker.logged_trackScreen)) {
    method_exchangeImplementations(original, logged)
}

print(Tracker().trackScreen())   // [log] screen tracked
```

`logged_trackScreen()` calling itself looks like infinite recursion, but after the exchange, its selector points at the original implementation. This is the idiom you'll see in every swizzling codebase.

## Doing it safely: the inherited-method problem

`class_getInstanceMethod` searches **superclasses** too. If you swizzle a method that a class *inherits* but doesn't define itself, `method_exchangeImplementations` changes the superclass's method, affecting every other subclass. The robust approach tries to add the method to the target class first:

```swift
func swizzle(_ cls: AnyClass, original: Selector, swizzled: Selector) {
    guard let originalMethod = class_getInstanceMethod(cls, original),
          let swizzledMethod = class_getInstanceMethod(cls, swizzled) else { return }

    // If `cls` only inherits `original`, add it to `cls` with the new implementation...
    let didAddMethod = class_addMethod(cls, original,
                                       method_getImplementation(swizzledMethod),
                                       method_getTypeEncoding(swizzledMethod))
    if didAddMethod {
        // ...and point the swizzled selector at the inherited original.
        class_replaceMethod(cls, swizzled,
                            method_getImplementation(originalMethod),
                            method_getTypeEncoding(originalMethod))
    } else {
        // `cls` defines `original` itself: a plain exchange is safe.
        method_exchangeImplementations(originalMethod, swizzledMethod)
    }
}

class BaseScreen: NSObject {
    @objc dynamic func render() -> String { "Rendered" }
}

class ProfileScreen: BaseScreen {
    @objc dynamic func tracked_render() -> String { "[tracked] " + tracked_render() }
}

swizzle(ProfileScreen.self, original: #selector(BaseScreen.render), swizzled: #selector(ProfileScreen.tracked_render))
print(ProfileScreen().render())   // [tracked] Rendered
print(BaseScreen().render())      // Rendered: the superclass is untouched
```

## Swizzle exactly once

Swizzling twice swaps the implementations **back**, silently undoing your work. Objective-C code uses `+load` or `dispatch_once`; in Swift, `dispatch_once` isn't available, but a `static let` is initialized exactly once, thread-safely:

In a real app, this replaces the direct `swizzle(…)` call from the previous example, rather than running in addition to it:

```swift
enum ScreenTracking {
    static let install: Void = {
        swizzle(ProfileScreen.self, original: #selector(BaseScreen.render),
                swizzled: #selector(ProfileScreen.tracked_render))
    }()
}

// Call as early as possible, e.g. in application(_:didFinishLaunchingWithOptions:)
_ = ScreenTracking.install
_ = ScreenTracking.install   // second access does nothing
```

## A real-world example: screen tracking

The classic use case is logging every screen that appears, without touching every view controller:

```swift
// In an iOS app target:
//
// extension UIViewController {
//     @objc func tracked_viewDidAppear(_ animated: Bool) {
//         tracked_viewDidAppear(animated)                 // runs the original viewDidAppear
//         print("Appeared: \(type(of: self))")
//     }
//
//     static let enableScreenTracking: Void = {
//         swizzle(UIViewController.self,
//                 original: #selector(UIViewController.viewDidAppear(_:)),
//                 swizzled: #selector(UIViewController.tracked_viewDidAppear(_:)))
//     }()
// }
```

`UIViewController` is an Objective-C class, so every call to `viewDidAppear(_:)`, including UIKit's own, goes through `objc_msgSend` and sees the swizzle.

## Alternative: replacing with a block

Instead of adding a second selector, you can replace an implementation with a closure, keeping a reference to the original `IMP` to call it:

```swift
class Clock: NSObject {
    @objc dynamic func now() -> String { "12:00" }
}

if let method = class_getInstanceMethod(Clock.self, #selector(Clock.now)) {
    typealias NowFunction = @convention(c) (AnyObject, Selector) -> String
    let originalIMP = method_getImplementation(method)
    let originalFunction = unsafeBitCast(originalIMP, to: NowFunction.self)

    let block: @convention(block) (AnyObject) -> String = { object in
        "frozen " + originalFunction(object, #selector(Clock.now))
    }
    method_setImplementation(method, imp_implementationWithBlock(block))
}

print(Clock().now())   // frozen 12:00
```

This avoids polluting the class with extra selectors, at the cost of unsafe casting: the `@convention(c)` signature must exactly match the method, including the hidden `self` and `_cmd` parameters.

## Isa swizzling

A related technique changes the **class** of a single object instead of a method of the whole class, using `object_setClass`. That's how Key-Value Observing works: when you observe an object, the runtime creates a hidden subclass (named like `NSKVONotifying_YourClass`) with overridden setters that send notifications, and switches the observed object's class to it. Only that object is affected, not the whole class.

## Why to avoid swizzling

- **It's global and invisible.** Nothing at the call site tells a reader that `viewDidAppear` was replaced. Debugging gets confusing fast.
- **It's fragile.** You depend on implementation details of someone else's class. An OS update can change or remove the method you hooked.
- **Libraries collide.** Two SDKs swizzling the same method in different orders can break each other, sometimes only on some devices.
- **Ordering problems.** Swizzling after some objects already cached method implementations, or on a background thread while others call the method, can produce inconsistent behavior.
- **Review risk.** Swizzling private API methods can get an app rejected, and can crash when that private API changes.

## Alternatives to consider first

1. **Subclassing**: a `BaseViewController` that tracks screens, if you control the hierarchy.
2. **Composition**: a child view controller or helper object that observes lifecycle events.
3. **Delegates and notifications** the framework already provides, like `UINavigationControllerDelegate` for screen transitions.
4. **Protocols with default implementations**, for behavior you control.
5. **Method replacement in tests only**, where the global effect is scoped and reversible.

Swizzling is justified when you ship an SDK that must observe behavior in apps you don't control, or for debugging tools. In app code, an explicit design is almost always better.

## Interview questions

**What is method swizzling?**
Changing the implementation a selector maps to at runtime, usually by exchanging two methods' implementations with `method_exchangeImplementations`.

**Why doesn't swizzling affect some Swift calls?**
Swift calls `@objc` methods directly or through a vtable unless they're `dynamic`, bypassing `objc_msgSend`. Only message sends see the swizzled implementation.

**Why does the swizzled method appear to call itself?**
After the exchange, its selector points at the original implementation, so the "recursive" call actually runs the original.

**What goes wrong if you swizzle twice?**
The implementations are exchanged back, undoing the swizzle. Swizzle exactly once, for example from a `static let`.

## Summary

- Objective-C dispatch maps selectors to implementations at runtime; swizzling edits that mapping.
- From Swift, only `@objc dynamic` methods and Objective-C classes' methods are reliably swizzled.
- Use `class_addMethod` before exchanging to avoid changing a superclass, and swizzle exactly once.
- `method_setImplementation` with a block and isa swizzling (KVO) are related techniques.
- Prefer explicit designs; reserve swizzling for SDKs, debugging tools, and tests.
