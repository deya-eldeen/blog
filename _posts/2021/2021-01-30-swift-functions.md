---
layout: post
title: "Functions in Swift"
date: "2021-01-30"
last_modified_at: "2021-01-30"
permalink: /swift-functions/
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
  - "Functions"
---

Functions are the verbs of your code. Swift's function syntax is designed so that call sites read almost like English sentences, thanks to argument labels, and it packs in default values, variadic parameters, `inout`, and first-class function types.

<!--more-->

## Declaring and calling functions

```swift
func greet(person: String) -> String {
    "Hello, \(person)!"
}

print(greet(person: "Sam"))
```

When the body is a single expression, the `return` keyword is optional, as above.

## Argument labels and parameter names

Each parameter can have two names: an **argument label** used at the call site, and a **parameter name** used inside the function.

```swift
func move(from start: Int, to end: Int) -> Int {
    end - start
}

let distance = move(from: 3, to: 10)   // reads like a sentence
```

Use `_` to omit the label when the meaning is obvious from the function name:

```swift
func square(_ value: Int) -> Int {
    value * value
}

let nine = square(3)
```

Swift's API Design Guidelines recommend choosing labels so that calls read as grammatical phrases: `move(from:to:)`, `insert(_:at:)`, `remove(at:)`.

## Default parameter values

```swift
func connect(host: String, port: Int = 443, secure: Bool = true) -> String {
    "\(secure ? "https" : "http")://\(host):\(port)"
}

let a = connect(host: "example.com")
let b = connect(host: "localhost", port: 8080, secure: false)
```

Put parameters with defaults at the end, so the common call stays short.

## Variadic parameters

A variadic parameter accepts zero or more values, which arrive in the function as an array:

```swift
func average(_ numbers: Double...) -> Double {
    guard !numbers.isEmpty else { return 0 }
    return numbers.reduce(0, +) / Double(numbers.count)
}

let mean = average(4, 8, 15, 16, 23, 42)
```

## Multiple return values with tuples

```swift
func minMax(of values: [Int]) -> (min: Int, max: Int)? {
    guard let first = values.first else { return nil }
    var low = first, high = first
    for value in values.dropFirst() {
        low = Swift.min(low, value)
        high = Swift.max(high, value)
    }
    return (low, high)
}

if let range = minMax(of: [8, 3, 12, 5]) {
    print("From \(range.min) to \(range.max)")
}
```

Returning an optional tuple handles the empty case honestly.

## `inout` parameters

Parameters are constants. To let a function modify a caller's variable, mark the parameter `inout` and pass the argument with `&`:

```swift
func double(_ value: inout Int) {
    value *= 2
}

var score = 21
double(&score)
print(score)   // 42
```

The `&` makes the mutation visible at the call site. Prefer returning a new value when you can; reach for `inout` when updating in place is the natural model, like `swap(&a, &b)`.

## Functions are values

Every function has a type made of its parameter and return types, and you can store functions in variables or pass them around:

```swift
func add(_ a: Int, _ b: Int) -> Int { a + b }
func multiply(_ a: Int, _ b: Int) -> Int { a * b }

var operation: (Int, Int) -> Int = add
print(operation(3, 4))     // 7

operation = multiply
print(operation(3, 4))     // 12

func apply(_ op: (Int, Int) -> Int, to a: Int, and b: Int) -> Int {
    op(a, b)
}

let result = apply(add, to: 5, and: 6)
```

This is the foundation for closures and higher-order functions like `map` and `filter`, which I'll cover in the next article.

## Overloading

Functions can share a name if their parameter types or labels differ:

```swift
func describe(_ value: Int) -> String { "Int \(value)" }
func describe(_ value: String) -> String { "String \(value)" }

print(describe(1))
print(describe("one"))
```

## Nested functions

Functions can live inside other functions, hidden from the outside world and able to use the outer function's variables:

```swift
func makeCounter() -> () -> Int {
    var count = 0
    func increment() -> Int {
        count += 1
        return count
    }
    return increment
}

let counter = makeCounter()
print(counter(), counter())   // 1 2
```

## Summary

- Argument labels make call sites readable; `_` removes a label.
- Defaults, variadics, and tuple returns keep APIs compact.
- `inout` with `&` mutates a caller's variable explicitly.
- Functions are values with types, which unlocks closures and higher-order functions.
