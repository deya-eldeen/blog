---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_advanced_and_custom_operators_thumbnail.webp"
thumbnail_ready: true
---

Operators are just functions with special syntax. Beyond the everyday `+`, `-`, and `==`, Swift has overflow operators, masking shifts, and a fully extensible operator system: you can teach existing operators to work with your own types, or define brand-new operators with their own precedence. Used carefully, operators make math-like code read naturally. Used carelessly, they turn code into puzzles. This article covers both the mechanics and the judgment.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_advanced_and_custom_operators_thumbnail.webp"
 alt_text="Modular tiles for arithmetic, overflow-aware addition, and a custom operator"
 caption="Advanced and Custom Operators in Swift"
 width="640"
 height="400"
%}

## Arithmetic details worth knowing

A few rules of Swift's basic arithmetic regularly surprise people coming from other languages:

```swift
print(-7 / 2)       // -3: integer division truncates toward zero
print(-7 % 2)       // -1: the remainder takes the sign of the left operand
print(7 % -2)       // 1
print((0.1 + 0.2) == 0.3)   // false: binary floating point can't represent 0.1 exactly
```

- **Integer division truncates toward zero**, so `-7 / 2` is `-3`, not `-4`.
- **`%` is a remainder, not a modulo.** Its sign follows the dividend. For a true modulo of a negative number, use `((a % n) + n) % n`.
- **Floating-point equality** is rarely what you want. Compare with a tolerance, or use `Decimal` for money.
- **Mixed types don't combine implicitly.** `Int + Double` doesn't compile; convert explicitly: `Double(count) * price`.

## Overflow operators

Swift's arithmetic operators **trap** on overflow instead of silently wrapping around. That turns a whole class of subtle bugs into immediate, obvious crashes:

```swift
let maxByte = UInt8.max          // 255
// let tooBig = maxByte + 1      // traps at runtime (or is a compile error for constants)
```

When wrapping is what you actually want, for hashing, checksums, or pseudo-random generators, use the **overflow operators** `&+`, `&-`, and `&*`:

```swift
print(UInt8.max &+ 1)            // 0
print(UInt8.min &- 1)            // 255
print(Int8.max &+ 1)             // -128
print(Int16(300) &* 300)         // 24464: 90000 wrapped into 16 bits
```

To detect overflow without trapping or wrapping silently, use the reporting methods, which return the wrapped result and a flag:

```swift
let (product, didOverflow) = UInt8(200).multipliedReportingOverflow(by: 2)
print(product, didOverflow)      // 144 true
```

## Shifts: smart and masking

The `<<` and `>>` operators are "smart shifts": shifting by more than the bit width gives a well-defined result (all zeros, or all ones for negative numbers shifted right), instead of undefined behavior as in C:

```swift
let one: UInt8 = 1
print(one << 9)      // 0: shifted out entirely
print(one &<< 9)     // 2: masking shift, uses 9 % 8 = 1 as the shift amount
```

The masking shifts `&<<` and `&>>` match what the CPU's shift instruction does, which makes them slightly faster in tight bit-twiddling code.

## Operator methods for your own types

You implement an existing operator for your type by writing a **static function** whose name is the operator. Infix operators take two parameters; prefix and postfix operators take one and need the `prefix` or `postfix` modifier; compound assignment operators take their left side as `inout`:

```swift
struct Vector2D {
    var x = 0.0
    var y = 0.0
}

extension Vector2D {
    static func + (left: Vector2D, right: Vector2D) -> Vector2D {
        Vector2D(x: left.x + right.x, y: left.y + right.y)
    }

    static func - (left: Vector2D, right: Vector2D) -> Vector2D {
        Vector2D(x: left.x - right.x, y: left.y - right.y)
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

    static func * (scalar: Double, vector: Vector2D) -> Vector2D {
        vector * scalar             // so both 2 * v and v * 2 work
    }
}

let a = Vector2D(x: 3, y: 1)
let b = Vector2D(x: 2, y: 4)
var sum = a + b               // (5, 5)
sum += Vector2D(x: 1, y: 1)   // (6, 6)
let flipped = -a              // (-3, -1)
let scaled = 2 * a            // (6, 2)
print(sum, flipped, scaled)
```

You can't overload the assignment operator `=` or the ternary operator `?:`; everything else is fair game.

### Equality and comparison: use the protocols

For `==` and `<`, conform to `Equatable` and `Comparable` rather than writing free-standing operators. You get synthesis, consistency with the standard library, and a long list of algorithms (`sorted()`, `max()`, `contains(_:)`) for free:

```swift
extension Vector2D: Equatable {}   // == synthesized from x and y

struct Version: Comparable {
    let major: Int
    let minor: Int

    static func < (lhs: Version, rhs: Version) -> Bool {
        (lhs.major, lhs.minor) < (rhs.major, rhs.minor)   // tuples compare element by element
    }
}

print(Version(major: 2, minor: 1) > Version(major: 1, minor: 9))   // true: >, <=, >= are derived from <
```

Since Swift 5.3, enums without associated values (or whose associated values are `Comparable`) get `Comparable` synthesized too, ordered by declaration:

```swift
enum ShirtSize: Comparable {
    case small, medium, large
}

print(ShirtSize.small < .large)                          // true
print([ShirtSize.large, .small, .medium].sorted() == [.small, .medium, .large])   // true
```

## Custom operators

You can declare entirely new operators, built from the characters `/ = - + ! * % < > & | ^ ? ~` (and some Unicode math symbols). First declare the operator globally, then implement it:

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
print(afterDoubling)
```

### Precedence and associativity

Every infix operator belongs to a **precedence group**, which decides how tightly it binds relative to other operators, and whether a chain like `a ** b ** c` groups to the left or the right. The standard library's groups, from tightest to loosest:

| Precedence group | Operators |
|---|---|
| `BitwiseShiftPrecedence` | `<<`, `>>`, `&<<`, `&>>` |
| `MultiplicationPrecedence` | `*`, `/`, `%`, `&`, `&*` |
| `AdditionPrecedence` | `+`, `-`, `|`, `^`, `&+`, `&-` |
| `RangeFormationPrecedence` | `...`, `..<` |
| `CastingPrecedence` | `is`, `as`, `as?`, `as!` |
| `NilCoalescingPrecedence` | `??` |
| `ComparisonPrecedence` | `<`, `<=`, `>`, `>=`, `==`, `!=`, `===`, `!==`, `~=` |
| `LogicalConjunctionPrecedence` | `&&` |
| `LogicalDisjunctionPrecedence` | `||` |
| `TernaryPrecedence` | `?:` |
| `AssignmentPrecedence` | `=`, `+=`, `-=`, and friends |

A new infix operator can join an existing group, or define its own. Here's exponentiation, which should bind tighter than `*` and group to the right, as in mathematics:

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

Without an explicit group, a new infix operator gets `DefaultPrecedence`, which sits just above `TernaryPrecedence` and has no associativity, so `a <> b <> c` would require parentheses.

## Generic operators

Operators can be generic, which is how the standard library defines `==` once for every `Equatable` type. A small, popular example is a forward "pipe" operator that applies a function to a value:

```swift
precedencegroup ForwardApplication {
    associativity: left
    higherThan: AssignmentPrecedence
}

infix operator |>: ForwardApplication

func |> <Input, Output>(value: Input, transform: (Input) -> Output) -> Output {
    transform(value)
}

let shout = "hello" |> { $0.uppercased() } |> { $0 + "!" }
print(shout)    // HELLO!
```

## How operators are found

Operator **declarations** (`infix operator **`) are global: they tell the parser how to read the symbols. Operator **implementations** are ordinary functions, and Swift looks them up like other overloads: global functions, plus static functions on the types involved. Defining operators as `static` members inside an extension of your type keeps them organized and discoverable, and it's required when you implement a protocol requirement like `Equatable`'s `==`.

Heavy operator overloading can slow down type checking: with many overloads of `+` and literals in a long expression, the compiler has many combinations to try. If you see "the compiler is unable to type-check this expression in reasonable time", break the expression up or add type annotations.

## When to define operators

Good reasons:

- The type is genuinely mathematical: vectors, matrices, complex numbers, money, measurements.
- The operator means what it conventionally means: `+` combines, `*` scales, `==` compares, `<` orders.

Bad reasons:

- Saving a few keystrokes on a method name.
- An operator whose meaning a reader has to look up. `user <~> server` is clever and unreadable.

A good test: would a new teammate guess what the operator does without reading its definition? If not, write a method with a clear name.

## Interview questions

**Why does `Int.max + 1` crash in Swift?**
Arithmetic operators check for overflow and trap, rather than silently wrapping. Use `&+` to wrap or `addingReportingOverflow` to detect.

**What's the difference between `%` in Swift and a mathematical modulo?**
`%` is a remainder whose sign follows the left operand, so `-7 % 2` is `-1`.

**How do precedence groups work?**
Each infix operator belongs to a group that declares its relative precedence (`higherThan`/`lowerThan`) and associativity, which the parser uses to group expressions.

**How do you add `<`, `<=`, `>`, and `>=` to your type?**
Conform to `Comparable` and implement only `<` (and `==`, or let `Equatable` synthesize it); the rest are derived.

## Summary

- Integer division truncates, `%` is a remainder, and arithmetic traps on overflow.
- `&+`, `&-`, `&*` wrap; `…ReportingOverflow` detects; `&<<` and `&>>` are masking shifts.
- Implement operators as static functions on your types; conform to `Equatable` and `Comparable` instead of hand-writing comparisons.
- Custom operators need a declaration and, for infix operators, a precedence group with associativity.
- Define operators only when their meaning is obvious to every reader.
