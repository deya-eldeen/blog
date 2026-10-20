---
layout: post
title: "Generics in Swift"
date: "2022-10-10"
last_modified_at: "2022-10-10"
permalink: /swift-generics/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Generics"
  - "Type Safety"
---

Generics let you write code once and use it with many types, without giving up type safety. `Array<Element>`, `Dictionary<Key, Value>`, `Optional<Wrapped>`, and `Result<Success, Failure>` are all generic. Once you understand the handful of ideas behind them, you can build the same kind of flexible, safe APIs yourself.

<!--more-->

## The problem generics solve

Here's a function that swaps two integers:

```swift
func swapInts(_ a: inout Int, _ b: inout Int) {
    let temp = a
    a = b
    b = temp
}
```

To swap strings or doubles, you'd have to copy it for each type. Using `Any` instead would lose type safety: nothing would stop you from swapping an `Int` with a `String`.

## Generic functions

A generic function uses a **type parameter**, written in angle brackets, as a placeholder:

```swift
func swapValues<T>(_ a: inout T, _ b: inout T) {
    let temp = a
    a = b
    b = temp
}

var x = 3, y = 107
swapValues(&x, &y)

var first = "hello", second = "world"
swapValues(&first, &second)
```

`T` is replaced by the actual type at each call. Both arguments must be the **same** `T`, so swapping an `Int` with a `String` still doesn't compile.

## Generic types

```swift
struct Stack<Element> {
    private var items: [Element] = []

    mutating func push(_ item: Element) {
        items.append(item)
    }

    mutating func pop() -> Element? {
        items.popLast()
    }

    var top: Element? { items.last }
}

var numbers = Stack<Int>()
numbers.push(1)
numbers.push(2)

var words = Stack<String>()
words.push("generic")
```

`Stack<Int>` and `Stack<String>` are different types. Extensions can use the type parameter without redeclaring it:

```swift
extension Stack {
    var isEmpty: Bool { top == nil }
}
```

## Type constraints

Often a generic function needs its type to have certain capabilities. Constraints say so:

```swift
func findIndex<T: Equatable>(of value: T, in array: [T]) -> Int? {
    for (index, element) in array.enumerated() where element == value {
        return index
    }
    return nil
}

let index = findIndex(of: "c", in: ["a", "b", "c"])   // 2
```

Without `T: Equatable`, the `==` wouldn't compile: not every type can be compared for equality.

## `where` clauses

For more complex requirements, use a `where` clause:

```swift
func allItemsMatch<C1: Collection, C2: Collection>(_ a: C1, _ b: C2) -> Bool
    where C1.Element == C2.Element, C1.Element: Equatable {
    a.count == b.count && zip(a, b).allSatisfy { $0 == $1 }
}

print(allItemsMatch([1, 2, 3], [1, 2, 3]))   // true
print(allItemsMatch("abc", ["a", "b", "c"]))  // true: String and [Character] both contain Characters
```

Extensions can be constrained the same way:

```swift
extension Stack where Element: Numeric {
    func sum() -> Element {
        items.reduce(0, +)
    }
}
```

## Generics and protocols with associated types

Protocols use `associatedtype` the way generic types use type parameters:

```swift
protocol Store {
    associatedtype Item
    func save(_ item: Item)
}

struct NoteStore: Store {
    func save(_ item: String) { print("Saved \(item)") }   // Item == String
}

func saveAll<S: Store>(_ items: [S.Item], to store: S) {
    items.forEach(store.save)
}

saveAll(["a", "b"], to: NoteStore())
```

## `some` in parameters

Since Swift 5.7, a simple generic parameter can be written with `some`, which reads more naturally:

```swift
func printAll(_ items: some Collection) {
    for item in items { print(item) }
}

// Equivalent to:
func printAllGeneric<C: Collection>(_ items: C) {
    for item in items { print(item) }
}
```

Use the explicit `<C: Collection>` form when you need to refer to the type more than once, for example to require two parameters to share it.

## How generics perform

Swift compiles generic code in a way that keeps it fast. When the compiler can see the concrete types, it **specializes** the generic code, generating a version just for `Int` or `String`, and there's no overhead compared with hand-written code. When it can't, for example across module boundaries without inlining, it falls back to a shared implementation that passes type information at runtime. That's still correct, just a little slower. Marking small public generic functions `@inlinable` lets other modules specialize them.

## Real-world example: a typed cache

```swift
final class Cache<Key: Hashable, Value> {
    private var storage: [Key: Value] = [:]

    func value(for key: Key) -> Value? { storage[key] }
    func insert(_ value: Value, for key: Key) { storage[key] = value }
}

let imageCache = Cache<URL, Data>()
let userCache = Cache<Int, String>()
userCache.insert("Sam", for: 1)
```

One implementation, any key and value types, and full type checking at every call site.

## Summary

- Type parameters like `<T>` let functions and types work with any type, safely.
- Constraints (`T: Equatable`) and `where` clauses state what a type must support.
- Protocols use associated types for the same purpose.
- `some` in parameters is shorthand for simple generics; specialization keeps generic code fast.
