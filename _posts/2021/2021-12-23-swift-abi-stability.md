---
layout: post
title: "ABI Stability in Swift"
date: "2021-12-23"
last_modified_at: "2021-12-23"
permalink: /swift-abi-stability/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Runtime"
  - "Frameworks"
---

In the early years of Swift, every app shipped with its own copy of the Swift standard library, adding megabytes to every download. Since Swift 5, that's gone: the standard library lives in the operating system, and apps built with different Swift versions all use it. The reason is **ABI stability**, one of the most important and least visible milestones in Swift's history.

<!--more-->

## API vs. ABI

- An **API** (Application *Programming* Interface) is the contract at the source level: the names, types, and signatures you write code against. If an API stays the same, your code **compiles**.
- An **ABI** (Application *Binary* Interface) is the contract at the machine level: how functions are called, how values are laid out in memory, how names are mangled into symbols, how metadata and reference counts are represented. If the ABI stays the same, already-compiled code **links and runs**.

Two binaries can only work together if they agree on the ABI.

## Before Swift 5

Before Swift 5, the ABI changed with almost every release. A binary built with Swift 4 couldn't talk to a standard library built with Swift 4.2, so every app had to embed the exact runtime and standard library it was compiled with. That meant:

- bigger apps, with several megabytes of Swift libraries per app,
- no Swift APIs in Apple's own OS frameworks, since they couldn't depend on a runtime that kept changing,
- binary frameworks that broke whenever their users updated Xcode.

## What ABI stability gave us (Swift 5.0)

Swift 5 froze the ABI on Apple platforms. Since iOS 12.2, macOS 10.14.4, watchOS 5.2, and tvOS 12.2, the Swift runtime and standard library **ship with the OS**. As a result:

- Apps no longer embed the Swift libraries, so they're smaller and launch faster.
- Apple can build OS frameworks in Swift and expose Swift-only APIs, like SwiftUI, Combine, and Swift Concurrency.
- An app compiled with a newer Swift compiler runs against the older Swift runtime in the OS, and vice versa.

New language features that need runtime support are the exception: they only work on OS versions that include that support. That's why some features come with availability requirements, like Swift concurrency's original requirement of iOS 15 before it was back-deployed to iOS 13.

## Module stability (Swift 5.1)

ABI stability covers the binary. To ship **binary frameworks**, the compiler also needs to read a framework's public interface across compiler versions. Swift 5.1 added **module stability**: with the **Build Libraries for Distribution** build setting, the compiler emits a textual `.swiftinterface` file instead of relying only on the binary `.swiftmodule` format. Any later compiler can read that interface.

That's what makes XCFrameworks built with one Xcode usable by people on newer ones.

## Library evolution: changing a library without breaking clients

Once a library is shipped in binary form, its authors still want to add features without breaking apps that were compiled against older versions. With library evolution enabled:

- Public structs and enums are **resilient** by default. Clients don't assume their size or layout, so the library can add stored properties or enum cases later.
- That flexibility costs a little performance, because clients access resilient types indirectly.
- `@frozen` opts a type back out: it promises the layout will never change, so clients can access it directly and fast. The standard library marks core types like `Int` and `Array` as `@frozen`.
- `@inlinable` exposes a function's body to clients for optimization, which also freezes that body as part of the ABI.

```swift
@frozen
public struct Point2 {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public enum Theme {          // resilient: new cases may be added later,
    case light, dark          // so clients must handle `@unknown default`
}
```

That last point explains `@unknown default` in switches over system enums: Apple may add cases in future OS versions, and your compiled app must handle them gracefully.

## Does this matter for app developers?

Mostly indirectly:

- **Smaller apps** and Swift-only system frameworks come from it.
- **`@unknown default`** in switches over framework enums comes from it.
- **Distributing binary frameworks** requires "Build Libraries for Distribution".
- **Source packages** (most Swift packages) don't need any of this: they're compiled together with your app.

On Linux and Windows, Swift doesn't promise ABI stability, so the standard library is still shipped with each app.

## Summary

- API stability means source compatibility; ABI stability means binary compatibility.
- Since Swift 5, Apple platforms ship the Swift runtime in the OS, making apps smaller and enabling Swift-only system frameworks.
- Module stability (Swift 5.1) lets binary frameworks work across compiler versions via `.swiftinterface` files.
- Library evolution makes public types resilient; `@frozen` and `@inlinable` trade flexibility for speed.
