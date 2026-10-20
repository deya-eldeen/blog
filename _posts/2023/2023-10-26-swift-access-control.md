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
---

Access control decides which parts of your code can see which other parts. It lets a type hide its implementation details behind a small, deliberate interface, so the rest of the app can't depend on things you might want to change later. Swift has six access levels, and choosing the right one is part of designing good APIs.

<!--more-->

## Modules and source files

Swift's access control is built on two units:

- A **module** is a unit of code distribution: an app target, a framework, or a Swift package target. You bring another module in with `import`.
- A **source file** is a single `.swift` file within a module.

## The access levels

From most open to most restrictive:

| Level | Visible to |
|---|---|
| `open` | Everyone. Other modules can also **subclass and override** it. Classes and class members only. |
| `public` | Everyone, but other modules can't subclass or override it. |
| `package` | Every module in the same Swift package (Swift 5.9+). |
| `internal` | Everything in the same module. **This is the default.** |
| `fileprivate` | Only the current source file. |
| `private` | Only the enclosing declaration, plus its extensions in the same file. |

Because `internal` is the default, a single-module app works fine without writing any access modifiers. They matter most when you build frameworks and packages, and when you want to protect a type's invariants.

## `private` for implementation details

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
```

Because `readings` is private, nothing outside can append an invalid value. The type's rules are enforced in one place.

`private` members are also visible in extensions of the same type **in the same file**, so you can split a type into extensions without widening access:

```swift
extension TemperatureLog {
    var count: Int { readings.count }   // allowed: same type, same file
}
```

## `fileprivate`

`fileprivate` shares something between several types in one file, for example a helper used by two closely related types:

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
```

## Read-only from outside: `private(set)`

A property can have a more restrictive setter than getter:

```swift
final class DownloadProgress {
    private(set) var fraction = 0.0           // readable everywhere, writable only here

    func update(received: Int, total: Int) {
        fraction = Double(received) / Double(total)
    }
}
```

For a public type, write `public private(set) var fraction`.

## `public` vs. `open`

Both make a class visible outside its module. The difference is inheritance:

```swift
open class BaseViewModel {
    public init() {}
    open func load() {}            // other modules may override this
    public func reset() {}         // other modules may call, but not override
}
```

`open` is a promise: you're committing to support subclasses you've never seen. Use `public` unless subclassing is part of your design. Structs and enums can't be subclassed, so they only use `public`.

Note that a `public` type doesn't make its members public. Each member you want to expose needs its own `public`, including the initializer: the memberwise initializer of a public struct is still `internal`.

## `package` for multi-module packages

When one Swift package has several targets, `package` lets them share APIs without exposing those APIs to the package's users:

```swift
package struct CacheKey {
    package let rawValue: String
}
```

## The guiding principle

A declaration can't be more visible than the types it uses. For example, a `public` function can't take a parameter of a `private` type, because callers couldn't name it. The compiler checks this for you.

## Testing internal code

Unit tests live in a separate module, so they can't see `internal` declarations by default. `@testable import` gives the test target access to everything `internal` in the module under test:

```swift
// In a test file:
// @testable import MyApp
```

It requires the module to be built with testing enabled, which Debug builds are by default.

## Practical guidelines

- Start private. Widen access only when something outside actually needs it.
- Use `private(set)` for state that others read but shouldn't change directly.
- In frameworks, think of every `public` declaration as a promise you'll have to keep.
- Use `final` together with access control: `public final class` says "use me, but don't subclass me".

## Summary

- Six levels: `open`, `public`, `package`, `internal` (the default), `fileprivate`, `private`.
- `private` hides details, even across extensions in the same file.
- `private(set)` makes properties read-only from outside.
- `open` allows subclassing from other modules; `public` doesn't.
