---
layout: post
hidden: true
title: "Protocols in Swift"
date: "2022-10-01"
last_modified_at: "2022-10-01"
permalink: /swift-protocols/
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
  - "POP"
thumbnail: "images/covers/swift_protocols_thumbnail.webp"
thumbnail_ready: true
---

A protocol describes **what** a type can do, without saying **how**. Classes, structs, and enums can all adopt protocols, which makes them Swift's main tool for abstraction. The standard library is built on them, from `Equatable` and `Hashable` to `Sequence`, `Collection`, and `Codable`, and well-designed app code leans on them too: for testability, for sharing behavior without inheritance, and for writing generic algorithms.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_protocols_thumbnail.webp"
 alt_text="Different implementation modules fitting the same interface contract"
 caption="Protocols in Swift"
 width="640"
 height="400"
%}

## Declaring and adopting a protocol

```swift
protocol Describable {
    var description: String { get }
    func describe() -> String
}

struct Book: Describable {
    let title: String

    var description: String { "Book: \(title)" }

    func describe() -> String {
        "📘 \(title)"
    }
}
```

A type **conforms** to a protocol by listing it after a colon and implementing every requirement. Miss one, and the compiler tells you exactly what's missing, and Xcode can insert stubs for you.

A common style is to declare each conformance in its own extension, which keeps related code together:

```swift
struct Track {
    let title: String
    let seconds: Int
}

extension Track: Describable {
    var description: String { title }
    func describe() -> String { "🎵 \(title) (\(seconds)s)" }
}
```

## What a protocol can require

### Properties

A protocol specifies a property's name and type, and whether it must be gettable, or gettable **and** settable. It never says whether the property is stored or computed:

```swift
protocol Named {
    var name: String { get }          // satisfied by a `let`, a `var`, or a computed property
    var nickname: String { get set }  // must be settable: a `var` or a computed property with a setter
}

struct Pet: Named {
    let name: String
    var nickname: String
}
```

### Methods, including `mutating` and `static`

```swift
protocol Resettable {
    mutating func reset()
}

protocol Factory {
    static func makeDefault() -> Self
}

struct Counter: Resettable, Factory {
    var value = 0
    mutating func reset() { value = 0 }
    static func makeDefault() -> Counter { Counter() }
}
```

Mark methods `mutating` when value types may need to change `self`; classes can implement them without the keyword. `Self` (capital S) in a requirement means "the conforming type itself", which is how protocols describe factories and operations like `==`.

### Initializers

```swift
protocol Configurable {
    init(configuration: [String: String])
}

final class Theme: Configurable {
    let name: String
    init(configuration: [String: String]) {      // `final` classes don't need `required`
        name = configuration["name"] ?? "default"
    }
}
```

A non-final class implementing an initializer requirement must mark it `required`, so every subclass also provides it.

### Subscripts and associated types

A protocol can leave a type for each conforming type to decide, with `associatedtype`. Since Swift 5.7, it can also declare a **primary associated type** in angle brackets, which lets users constrain it with a lightweight syntax:

```swift
protocol Container<Item> {
    associatedtype Item
    var count: Int { get }
    mutating func append(_ item: Item)
    subscript(i: Int) -> Item { get }
}

struct Stack<Element>: Container {
    private var items: [Element] = []
    var count: Int { items.count }
    mutating func append(_ item: Element) { items.append(item) }   // Item is inferred as Element
    subscript(i: Int) -> Element { items[i] }
}
```

`Sequence`, `Collection`, and many other standard protocols declare their `Element` as a primary associated type, which is what makes `some Collection<Int>` possible.

## Using protocols as types: `some` and `any`

There are two ways to use a protocol where a type is expected, and since Swift 5.6 and 5.7 they're spelled differently:

- **`some Container<Int>`**: one specific conforming type, chosen by the caller (or by the implementation, for return values). The compiler knows the concrete type and can optimize fully.
- **`any Container<Int>`**: an **existential**, a box that can hold any conforming value, whose type can vary at runtime.

```swift
func firstItem(of container: some Container<Int>) -> Int? {
    container.count > 0 ? container[0] : nil
}

var numbers = Stack<Int>()
numbers.append(7)
print(firstItem(of: numbers) ?? -1)                 // 7

let containers: [any Container<Int>] = [numbers]    // heterogeneous storage
print(containers[0].count)                          // 1
```

Use `some` by default, and `any` when you genuinely need to store different conforming types together. Before Swift 5.7, protocols with associated types couldn't be used as existentials at all, which was the source of the infamous "can only be used as a generic constraint" error.

## Protocol extensions: default implementations

Protocols become really powerful with extensions, which provide **default implementations** shared by every conforming type:

```swift
protocol Greeter {
    var name: String { get }
    func greet() -> String
}

extension Greeter {
    func greet() -> String {
        "Hello, \(name)!"
    }
}

struct English: Greeter {
    let name: String
}

struct Pirate: Greeter {
    let name: String
    func greet() -> String { "Ahoy, \(name)!" }   // replaces the default
}

print(English(name: "Sam").greet())   // Hello, Sam!
print(Pirate(name: "Jack").greet())   // Ahoy, Jack!
```

This is the heart of **protocol-oriented programming**: instead of a base class with shared code, a protocol defines the interface and an extension supplies shared behavior, available to structs and enums as well as classes.

One important subtlety: only requirements **declared in the protocol** are dynamically dispatched. A method that exists *only* in an extension is chosen by the variable's static type, which can silently ignore a conforming type's own version. The details, and a related trap with subclasses, are in [Static vs. Dynamic Dispatch in Swift](/swift-static-vs-dynamic-dispatch/).

## Conditional conformance

A generic type can conform to a protocol only when its type parameters meet some conditions:

```swift
protocol Summarizable {
    var summary: String { get }
}

extension Int: Summarizable {
    var summary: String { "Int(\(self))" }
}

extension Array: Summarizable where Element: Summarizable {
    var summary: String {
        "[" + map(\.summary).joined(separator: ", ") + "]"
    }
}

print([1, 2].summary)     // [Int(1), Int(2)]
print([[3]].summary)      // [[Int(3)]]: arrays of arrays work too
```

That's exactly how the standard library makes `[Int]` `Equatable` (because `Int` is) while `[SomeNonEquatableType]` isn't. Note the example also shows **retroactive conformance**: we made `Int`, a type we don't own, conform to our protocol.

## Inheritance and composition

Protocols can inherit from other protocols:

```swift
protocol Identified {
    var id: String { get }
}

protocol Account: Identified, Named {
    var email: String { get }
}
```

And you can require several protocols at once with `&`:

```swift
func register(_ entity: some Named & Resettable) {
    print("Registering \(entity.name)")
}
```

Small, focused protocols composed together are usually better than one large protocol: types only implement what they actually support, and functions ask only for what they actually use.

## Class-only protocols

Add `AnyObject` to restrict a protocol to classes. That's required when you want to hold conforming instances `weak`, which is the standard pattern for delegates:

```swift
protocol PlayerDelegate: AnyObject {
    func playerDidFinish()
}

final class AudioPlayer {
    weak var delegate: PlayerDelegate?
}
```

## Synthesized conformances

For common protocols, Swift writes the implementation for you when every stored property (or associated value) already conforms:

```swift
struct Coordinate: Hashable, Codable {
    var latitude: Double
    var longitude: Double
}

enum Level: CaseIterable, Comparable {   // Comparable synthesized: ordered by declaration
    case low, medium, high
}

let visited: Set<Coordinate> = [Coordinate(latitude: 1, longitude: 2)]
print(Level.allCases.count, Level.low < .high)   // 3 true
```

`Equatable`, `Hashable`, `Codable`, `CaseIterable`, and `Comparable` (for enums without raw values) can all be synthesized. Enums with raw values must implement `<` themselves, typically by comparing `rawValue`s.

## Protocols for testability

Protocols are the main tool for making code testable. Depend on a protocol instead of a concrete class, and tests can substitute a fake:

```swift
protocol Clock {
    var now: Date { get }
}

struct SystemClock: Clock {
    var now: Date { Date() }
}

struct FixedClock: Clock {
    let now: Date
}

struct SessionValidator {
    let clock: any Clock

    func isExpired(_ expiry: Date) -> Bool {
        clock.now > expiry
    }
}

let validator = SessionValidator(clock: FixedClock(now: Date(timeIntervalSince1970: 100)))
print(validator.isExpired(Date(timeIntervalSince1970: 50)))   // true, deterministically
```

## Under the hood

Each conformance produces a **protocol witness table**: a table of the type's implementations of the protocol's requirements. Generic code and existentials call requirements through it. An `any Protocol` value is a box with room for the value (inline if it's small, otherwise heap-allocated), a pointer to its type's metadata, and a pointer to the witness table. Generic code using `some` or `<T: Protocol>` can often be **specialized** for the concrete type, skipping the table entirely.

## Common pitfalls

- **Declaring behavior only in an extension** when conforming types need to customize it. Put it in the protocol too.
- **Giant protocols** that force conforming types to implement things they don't need. Split them.
- **Reaching for `any` everywhere.** It's more flexible, but it costs boxing and dynamic dispatch, and it loses type information. Prefer `some` or generics.
- **Forgetting `AnyObject`** on delegate protocols, which prevents `weak` references.

## Interview questions

**What's the difference between `some Protocol` and `any Protocol`?**
`some` is one fixed concrete type that the compiler knows; `any` is a box that can hold any conforming type, with runtime dispatch and potential allocation.

**What is conditional conformance?**
A generic type conforming to a protocol only when its type parameters satisfy constraints, like `Array: Equatable where Element: Equatable`.

**Why do delegate protocols need `AnyObject`?**
So delegates can be held `weak`, which only works for class instances, to avoid retain cycles.

**What is retroactive conformance?**
Making a type you don't own, like `Int`, conform to a protocol, through an extension.

## Summary

- Protocols describe requirements: properties, methods (`mutating`, `static`), initializers, subscripts, and associated types.
- Structs, enums, and classes can all conform; use them as types with `some` (fixed type) or `any` (box).
- Extensions provide default implementations; only protocol requirements are dynamically dispatched.
- Conditional and retroactive conformances, composition with `&`, and `AnyObject` for class-only protocols round out the toolbox.
- Depending on protocols instead of concrete types is the key to testable code.
