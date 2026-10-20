---
layout: post
title: "Advanced and Custom Operators in Swift"
date: "2021-08-18"
last_modified_at: "2021-08-18"
permalink: /swift-advanced-and-custom-operators/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Operators"
  - "Syntax"
---

Beyond `+`, `-`, and `==`, Swift has overflow operators, bitwise operators, and the ability to teach existing operators about your own types or define brand-new ones. Used carefully, operators make math-like code read naturally. Used carelessly, they turn code into puzzles. This article covers both the tools and the judgment.

<!--more-->

## Overflow operators

Swift's arithmetic operators trap on overflow instead of silently wrapping around. When wrapping is what you want, for hashing, checksums, or random number generators, use the overflow operators `&+`, `&-`, and `&*`:

```swift
var value = UInt8.max          // 255
value = value &+ 1             // 0, wrapped around
// value = UInt8.max + 1       // crash at runtime (or a compile error for a constant)

let wrappedMin = Int8.min &- 1 // 127
```

To detect overflow instead of wrapping or crashing, use the reporting methods:

```swift
let (result, didOverflow) = Int.max.addingReportingOverflow(1)
print(result, didOverflow)     // -9223372036854775808 true
```

## Operator methods for your own types

You can implement existing operators for your types by writing static functions with the operator's name:

```swift
struct Vector2D {
    var x = 0.0
    var y = 0.0
}

extension Vector2D {
    static func + (left: Vector2D, right: Vector2D) -> Vector2D {
        Vector2D(x: left.x + right.x, y: left.y + right.y)
    }

    static prefix func - (vector: Vector2D) -> Vector2D {
        Vector2D(x: -vector.x, y: -vector.y)
    }

    static func += (left: inout Vector2D, right: Vector2D) {
        left = left + right
    }

    static func * (vector: Vector2D, scalar: Double) -> Vector2D {
        Vector2D(x: vector.x * scalar, y: vector.y * scalar)
    }
}

let a = Vector2D(x: 3, y: 1)
let b = Vector2D(x: 2, y: 4)
var sum = a + b               // (5, 5)
sum += Vector2D(x: 1, y: 1)   // (6, 6)
let flipped = -a              // (-3, -1)
let scaled = a * 2            // (6, 2)
```

Compound assignment operators take their left side as `inout`. Prefix and postfix operators need the `prefix` or `postfix` modifier.

### Equality and comparison

For `==` and `<`, conform to `Equatable` and `Comparable`. Swift synthesizes `==` for structs whose properties are all `Equatable`, and derives `>`, `<=`, and `>=` from your `<`:

```swift
extension Vector2D: Equatable {}   // == synthesized

struct Version: Comparable {
    let major: Int
    let minor: Int

    static func < (lhs: Version, rhs: Version) -> Bool {
        (lhs.major, lhs.minor) < (rhs.major, rhs.minor)    // tuples compare element by element
    }
}

print(Version(major: 2, minor: 1) > Version(major: 1, minor: 9))   // true
```

## Custom operators

You can declare entirely new operators, built from characters like `/ = - + ! * % < > & | ^ ? ~`:

```swift
prefix operator +++

extension Vector2D {
    static prefix func +++ (vector: inout Vector2D) -> Vector2D {
        vector += vector
        return vector
    }
}

var toBeDoubled = Vector2D(x: 1, y: 4)
let afterDoubling = +++toBeDoubled    // (2, 8)
```

### Precedence and associativity

Infix operators belong to a **precedence group**, which decides how they bind relative to other operators. You can use an existing group or define your own:

```swift
precedencegroup ExponentiationPrecedence {
    higherThan: MultiplicationPrecedence
    associativity: right
}

infix operator **: ExponentiationPrecedence

func ** (base: Double, exponent: Double) -> Double {
    pow(base, exponent)
}

print(2 ** 3 ** 2)      // 512.0: right-associative, 2 ** (3 ** 2)
print(2 * 3 ** 2)       // 18.0: ** binds tighter than *
```

Without an explicit group, a new infix operator gets `DefaultPrecedence`, which doesn't combine with other operators without parentheses.

## Operators with generics

Operators can be generic, which is how the standard library defines `==` once for every `Equatable` type. A small, useful example is a "pipe" operator that applies a function:

```swift
precedencegroup ForwardApplication {
    associativity: left
    higherThan: AssignmentPrecedence
}

infix operator |>: ForwardApplication

func |> <Input, Output>(value: Input, transform: (Input) -> Output) -> Output {
    transform(value)
}

let shout = "hello" |> { $0.uppercased() } |> { $0 + "!" }    // HELLO!
```

## When to define operators

Good reasons:

- The type is genuinely mathematical: vectors, matrices, money, measurements, complex numbers.
- The operator's meaning matches its conventional one: `+` combines, `*` scales, `==` compares.

Bad reasons:

- Saving a few keystrokes on a method name.
- An operator whose meaning the reader has to look up. `user <~> server` is clever and unreadable.

A good test: would a new teammate guess what the operator does without looking at its definition? If not, write a method with a clear name.

## Summary

- `&+`, `&-`, and `&*` wrap on overflow; `addingReportingOverflow` detects it.
- Implement `+`, `-`, `+=`, and prefix operators as static functions on your types.
- Conform to `Equatable` and `Comparable` instead of writing comparison operators by hand.
- Custom operators need a declaration and, for infix ones, a precedence group; use them only when the meaning is obvious.
