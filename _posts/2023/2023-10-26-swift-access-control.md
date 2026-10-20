---
layout: post
title: "Access Control in Swift"
date: "2023-10-26"
last_modified_at: "2023-10-26"
permalink: /swift-access-control/
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
  - "Architecture"
thumbnail: "images/covers/swift_access_control_thumbnail.webp"
thumbnail_ready: true
---

Access control decides which parts of your code can see which other parts. It lets a type hide its implementation behind a small, deliberate interface, so the rest of the app can't depend on details you might want to change, and can't break the rules the type relies on. Swift has six access levels, built around two units: the **module** and the **source file**. Choosing the right level is a big part of designing APIs that stay easy to change.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_access_control_thumbnail.webp"
 alt_text="Nested visibility boundaries exposing selected interface connections"
 caption="Access Control in Swift"
 width="640"
 height="400"
%}

## Modules and source files

- A **module** is a unit of code distribution: an app target, a framework, or a Swift package target. Code from another module is brought in with `import`.
- A **source file** is a single `.swift` file within a module.

## The six access levels

From most open to most restrictive:

| Level | Visible to |
|---|---|
| `open` | Everyone. Other modules can also **subclass and override**. Classes and class members only. |
| `public` | Everyone, but other modules can't subclass or override. |
| `package` | Every module in the same Swift package (Swift 5.9). |
| `internal` | Everything in the same module. **This is the default.** |
| `fileprivate` | Only the current source file. |
| `private` | Only the enclosing declaration, plus its extensions in the same file. |

Because `internal` is the default, a single-module app works without writing any access modifiers. They matter most in two situations: when you **build frameworks and packages** that others import, and when you want to **protect a type's invariants** even within your own module.

## `private`: hide implementation details

```swift
struct TemperatureLog {
    private var readings: [Double] = []

    mutating func record(_ value: Double) {
        guard (-90...60).contains(value) else { return }   // validated in one place
        readings.append(value)
    }

    var average: Double? {
        readings.isEmpty ? nil : readings.reduce(0, +) / Double(readings.count)
    }
}

var log = TemperatureLog()
log.record(21)
log.record(500)              // rejected: outside the plausible range
print(log.average ?? 0)      // 21.0
```

Because `readings` is private, nothing outside the type can append an invalid value, so `average` can trust its data. That's the real purpose of access control: rules enforced in one place, instead of hoped for everywhere.

`private` members are also visible in **extensions of the same type in the same file**, so you can split a type into extensions without widening access:

```swift
extension TemperatureLog {
    var count: Int { readings.count }   // allowed: same type, same file
}
```

## `fileprivate`: share within one file

`fileprivate` lets several types in one file share a helper, without exposing it to the rest of the module:

```swift
fileprivate func normalized(_ name: String) -> String {
    name.trimmingCharacters(in: .whitespaces).lowercased()
}

struct Tag {
    let name: String
    init(_ raw: String) { name = normalized(raw) }
}

struct Category {
    let name: String
    init(_ raw: String) { name = normalized(raw) }
}

print(Tag("  Swift ").name, Category("iOS").name)   // swift ios
```

Use it sparingly: a growing pile of `fileprivate` helpers is often a sign that the file contains a small module that wants to be its own type.

## Read-only from outside: `private(set)`

A property can have a more restrictive **setter** than getter:

```swift
final class DownloadProgress {
    private(set) var fraction = 0.0           // readable everywhere, writable only here

    func update(received: Int, total: Int) {
        fraction = total > 0 ? Double(received) / Double(total) : 0
    }
}

let progress = DownloadProgress()
progress.update(received: 50, total: 200)
print(progress.fraction)                      // 0.25
// progress.fraction = 1                      // ❌ the setter is private
```

For a public type, combine them: `public private(set) var fraction`. `fileprivate(set)` and `internal(set)` work the same way.

## Public APIs

### `public` types don't make their members public

Marking a type `public` only makes the **type** visible. Each member you want to expose needs its own `public`, which keeps the default safe: nothing leaks by accident.

That includes initializers. A **public struct's memberwise initializer is still `internal`**, so other modules can't create instances until you write a public one:

```swift
public struct Point {
    public var x: Int
    public var y: Int

    public init(x: Int, y: Int) {   // required for other modules to create Points
        self.x = x
        self.y = y
    }
}
```

Without that explicit `init`, a client module importing this one gets: *"'Point' initializer is inaccessible due to 'internal' protection level"*.

### `public` vs. `open`

Both make a class visible outside its module. The difference is **inheritance** across the module boundary:

```swift
open class BaseViewModel {
    public init() {}
    open func load() {}            // other modules may override this
    public func reset() {}         // other modules may call it, but not override it
}
```

`open` is a strong promise: you're committing to support subclasses you've never seen, which means every internal call to an `open` method might run someone else's code. Use `public` unless subclassing is part of your design. Structs and enums can't be subclassed, so they only use `public`.

## `package`: share across a package's modules (Swift 5.9)

Large Swift packages are often split into several targets. Before Swift 5.9, sharing code between them meant making it `public`, which also exposed it to every client of the package. `package` fills that gap: visible to all modules in the same package, invisible outside it.

```swift
package struct CacheKey {
    package let rawValue: String

    package init(rawValue: String) {
        self.rawValue = rawValue
    }
}
```

Swift Package Manager passes the package's identity to the compiler automatically, so `package` just works for targets in the same `Package.swift`.

## The guiding principle

Swift's rules all follow from one principle: **no entity can be defined in terms of another entity that's more restrictive.** A `public` function can't take or return an `internal` type, because callers in other modules couldn't name it:

```swift
struct InternalToken {}

// public func makeToken() -> InternalToken { InternalToken() }
// ❌ function cannot be declared public because its result uses an internal type
```

Similar rules apply elsewhere:

- A tuple type is as visible as its *least* visible element.
- A subclass can't be more visible than its superclass.
- A type's members default to the type's level, capped at `internal`: members of a `private` type are effectively private.
- An **override can be more visible** than the method it overrides, for example a `fileprivate` method overridden as `public` in a subclass.

## Access control and protocols

Every requirement of a protocol automatically has the protocol's access level, and a conforming type must implement each requirement with at least that visibility. A `public` protocol adopted by a `public` type therefore needs `public` implementations. You can't make individual requirements more private than the protocol itself.

## Testing internal code

Unit tests live in a separate module, so they normally can't see `internal` declarations. `@testable import` gives a test target access to everything `internal` in the module under test:

```swift
// In a test file:
// @testable import MyApp
```

It requires the module to be built with testing enabled, which Debug builds are by default. It doesn't expose `private` or `fileprivate` members, which encourages testing through a type's real interface.

## Practical guidelines

- **Start private.** Widen access only when something outside actually needs it. It's easy to make something more visible later; making it less visible breaks callers.
- **Use `private(set)`** for state others read but shouldn't change directly.
- **In frameworks, treat every `public` declaration as a promise** you'll have to keep, possibly for years.
- **Combine with `final`**: `public final class` says "use me, but don't subclass me".
- **Keep `fileprivate` for genuine file-level helpers**, not as a workaround for an overly large type.

## Interview questions

**What's the default access level in Swift?**
`internal`: visible anywhere in the same module.

**What's the difference between `private` and `fileprivate`?**
`private` limits access to the enclosing declaration and its extensions in the same file; `fileprivate` allows the whole file.

**Why isn't a public struct's memberwise initializer usable from other modules?**
Memberwise initializers are `internal` at most. You must write an explicit `public init`.

**What's the difference between `public` and `open`?**
Both are visible to other modules, but only `open` classes and members can be subclassed or overridden there.

**What does `package` add?**
Visibility across all modules of the same Swift package, without exposing declarations to the package's clients (Swift 5.9).

## Summary

- Six levels: `open`, `public`, `package`, `internal` (the default), `fileprivate`, `private`.
- `private` hides details, even across extensions in the same file; `private(set)` makes properties read-only from outside.
- Public types need public members and a public initializer; `open` adds cross-module subclassing.
- `package` (Swift 5.9) shares code between a package's modules without making it public.
- Nothing can be more visible than the types it uses; start private and widen deliberately.
