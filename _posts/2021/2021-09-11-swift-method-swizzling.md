---
layout: post
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
---

Method swizzling swaps the implementations of two methods at runtime, so calling one actually runs the other. It's an Objective-C runtime trick that analytics SDKs, crash reporters, and debugging tools use to hook into system classes they don't own. In Swift it still works, with limits, and it should be one of the last tools you reach for.

<!--more-->

## How it works

Objective-C classes keep a table that maps **selectors** (method names) to **implementations** (function pointers). Calling a method looks up the selector in that table at runtime. Swizzling edits the table: it exchanges the implementations of two selectors.

That means swizzling only affects methods dispatched through the Objective-C runtime, members of `NSObject` subclasses that are `@objc dynamic` or defined in Objective-C. Ordinary Swift methods are dispatched through vtables or statically, and can't be swizzled.

## A self-contained example

```swift
import Foundation
import ObjectiveC

class Greeter: NSObject {
    @objc dynamic func greet() -> String {
        "Hello"
    }

    @objc dynamic func swizzledGreet() -> String {
        // After swizzling, this selector points at the ORIGINAL implementation,
        // so this call runs the original greet(), not itself.
        let original = swizzledGreet()
        return original + ", swizzled!"
    }
}

func swizzleGreeting() {
    guard
        let originalMethod = class_getInstanceMethod(Greeter.self, #selector(Greeter.greet)),
        let swizzledMethod = class_getInstanceMethod(Greeter.self, #selector(Greeter.swizzledGreet))
    else { return }

    method_exchangeImplementations(originalMethod, swizzledMethod)
}

let greeter = Greeter()
print(greeter.greet())    // Hello

swizzleGreeting()
print(greeter.greet())    // Hello, swizzled!
```

The call to `swizzledGreet()` inside itself looks like infinite recursion, but after the exchange, that selector points at the original implementation. This is the classic swizzling idiom.

## Swizzling a system class

The real-world use case is adding behavior to a class you don't own, for example logging every screen that appears. On iOS that looks like this:

```swift
// In an iOS app target:
// extension UIViewController {
//     @objc func tracked_viewDidAppear(_ animated: Bool) {
//         tracked_viewDidAppear(animated)                  // runs the original
//         print("Appeared: \(type(of: self))")
//     }
//
//     static func enableScreenTracking() {
//         guard
//             let original = class_getInstanceMethod(UIViewController.self, #selector(viewDidAppear(_:))),
//             let swizzled = class_getInstanceMethod(UIViewController.self, #selector(tracked_viewDidAppear(_:)))
//         else { return }
//         method_exchangeImplementations(original, swizzled)
//     }
// }
```

Call `enableScreenTracking()` **once**, early, for example at app launch. Swizzling twice swaps the implementations back.

## Rules for doing it safely

1. **Swizzle exactly once.** Objective-C code uses `+load` or `dispatch_once` for this. In Swift, use a `static let` (initialized once, thread-safely) or call it from one known place at launch.
2. **Always call the original implementation** unless you deliberately replace the behavior. Otherwise you break the class.
3. **Prefix your method names** (`tracked_…`) to avoid colliding with other libraries' swizzled methods.
4. **Watch out for subclasses.** If you swizzle a method a subclass inherits but doesn't define, `class_getInstanceMethod` finds the superclass's method, and you may end up swizzling the superclass. Robust implementations use `class_addMethod` first.
5. **Never swizzle in production what you could do another way.**

## Swift-native alternative: `@_dynamicReplacement`

Swift has an underscored, unofficial feature, `dynamic` with `@_dynamicReplacement(for:)`, that replaces Swift methods without the Objective-C runtime. It powers Xcode Previews' hot reloading. Underscored attributes aren't stable API, so don't build production code on them.

## Why to avoid swizzling

- **It's global and invisible.** Anyone reading the code calling `viewDidAppear` has no idea it was replaced.
- **It's fragile.** A system update can change private behavior your swizzle depends on.
- **Libraries collide.** Two SDKs swizzling the same method can conflict in confusing ways.
- **It may be rejected or break.** Swizzling private APIs can cause App Store issues and crashes.

Before swizzling, consider:

- **subclassing**, like a `BaseViewController`,
- **composition**, like a child view controller or a coordinator,
- **delegates and notifications** the framework already offers,
- **protocols with default implementations.**

## Summary

- Swizzling exchanges method implementations in the Objective-C runtime's selector table.
- It only works for Objective-C-dispatched methods: `@objc dynamic` members and Objective-C classes.
- Swizzle once, call the original implementation, prefix names, and be careful with subclasses.
- It's powerful for SDKs and debugging tools, but prefer explicit alternatives in app code.
