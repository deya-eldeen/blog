---
layout: post
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
---

A protocol describes *what* a type can do, without saying *how*. Classes, structs, and enums can all adopt protocols, which makes them Swift's main tool for abstraction: the standard library is built on protocols like `Equatable`, `Hashable`, `Sequence`, and `Codable`, and your own code can be too.

<!--more-->

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

A type **conforms** to a protocol by listing it after a colon and implementing every requirement. Miss one, and the compiler tells you exactly what's missing.

## Property requirements

A protocol specifies a property's name, type, and whether it must be gettable, or gettable *and* settable. It never says whether the property is stored or computed:

```swift
protocol Named {
    var name: String { get }          // a `let`, a `var`, or a computed property
    var nickname: String { get set }  // must be settable
}

struct Pet: Named {
    let name: String
    var nickname: String
}
```

## Method and initializer requirements

```swift
protocol Resettable {
    mutating func reset()
}

protocol Configurable {
    init(configuration: [String: String])
}

struct Counter: Resettable {
    var value = 0
    mutating func reset() { value = 0 }
}
```

Mark methods `mutating` when value types may need to change `self`; classes can implement them without the keyword. Classes that implement an initializer requirement must mark it `required`, so subclasses also provide it.

## Protocols as types

You can use a protocol as the type of a variable, parameter, or collection element. Write `any` in front to make it clear it's an **existential**, a box that can hold any conforming value:

```swift
let items: [any Describable] = [Book(title: "Swift"), Book(title: "Rust")]

for item in items {
    print(item.describe())
}
```

The alternative, `some Describable`, means "one specific type that conforms". The difference matters for performance and for protocols with associated types, and it's worth an article of its own.

## Protocol extensions: default implementations

Protocols become really powerful with extensions, which can provide **default implementations** for every conforming type:

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
    func greet() -> String { "Ahoy, \(name)!" }   // overrides the default
}

print(English(name: "Sam").greet())   // Hello, Sam!
print(Pirate(name: "Jack").greet())   // Ahoy, Jack!
```

One subtlety: only methods declared **in the protocol itself** are dynamically dispatched. A method that exists *only* in an extension is chosen by the static type, which can surprise you. See [Static vs. Dynamic Dispatch in Swift](/swift-static-vs-dynamic-dispatch/).

## Inheritance and composition

Protocols can inherit from other protocols:

```swift
protocol Identifiable2 {
    var id: String { get }
}

protocol User: Identifiable2, Named {
    var email: String { get }
}
```

And you can require several protocols at once with `&`:

```swift
func register(_ entity: some Named & Resettable) {
    print("Registering \(entity.name)")
}
```

## Class-only protocols

Add `AnyObject` to restrict a protocol to classes. That's required when you want to hold conforming instances `weak`, as with delegates:

```swift
protocol PlayerDelegate: AnyObject {
    func playerDidFinish()
}

final class Player {
    weak var delegate: PlayerDelegate?
}
```

## Associated types

A protocol can leave a type for the conforming type to decide, using `associatedtype`:

```swift
protocol Container {
    associatedtype Item
    var count: Int { get }
    mutating func append(_ item: Item)
    subscript(i: Int) -> Item { get }
}

struct IntStack: Container {
    private var items: [Int] = []
    var count: Int { items.count }
    mutating func append(_ item: Int) { items.append(item) }   // Item is inferred as Int
    subscript(i: Int) -> Int { items[i] }
}
```

`Sequence` and `Collection` use exactly this pattern with `Element`. Associated types and generics work hand in hand.

## Conformance synthesis

For common protocols, Swift writes the conformance for you when all stored properties already conform:

```swift
struct Coordinate: Hashable, Codable {
    var latitude: Double
    var longitude: Double
}

let set: Set<Coordinate> = [Coordinate(latitude: 1, longitude: 2)]
```

`Equatable`, `Hashable`, `Comparable` (for enums), `Codable`, and `CaseIterable` can all be synthesized.

## Summary

- Protocols describe requirements: properties, methods, initializers, subscripts.
- Structs, enums, and classes can all conform, and you can use protocols as types with `any` or `some`.
- Extensions add default implementations, turning protocols into reusable behavior.
- `AnyObject` restricts a protocol to classes; associated types make protocols generic.
