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

Reflection is a program inspecting its own structure at runtime: "what properties does this value have, and what's in them?" Swift's reflection is deliberately limited and read-only, and it lives in one type: `Mirror`. It's what powers `print`, `dump`, Xcode's variable views in the debugger, and many debugging, logging, and snapshot-testing tools. Knowing what it shows, and what it hides, makes it a useful tool rather than a mysterious one.

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

Each child has an optional `label`, the property name when there is one, and a `value` of type `Any`.

## What a mirror tells you

```swift
print(mirror.subjectType)      // User
print(mirror.displayStyle!)    // struct
print(mirror.children.count)   // 3
```

`displayStyle` is one of `.struct`, `.class`, `.enum`, `.tuple`, `.optional`, `.collection`, `.dictionary`, or `.set`, and `nil` for types without a special style, like `Int`.

Mirrors work on everything, and each kind of value has its own kind of children:

```swift
let point = (x: 3, y: 4)
for child in Mirror(reflecting: point).children {
    print(child.label ?? "", child.value)                   // x 3, then y 4
}

print(Mirror(reflecting: (1, "a")).children.map { $0.label ?? "nil" })   // [".0", ".1"]

let numbers = [10, 20, 30]
print(Mirror(reflecting: numbers).children.map { $0.value })            // [10, 20, 30], unlabeled

enum Status {
    case loaded(count: Int)
}
for child in Mirror(reflecting: Status.loaded(count: 5)).children {
    print(child.label ?? "", child.value)                   // loaded (count: 5)
}
```

Unlabeled tuple elements get labels like `.0` and `.1`; collection elements have no label; an enum value has one child, labeled with the case name, holding its associated values.

## What's included, and what isn't

A mirror shows **stored** data, using the names the compiler actually stores, which is sometimes revealing:

```swift
@propertyWrapper
struct Clamped {
    var wrappedValue: Int
}

struct Item {
    let name = "Pen"
    var price = 2.5
    var total: Double { price * 2 }   // computed
    lazy var cached = 42
    @Clamped var stock: Int = 3
}

print(Mirror(reflecting: Item()).children.map { $0.label ?? "nil" })
// ["name", "price", "$__lazy_storage_$_cached", "_stock"]
```

- **Computed properties are absent**, since they store nothing.
- A **lazy** property appears as its hidden optional storage, `$__lazy_storage_$_cached`.
- A **property-wrapped** property appears as the wrapper's storage, `_stock`, holding the wrapper itself.

So reflection reflects memory layout, not the public interface. Don't build features that depend on these internal names.

## Classes and superclasses

For classes, `children` only includes properties declared in that class. Inherited properties are reached through `superclassMirror`:

```swift
class Vehicle {
    let wheels = 4
}

final class Car: Vehicle {
    let brand = "Volvo"
}

let carMirror = Mirror(reflecting: Car())
print(carMirror.children.map { $0.label ?? "" })                          // ["brand"]
print(carMirror.superclassMirror?.children.map { $0.label ?? "" } ?? [])  // ["wheels"]
```

A complete walk over an object means following `superclassMirror` until it's `nil`.

## Reaching nested values: `descendant`

`descendant(_:)` follows a path of labels (or integer indices) through nested values:

```swift
struct Order { let customer: Customer }
struct Customer { let address: Address }
struct Address { let city: String }

let order = Order(customer: Customer(address: Address(city: "Amman")))
print(Mirror(reflecting: order).descendant("customer", "address", "city") ?? "none")   // Amman
```

It returns `nil` if any step doesn't exist, which makes it handy for quick lookups in debugging and test assertions.

## A practical helper: generic debug descriptions

Reflection is great for debugging output that doesn't need to be maintained by hand as types change:

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

struct Invoice {
    let id: Int
    let customer: User
}

print(describe(Invoice(id: 7, customer: user)))
// Invoice
//   id: 7
//   customer: User
//     name: Sam
//     age: 32
//     isAdmin: false
```

The standard library's `dump(_:)` does something similar and is often all you need:

```swift
dump(user)
// ▿ MyApp.User
//   - name: "Sam"
//   - age: 32
//   - isAdmin: false
```

Related: `String(describing:)` uses a type's `description` (what `print` shows), while `String(reflecting:)` uses its `debugDescription`, falling back to reflection. That's why `print("hi")` shows `hi` but `String(reflecting: "hi")` shows `"hi"` with quotes.

## Customizing a type's mirror

Conform to `CustomReflectable` to control what reflection shows: hide internal details, present a friendlier structure, or **redact sensitive data** from logs and debugger views:

```swift
struct Credentials: CustomReflectable {
    let username: String
    let password: String

    var customMirror: Mirror {
        Mirror(self, children: ["username": username, "password": "••••••"], displayStyle: .struct)
    }
}

dump(Credentials(username: "sam", password: "hunter2"))
// ▿ MyApp.Credentials
//   - username: "sam"
//   - password: "••••••"
```

Since `dump`, the debugger's summaries, and many logging tools use mirrors, this protects secrets in more places than overriding `description` alone would.

## What `Mirror` can't do

Swift's reflection is intentionally narrow:

- **Read-only.** You can't change a property through a mirror.
- **No methods.** You can't list or call methods by name.
- **No creating instances** from a type name.
- **Not for hot paths.** Every value is boxed as `Any`, and walking children is far slower than direct property access.

For dynamic method calls, the Objective-C runtime works on `NSObject` subclasses. For most problems that other languages solve with reflection, Swift has safer, faster tools:

| Need | Swift alternative |
|---|---|
| Serialization | `Codable` |
| Accessing properties dynamically but safely | key paths, like `\User.name` |
| Generating repetitive code | macros (Swift 5.9) |
| Equality and hashing for all properties | synthesized `Equatable` and `Hashable` |
| Debug descriptions | `CustomStringConvertible`, `CustomDebugStringConvertible` |

## Interview questions

**What can `Mirror` tell you about a value?**
Its type (`subjectType`), its kind (`displayStyle`), and its stored children with labels and values, plus the superclass's children for classes.

**Why don't computed properties show up in a mirror?**
Mirrors reflect stored data; computed properties have no storage.

**How do you hide a password from `dump` and debugger output?**
Conform to `CustomReflectable` and return a custom mirror with the value redacted.

**What can't Swift reflection do?**
Modify values, enumerate or call methods, or create instances; it's read-only and slow, meant for debugging and tooling.

## Summary

- `Mirror(reflecting:)` lists a value's stored children with labels, plus its type and display style.
- Computed properties are absent; lazy and wrapped properties appear under their hidden storage names.
- Classes expose inherited properties through `superclassMirror`; `descendant` follows nested paths.
- `dump` prints a reflected tree; `CustomReflectable` customizes or redacts it.
- Reflection is read-only and slow: use it for debugging and tooling, and prefer `Codable`, key paths, and macros elsewhere.
