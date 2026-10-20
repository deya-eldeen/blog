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

In Swift's early years, every app shipped its own copy of the Swift standard library, adding megabytes to every download, and a binary framework built with one Xcode version broke with the next. Since Swift 5, the standard library lives in the operating system, apps built with different compilers share it, and binary frameworks keep working across compiler updates. The reason is **ABI stability**, together with its siblings, **module stability** and **library evolution**. They're invisible most of the time, but they explain app sizes, `@unknown default`, `@frozen`, and why some new features need a newer OS.

<!--more-->

## API vs. ABI

- An **API** (Application *Programming* Interface) is the contract at the **source** level: names, types, and signatures that you write code against. If an API stays compatible, your code still **compiles**.
- An **ABI** (Application *Binary* Interface) is the contract at the **machine** level. If the ABI stays compatible, code that was **already compiled** still links and runs.

The Swift ABI covers many low-level decisions:

- **Calling conventions:** which registers carry arguments, return values, `self`, and errors.
- **Type layout:** the size, alignment, and field offsets of structs, enums, and class instances, including how `Optional` uses spare bits.
- **Type metadata:** the runtime records describing every type, used for generics, casting, and reflection.
- **Name mangling:** how a declaration's full identity is encoded into a symbol name.
- **Runtime functions:** retain and release, allocation, dynamic casting, and protocol conformance lookup.
- **Table layouts:** class vtables and protocol witness tables.

### Name mangling, made concrete

The linker only sees symbol names, so Swift encodes a declaration's module, type, name, argument labels, and types into one string. Here's a real symbol from a small library containing `struct Point` with a `moved(by:)` method:

```text
$s6Shapes5PointV5moved2byACSi_tF
```

`xcrun swift-demangle` decodes it:

```text
Shapes.Point.moved(by: Swift.Int) -> Shapes.Point
```

Reading it piece by piece: `6Shapes` (the module), `5PointV` (the struct `Point`), `5moved2by` (the name and label), `Si` (`Swift.Int`). Renaming a method, changing a label, or changing a parameter type changes the symbol, which is why those are ABI-breaking changes: compiled clients look for a symbol that no longer exists.

## Before Swift 5: every app brought its own runtime

Until Swift 4.2, the ABI changed with almost every release. A binary compiled with Swift 4.0 couldn't talk to a standard library compiled with Swift 4.1. The consequences:

- **Every app embedded** the Swift runtime and standard library, typically several megabytes of `libswift*.dylib` files, duplicated in every Swift app on the device.
- **Apple couldn't use Swift for public OS APIs**, because they couldn't depend on a runtime that changed every year.
- **Binary frameworks broke** whenever their users updated Xcode, so most third-party libraries were distributed as source.

## What ABI stability gave us (Swift 5.0)

Swift 5.0 froze the ABI on Apple platforms. Starting with **iOS 12.2, macOS 10.14.4, watchOS 5.2, and tvOS 12.2**, the Swift runtime and standard library ship **with the operating system**:

- **Smaller apps.** Apps targeting those OS versions no longer embed the Swift libraries.
- **Faster launches.** The system libraries are already loaded and shared between all running apps.
- **Swift-only system frameworks.** Apple can now ship APIs like SwiftUI and Combine, written in Swift with Swift-only types.
- **Cross-version compatibility.** An app built with a newer compiler runs against the older runtime in the OS, and vice versa.

### Features that need runtime support

ABI stability means old binaries keep working, but **new language features that need new runtime support** only exist in OS versions that include it. The OS's copy of the runtime can't be updated by your app.

Swift concurrency is the clearest recent example. When Swift 5.5 introduced `async`/`await` and actors in September 2021, they required iOS 15, because the concurrency runtime shipped with that OS. Xcode 13.2 (December 2021) then **back-deployed** it to iOS 13, macOS 10.15, watchOS 6, and tvOS 13: when your app targets those older systems, Xcode embeds a copy of the concurrency runtime library in the app, which is only used where the OS doesn't provide its own. That's the pattern for back-deployment: ship the missing piece with the app.

## Module stability (Swift 5.1)

ABI stability covers the **binary**. To ship a **binary framework**, there's a second problem: the compiler also has to read the framework's public interface, which used to be stored in a binary `.swiftmodule` format specific to one compiler version.

Swift 5.1 added **module stability**. With the **Build Libraries for Distribution** build setting (`BUILD_LIBRARY_FOR_DISTRIBUTION = YES`), the compiler emits a textual **`.swiftinterface`** file: Swift source describing the module's public declarations, which any later compiler can read. That's what makes XCFrameworks built with one Xcode usable from newer ones.

## Library evolution: changing a library without breaking clients

Once a library ships as a binary, its authors still want to add features without breaking apps compiled against older versions. With library evolution enabled (the same build setting), the compiler makes public types **resilient**:

- Clients **don't assume the size or layout** of resilient structs and enums. They access properties through accessor functions and ask the runtime for the type's size, instead of hard-coding offsets.
- So the library can later **add stored properties** to a struct, **add cases** to an enum, add methods, or reorder private fields, without breaking existing clients.

That flexibility has a **performance cost**: accessing a resilient type from another module goes through an extra level of indirection, and the compiler can't inline across the boundary. Two attributes trade flexibility back for speed:

- **`@frozen`** (Swift 5.1) promises a struct's stored properties, or an enum's cases, will **never change**. Clients can then lay the type out directly and access it at full speed. The standard library marks core types like `Int`, `Double`, `Array`, and `Optional` as `@frozen`.
- **`@inlinable`** (Swift 4.2) exposes a function's body to clients so they can inline and specialize it, which also makes that body part of the contract: you can change it, but old clients keep their inlined copy.

```swift
@frozen
public struct Coordinate {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

public enum Theme {          // resilient: new cases may be added in future versions,
    case light, dark          // so clients must handle `@unknown default`
}

extension Coordinate {
    @inlinable
    public var isOnEquator: Bool { latitude == 0 }   // clients can inline this
}
```

### Which changes are safe?

For a library with evolution enabled, roughly:

| Safe (ABI-compatible) | Breaking |
|---|---|
| Adding new public types, functions, and methods | Removing or renaming public declarations |
| Adding stored properties to a non-frozen struct | Changing a declaration's type or argument labels |
| Adding cases to a non-frozen enum | Adding a case to a `@frozen` enum, or a stored property to a `@frozen` struct |
| Adding a protocol requirement *with a default implementation* | Adding a protocol requirement without a default |
| Changing the body of a non-inlinable function | Removing `@frozen`, or changing an `@inlinable` body in incompatible ways |

### `@unknown default`

This explains a Swift 5 feature you meet in everyday app code. Enums from Apple's frameworks are usually **non-frozen**: Apple may add cases in future OS versions. Your compiled app might then receive a case it has never heard of. Swift asks you to handle that explicitly:

```swift
func describe(_ thermalState: ProcessInfo.ThermalState) -> String {
    switch thermalState {
    case .nominal: return "Cool"
    case .fair: return "Warm"
    case .serious: return "Hot"
    case .critical: return "Too hot"
    @unknown default: return "A state from a newer OS"
    }
}

print(describe(.nominal))
```

`@unknown default` still produces a compile-time warning if you forget a **known** case, while handling **future** cases safely at runtime.

## Does this matter for app developers?

Mostly indirectly, but in real ways:

- **Smaller app downloads** and Swift-only system frameworks come from ABI stability.
- **Availability requirements** for some features (`@available(iOS 15, *)`) often come from runtime support.
- **`@unknown default`** in switches over framework enums comes from library evolution.
- **Distributing a binary framework** (an XCFramework) requires "Build Libraries for Distribution".
- **Source packages**, which is most Swift packages, don't need any of this: they're compiled together with your app by the same compiler.

On Linux and Windows, Swift doesn't promise ABI stability, so the runtime is still shipped alongside each program.

## Interview questions

**What's the difference between API stability and ABI stability?**
API stability means existing source code keeps compiling; ABI stability means existing compiled binaries keep linking and running.

**Why did apps get smaller with Swift 5?**
The Swift runtime and standard library moved into the OS (iOS 12.2 and later), so apps targeting those versions no longer embed them.

**What's the difference between ABI stability and module stability?**
ABI stability concerns compiled code working together; module stability (Swift 5.1, `.swiftinterface` files) lets newer compilers read a binary framework's public interface.

**What does `@frozen` do, and what does it cost?**
It promises a type's layout will never change, letting clients access it directly for better performance, at the cost of never being able to add stored properties or cases.

## Summary

- API stability is about source compatibility; ABI stability is about binary compatibility.
- Since Swift 5, Apple platforms ship the Swift runtime in the OS: smaller apps, faster launches, Swift-only system frameworks.
- New runtime features need a newer OS, unless back-deployed by embedding them in the app, as Xcode 13.2 did for concurrency.
- Module stability (Swift 5.1) lets binary frameworks work across compiler versions through `.swiftinterface` files.
- Library evolution makes public types resilient; `@frozen` and `@inlinable` trade flexibility for speed, and `@unknown default` handles future enum cases.
