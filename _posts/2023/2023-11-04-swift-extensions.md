---
layout: post
title: "Extensions in Swift"
date: "2023-11-04"
last_modified_at: "2023-11-04"
permalink: /swift-extensions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Protocols"
  - "Syntax"
---

Extensions add new functionality to an existing type, even one you don't own, like `Int`, `String`, or `UIColor`. They're also how Swift developers organize their own types: one extension per protocol conformance, one per area of responsibility. Used well, they make code read like a set of tidy chapters.

<!--more-->

## Extending a type you don't own

```swift
extension Double {
    var km: Double { self * 1_000 }
    var m: Double { self }
    var cm: Double { self / 100 }
}

let marathon = 42.195.km
print(marathon)       // 42195.0 meters
```

Every `Double` in your module now has these properties, without subclassing and without access to `Double`'s source code.

## What extensions can add

- computed properties, both instance and `static`,
- instance and type methods, including `mutating` methods,
- new initializers,
- subscripts,
- nested types,
- protocol conformances.

```swift
extension Int {
    mutating func square() {
        self = self * self
    }

    subscript(digitIndex: Int) -> Int {
        var base = 1
        for _ in 0..<digitIndex { base *= 10 }
        return (self / base) % 10
    }

    enum Kind {
        case negative, zero, positive
    }

    var kind: Kind {
        switch self {
        case 0: .zero
        case let x where x > 0: .positive
        default: .negative
        }
    }
}

var three = 3
three.square()                 // 9
print(746381295[0])            // 5
print((-7).kind)               // negative
```

## What extensions can't do

- **Add stored properties.** An extension can't change a type's memory layout. Use computed properties, or store the data elsewhere.
- **Override** existing functionality.
- **Add designated initializers to classes**; only convenience initializers. Designated initializers must stay in the class's main declaration.

## Initializers in extensions

For structs, an initializer in an extension keeps the automatic memberwise initializer available:

```swift
struct Size {
    var width = 0.0
    var height = 0.0
}

extension Size {
    init(square side: Double) {
        self.init(width: side, height: side)
    }
}

let a = Size(width: 2, height: 3)   // memberwise, still available
let b = Size(square: 4)
```

## Protocol conformance in extensions

A very common pattern is to add each conformance in its own extension, which keeps the related code grouped:

```swift
struct Track {
    let title: String
    let duration: Int
}

extension Track: CustomStringConvertible {
    var description: String {
        "\(title) (\(duration / 60):\(String(format: "%02d", duration % 60)))"
    }
}

extension Track: Comparable {
    static func < (lhs: Track, rhs: Track) -> Bool {
        lhs.duration < rhs.duration
    }
}

print(Track(title: "Intro", duration: 95))   // Intro (1:35)
```

## Protocol extensions

Extending a **protocol** adds behavior to every conforming type at once. This is the heart of protocol-oriented programming:

```swift
extension Collection {
    var isNotEmpty: Bool { !isEmpty }
}

print([1, 2, 3].isNotEmpty)     // true
print("".isNotEmpty)            // false
```

## Constrained extensions

Add a `where` clause to apply an extension only when certain conditions hold:

```swift
extension Array where Element: Numeric {
    func sum() -> Element {
        reduce(0, +)
    }
}

extension Collection where Element == String {
    func joinedWithCommas() -> String {
        joined(separator: ", ")
    }
}

print([1, 2, 3].sum())                  // 6
print(["a", "b"].joinedWithCommas())    // a, b
// ["x"].sum()                          // not available: String isn't Numeric
```

Conditional conformance uses the same idea at the protocol level: `Array` is `Equatable` only when its elements are.

## Organizing your own types

Extensions are also great for structure inside your own code:

```swift
final class SettingsViewModel {
    private(set) var items: [String] = []
}

// MARK: - Loading
extension SettingsViewModel {
    func load() { items = ["Theme", "Notifications"] }
}

// MARK: - Actions
extension SettingsViewModel {
    func reset() { items.removeAll() }
}
```

Xcode's `// MARK:` comments show up in the jump bar, so each extension becomes a navigable section.

## A word of caution

Extending standard types is powerful but global within a module. Keep helper names specific, avoid adding many top-level conveniences to `String` or `Array` that only one screen needs, and be careful in frameworks, where a `public` extension on a standard type can clash with other libraries' extensions.

## Summary

- Extensions add methods, computed properties, initializers, subscripts, nested types, and conformances to any type.
- They can't add stored properties, override existing members, or add designated class initializers.
- Protocol extensions add behavior to every conforming type; `where` clauses constrain them.
- Use extensions to group conformances and responsibilities in your own code.
