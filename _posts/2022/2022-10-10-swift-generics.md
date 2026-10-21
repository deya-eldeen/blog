---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_generics_thumbnail.webp"
thumbnail_ready: true
---

Generics let you write code once and use it with many types, without giving up type safety. `Array<Element>`, `Dictionary<Key, Value>`, `Optional<Wrapped>`, and `Result<Success, Failure>` are all generic, and so are `map`, `filter`, and `sorted()`. Once you understand the handful of ideas behind them (type parameters, constraints, associated types, and how the compiler implements them), you can build the same kind of flexible, safe, and fast APIs yourself.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_generics_thumbnail.webp"
 alt_text="Matching generic container forms holding different types of values"
 caption="Generics in Swift"
 width="640"
 height="400"
%}

## The problem generics solve

Here's a function that swaps two integers:

```swift
func swapInts(_ a: inout Int, _ b: inout Int) {
    let temp = a
    a = b
    b = temp
}
```

To swap strings or doubles, you'd have to copy it for each type. Using `Any` instead would compile, but it would lose type safety: nothing would stop you from swapping an `Int` with a `String`, and you'd need casts everywhere.

## Generic functions

A generic function declares a **type parameter** in angle brackets and uses it as a placeholder:

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
print(x, y, first, second)   // 107 3 world hello
```

`T` is replaced by an actual type at each call, inferred from the arguments. Both parameters use the **same** `T`, so `swapValues(&x, &first)` doesn't compile. The type system still protects you.

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
    var isEmpty: Bool { items.isEmpty }
}

var numbers = Stack<Int>()
numbers.push(1)
numbers.push(2)
print(numbers.pop() ?? 0)   // 2

var words = Stack<String>()
words.push("generic")
```

`Stack<Int>` and `Stack<String>` are different types. Extensions can use the type parameter without redeclaring it:

```swift
extension Stack {
    var count: Int { items.count }   // `Element` and private members are available here (same file)
}
```

## Type constraints

Usually a generic function needs its type to support certain operations. **Constraints** say so, and they're what make the body compile:

```swift
func findIndex<T: Equatable>(of value: T, in array: [T]) -> Int? {
    for (index, element) in array.enumerated() where element == value {
        return index
    }
    return nil
}

func largest<T: Comparable>(_ a: T, _ b: T) -> T {
    a > b ? a : b
}

print(findIndex(of: "c", in: ["a", "b", "c"]) ?? -1)   // 2
print(largest(3, 9), largest("pear", "apple"))         // 9 pear
```

Without `T: Equatable`, the `==` wouldn't compile: the compiler can't assume every type supports equality. Constraints are how a generic function tells the compiler what it needs, and how it tells callers what they must provide.

## `where` clauses

For more complex requirements, such as relationships between several type parameters or their associated types, use a `where` clause:

```swift
func allItemsMatch<C1: Collection, C2: Collection>(_ a: C1, _ b: C2) -> Bool
    where C1.Element == C2.Element, C1.Element: Equatable {
    a.count == b.count && zip(a, b).allSatisfy { $0 == $1 }
}

print(allItemsMatch([1, 2, 3], [1, 2, 3]))      // true
print(allItemsMatch("abc", ["a", "b", "c"]))   // true: both are collections of Characters
```

`C1.Element == C2.Element` is a **same-type constraint**: the two collections may be different types (a `String` and an `[Character]`), as long as they hold the same element type.

Extensions can be constrained the same way, adding methods only when they make sense:

```swift
extension Stack where Element: Numeric {
    func sum() -> Element {
        items.reduce(0, +)
    }
}

var prices = Stack<Double>()
prices.push(1.5)
prices.push(2.5)
print(prices.sum())   // 4.0
// words.sum()        // not available: String isn't Numeric
```

## Associated types: generic protocols

Protocols can't take type parameters the way structs do. Instead, they declare **associated types**, which each conforming type fills in:

```swift
protocol Store {
    associatedtype Item
    func save(_ item: Item)
}

struct NoteStore: Store {
    func save(_ item: String) { print("Saved note: \(item)") }   // Item == String, inferred
}

func saveAll<S: Store>(_ items: [S.Item], to store: S) {
    items.forEach(store.save)
}

saveAll(["a", "b"], to: NoteStore())
```

Since Swift 5.7, protocols can mark associated types as **primary**, written like a type parameter (`protocol Store<Item>`), which enables the lightweight constrained syntax `some Store<String>`.

## `some` in parameter position

Swift 5.7 lets you write a simple generic parameter with `some`, which often reads more naturally:

```swift
func printAll(_ items: some Collection) {
    for item in items { print(item) }
}

// Exactly equivalent to:
func printAllGeneric<C: Collection>(_ items: C) {
    for item in items { print(item) }
}

func total(of values: some Collection<Int>) -> Int {
    values.reduce(0, +)
}

print(total(of: [1, 2, 3]), total(of: Set([4, 5])))   // 6 9
```

Use the explicit `<C: Collection>` form when you need to refer to the type more than once, for example to require two parameters to have the same type, or to use it in the return type.

### Passing existentials to generic functions

Also new in Swift 5.7: you can pass an `any` value to a generic function, and Swift **opens** the box, calling the function with the concrete type inside:

```swift
func describe<T: CustomStringConvertible>(_ value: T) -> String {
    "<\(value)>"
}

let something: any CustomStringConvertible = 42
print(describe(something))   // <42>
```

## Type erasure

Before `any` could hold protocols with associated types, the standard workaround was **type erasure**: a generic wrapper struct that forwards to any conforming value through closures. You'll still see it everywhere, in `AnySequence`, `AnyHashable`, and Combine's `AnyPublisher`:

```swift
protocol Validator {
    associatedtype Input
    func validate(_ input: Input) -> Bool
}

struct NonEmpty: Validator {
    func validate(_ input: String) -> Bool { !input.isEmpty }
}

struct MaxLength: Validator {
    let limit: Int
    func validate(_ input: String) -> Bool { input.count <= limit }
}

struct AnyValidator<Input>: Validator {
    private let validateClosure: (Input) -> Bool

    init<V: Validator>(_ base: V) where V.Input == Input {
        validateClosure = base.validate
    }

    func validate(_ input: Input) -> Bool { validateClosure(input) }
}

let rules: [AnyValidator<String>] = [AnyValidator(NonEmpty()), AnyValidator(MaxLength(limit: 5))]
print(rules.allSatisfy { $0.validate("swift") })     // true
print(rules.allSatisfy { $0.validate("swiftly") })   // false
```

With Swift 5.7, `[any Validator]` with a primary associated type covers many of these cases directly, but type erasers remain useful when you want a concrete, named type in your API.

## How generics are implemented

This is where Swift differs from many languages, and it explains generics' performance characteristics:

- **Unspecialized generic code** is compiled once. At runtime, the caller passes hidden extra arguments: **type metadata** for each type parameter (size, alignment, how to copy and destroy values) and **witness tables** for each constraint (the type's implementations of the protocol's requirements). The generic function uses them to manipulate values it knows nothing about at compile time. This keeps code size small and lets generics work across module boundaries.
- **Specialization**: when the compiler can see both the generic function and the concrete type at a call site, it generates a dedicated copy for that type, like `swapValues<Int>`, with direct calls and full inlining. Specialized generic code is as fast as hand-written code.

Within a module, especially with whole-module optimization, most generic code is specialized. Across modules, the compiler can only specialize functions whose bodies it can see, which is why libraries mark small public generic functions `@inlinable`.

## Generics vs. `Any` vs. existentials

| | Generics (`<T>` / `some`) | Existentials (`any P`) | `Any` |
|---|---|---|---|
| Type known at compile time | yes, per call site | no | no |
| Type safety | full | full, for the protocol's API | none: needs casts |
| Mix different types in one collection | no | yes | yes |
| Performance | best: specializable | boxing + dynamic dispatch | boxing + casting |

## Common pitfalls

- **Over-generalizing.** A generic function used with one type is just harder to read. Start concrete; generalize when a second use appears.
- **Missing constraints**, which produce confusing errors deep in the body. Add the constraint the operation needs (`Equatable`, `Hashable`, `Numeric`).
- **Using `any` in hot paths** where `some` or a generic parameter would let the compiler specialize.
- **Huge `where` clauses** that hide intent. Consider a dedicated protocol that bundles the requirements.

## Interview questions

**How do Swift generics differ from C++ templates?**
Swift type-checks generic code once, against its constraints, and can run it unspecialized using runtime metadata and witness tables; specialization is an optimization. C++ templates are instantiated and checked for each type.

**What's an associated type?**
A placeholder type in a protocol that each conforming type defines, letting protocols be generic, like `Collection.Element`.

**What is type erasure and when do you need it?**
Wrapping values of different concrete types behind one generic wrapper (`AnyPublisher`, `AnySequence`) to hide their types. Needed when you want a single concrete type, for storage or APIs, for values of different conforming types.

**Why mark public generic functions `@inlinable`?**
So clients in other modules can see the body and specialize it for their types, instead of calling the slower unspecialized version.

## Summary

- Type parameters let functions and types work with any type while keeping full type safety.
- Constraints and `where` clauses state what a type must support; constrained extensions add API only where it makes sense.
- Protocols use associated types (primary ones since Swift 5.7) for generic requirements.
- `some` parameters are shorthand for simple generics, and existentials can be opened into generic calls.
- Generic code runs with runtime metadata and witness tables, and is specialized for concrete types when the compiler can see them.
