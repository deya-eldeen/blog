---
layout: post
title: "Reflection in Swift with Mirror"
date: "2023-12-01"
last_modified_at: "2023-12-01"
permalink: /swift-reflection-with-mirror/
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
  - "Debugging"
---

Reflection is a program looking at its own structure at runtime: "what properties does this value have, and what's in them?" Swift's reflection is deliberately limited and read-only, and it lives in one type: `Mirror`. It's what powers `print` and `dump`, Xcode's debugger descriptions, and many debugging and logging helpers.

<!--more-->

## Creating a mirror

```swift
struct User {
    let name: String
    let age: Int
    var isAdmin = false
}

let user = User(name: "Sam", age: 32)
let mirror = Mirror(reflecting: user)

for child in mirror.children {
    print("\(child.label ?? "?"): \(child.value)")
}
// name: Sam
// age: 32
// isAdmin: false
```

Each child has an optional `label` (the property name, when there is one) and a `value` of type `Any`.

## What a mirror tells you

```swift
print(mirror.subjectType)      // User
print(mirror.displayStyle!)    // struct
print(mirror.children.count)   // 3
```

`displayStyle` is one of `.struct`, `.class`, `.enum`, `.tuple`, `.optional`, `.collection`, `.dictionary`, or `.set`. It's `nil` for types without a special style.

Mirrors work on everything, with different kinds of children:

```swift
let point = (x: 3, y: 4)
for child in Mirror(reflecting: point).children {
    print(child.label ?? "", child.value)    // x 3, then y 4 (tuple labels)
}

let numbers = [10, 20, 30]
print(Mirror(reflecting: numbers).children.map { $0.value })   // [10, 20, 30], unlabeled

enum Status {
    case loaded(count: Int)
}
let status = Status.loaded(count: 5)
for child in Mirror(reflecting: status).children {
    print(child.label ?? "", child.value)    // loaded (count: 5)
}
```

## Classes and superclasses

For classes, `children` only includes the properties declared in that class. Inherited properties are reached through `superclassMirror`:

```swift
class Vehicle {
    let wheels = 4
}

final class Car: Vehicle {
    let brand = "Volvo"
}

let carMirror = Mirror(reflecting: Car())
print(carMirror.children.map { $0.label ?? "" })                       // ["brand"]
print(carMirror.superclassMirror?.children.map { $0.label ?? "" } ?? [])  // ["wheels"]
```

## A practical helper: generic debug descriptions

Reflection is great for debugging output that doesn't need to be maintained by hand:

```swift
func describe(_ value: Any, indent: String = "") -> String {
    let mirror = Mirror(reflecting: value)
    guard !mirror.children.isEmpty else { return "\(value)" }

    var lines = ["\(mirror.subjectType)"]
    for child in mirror.children {
        let nested = describe(child.value, indent: indent + "  ")
        lines.append("\(indent)  \(child.label ?? "-"): \(nested)")
    }
    return lines.joined(separator: "\n")
}

struct Order {
    let id: Int
    let customer: User
}

print(describe(Order(id: 7, customer: user)))
```

The standard library's `dump(_:)` does something similar and is often all you need. It prefixes type names with their module, here an app called `MyApp`:

```swift
dump(user)
// ▿ MyApp.User
//   - name: "Sam"
//   - age: 32
//   - isAdmin: false
```

## Customizing a type's mirror

Conform to `CustomReflectable` to control what reflection shows, for example to hide sensitive data from logs:

```swift
struct Credentials: CustomReflectable {
    let username: String
    let password: String

    var customMirror: Mirror {
        Mirror(self, children: ["username": username, "password": "••••••"])
    }
}

dump(Credentials(username: "sam", password: "hunter2"))
// ▿ MyApp.Credentials
//   - username: "sam"
//   - password: "••••••"
```

## What `Mirror` can't do

Swift's reflection is intentionally narrow:

- **Read-only.** You can't change a property through a mirror.
- **No methods.** You can't list or call methods by name.
- **No creating instances** from a type name.
- **Not for performance-sensitive code.** Every value is boxed as `Any`, and walking children is slow compared with direct access.

For dynamic method calls, Objective-C runtime APIs exist on `NSObject` subclasses. For most needs that people solve with reflection in other languages, Swift has safer alternatives:

| Need | Swift alternative |
|---|---|
| Serialization | `Codable` |
| Accessing properties dynamically but safely | key paths, like `\User.name` |
| Generating repetitive code | macros |
| Equality and hashing for all properties | synthesized `Equatable` and `Hashable` |

## Summary

- `Mirror(reflecting:)` lists a value's children with optional labels, its type, and its display style.
- Classes expose inherited properties through `superclassMirror`.
- `dump` prints a reflected tree; `CustomReflectable` customizes or redacts it.
- Reflection is read-only and slow: use it for debugging and tooling, and prefer `Codable`, key paths, and macros elsewhere.
