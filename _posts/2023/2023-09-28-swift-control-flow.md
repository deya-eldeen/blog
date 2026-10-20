---
layout: post
title: "Control Flow in Swift: if, guard, switch, and Loops"
date: "2023-09-28"
last_modified_at: "2023-09-28"
permalink: /swift-control-flow/
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
  - "Syntax"
---

Control flow decides which code runs and how many times. Swift's toolbox looks familiar if you've used any C-style language, but almost every tool has a twist that makes code safer or shorter: conditions must be real booleans, `switch` must be exhaustive and doesn't fall through, `guard` keeps early exits tidy, and since Swift 5.9, `if` and `switch` can even be used as expressions that produce a value.

<!--more-->

## `if`, `else if`, `else`

```swift
let temperature = 31

if temperature > 30 {
    print("Hot")
} else if temperature < 10 {
    print("Cold")
} else {
    print("Pleasant")
}
```

The condition must be a real `Bool`. Unlike C, Swift won't treat `0`, an empty string, or `nil` as false, so `if count { … }` doesn't compile. That removes a whole category of bugs, like accidentally testing an assignment instead of a comparison.

You can combine several conditions with commas. They're evaluated left to right, and evaluation stops at the first one that fails:

```swift
let username: String? = "sam"
let isActive = true

if let name = username, isActive, name.count > 2 {
    print("Welcome back, \(name)")
}
```

### Unwrapping with `if let`

`if let` runs a block only when an optional has a value, binding the unwrapped value for use inside. Since Swift 5.7, when the new name is the same as the optional's, you can write it once:

```swift
let input = "42"

if let number = Int(input) {
    print("Got \(number)")
}

let nickname: String? = "Sam"
if let nickname {                // shorthand for `if let nickname = nickname`
    print("Hi, \(nickname)")
}
```

### `if` and `switch` as expressions (Swift 5.9)

Since Swift 5.9, `if` and `switch` can produce a value directly, which removes a lot of "declare a `var`, then assign it in every branch" boilerplate:

```swift
let label = if temperature > 30 { "Hot" } else { "Fine" }

let level = 3
let description = switch level {
case 0: "none"
case 1...5: "few"
default: "many"
}

print(label, description)   // Hot few
```

They work as the value of a `let` or `var`, a `return`, or a single-expression function or closure body. A few rules keep them unambiguous:

- **Every branch must be a single expression** (or end by throwing); you can't run statements first and then produce a value.
- **An `if` expression needs an `else`**, so there's always a value.
- **Branches must have the same type.** `if c { 1 } else { "a" }` fails with *"branches have mismatching types 'Int' and 'String'"*. A type annotation can unify literals: `let ratio: Double = if c { 1 } else { 2.5 }`.

## `guard`: exit early, keep the happy path flat

`guard` checks a condition and **must** leave the current scope if it fails, with `return`, `throw`, `break`, `continue`, or a call to a `Never`-returning function like `fatalError`. Values unwrapped by `guard let` remain available for the **rest of the scope**, which is the big difference from `if let`:

```swift
func greet(_ name: String?) -> String {
    guard let name, !name.isEmpty else {
        return "Hello, stranger"
    }
    return "Hello, \(name)"    // `name` is unwrapped and non-empty here
}

print(greet(nil), "/", greet("Sam"))
```

Compare that with nested `if let` blocks: with `guard`, the main logic isn't buried under indentation, and every precondition is visible at the top of the function. A good rule: use `guard` for **preconditions** ("I can't continue without this"), and `if` for genuine **branches** ("do this or that").

## `switch`: exhaustive and expressive

A Swift `switch` must handle **every possible value**, and cases don't fall through to the next one:

```swift
let statusCode = 404

switch statusCode {
case 200..<300:
    print("Success")
case 301, 302:
    print("Redirect")
case 404:
    print("Not found")
case 500...:
    print("Server error")
default:
    print("Something else")
}
```

Notice the half-open range (`200..<300`), several values in one case (`301, 302`), and the one-sided range (`500...`). For an `Int`, a `default` is required, because the compiler can't prove you've covered every integer.

When you switch over an **enum**, the compiler knows every case, so you can (and should) omit `default`:

```swift
enum Direction {
    case north, south, east, west
}

func axis(of heading: Direction) -> String {
    switch heading {
    case .north, .south: "Vertical"
    case .east, .west: "Horizontal"
    }
}

print(axis(of: .east))   // Horizontal
```

If someone adds a new case to `Direction` later, every `switch` without a `default` becomes a compile error, pointing at exactly the code that needs updating. A `default` would hide that.

### Tuples, bindings, and `where`

`switch` is where Swift's pattern matching lives, so cases can match tuples, bind values, and add conditions:

```swift
let point = (x: 3, y: -3)

switch point {
case (0, 0):
    print("Origin")
case (let x, 0):
    print("On the x-axis at \(x)")
case let (x, y) where x == -y:
    print("On the anti-diagonal")
default:
    print("Somewhere else")
}
```

Cases are tested top to bottom, and the first match wins, so specific cases must come before general ones. Pattern matching, including enums with associated values, `if case`, and `for case`, is covered in depth in [Pattern Matching in Swift](/swift-pattern-matching/).

### `fallthrough`

If you really want C-style fallthrough, you must ask for it explicitly. It transfers control into the next case's body, **without** checking that case's pattern:

```swift
let number = 5
var traits = "\(number) is"

switch number {
case 2, 3, 5, 7, 11, 13, 17, 19:
    traits += " a prime number, and also"
    fallthrough
default:
    traits += " an integer."
}

print(traits)   // 5 is a prime number, and also an integer.
```

You'll rarely need it; most uses are better expressed by listing values together or with `where` clauses.

## Loops

### `for-in`

`for-in` works with anything that conforms to `Sequence`: ranges, arrays, dictionaries, sets, strings, and your own types.

```swift
for number in 1...3 {
    print(number)                   // 1, 2, 3
}

for _ in 0..<2 {
    print("Hello")                  // ignore the value with _
}

let fruits = ["apple", "fig", "kiwi"]
for fruit in fruits where fruit.count > 3 {
    print(fruit)                    // apple, kiwi
}

for (index, fruit) in fruits.enumerated() {
    print("\(index): \(fruit)")
}
```

For steps other than one, use [`stride`](/swift-stride/):

```swift
for even in stride(from: 0, through: 6, by: 2) {
    print(even)                     // 0, 2, 4, 6
}
```

Under the hood, `for x in sequence` asks the sequence for an iterator (`makeIterator()`) and calls `next()` until it returns `nil`. That's why any type conforming to `Sequence` works in a `for-in` loop.

### `while` and `repeat-while`

`while` checks its condition **before** each pass; `repeat-while` runs the body **at least once** and checks afterwards:

```swift
var countdown = 3
while countdown > 0 {
    print(countdown)
    countdown -= 1
}

var attempts = 0
repeat {
    attempts += 1
} while attempts < 3
print("Tried \(attempts) times")   // Tried 3 times
```

`while` is right when you don't know the number of iterations in advance: reading until the end of input, retrying until success, or walking a linked structure.

### `forEach` vs. `for-in`

`array.forEach { … }` looks similar but behaves differently: you can't `break` or `continue`, and `return` only exits the current closure call, moving on to the next element. Use `for-in` when you need control flow, and `forEach` for short, side-effecting pipelines.

## Control transfer: `continue`, `break`, and labels

`continue` skips to the next iteration; `break` leaves the loop (or a `switch`). In nested loops, a **label** says which loop you mean:

```swift
let grid = [[1, 2], [3, -1], [5, 6]]

search: for row in grid {
    for value in row {
        if value < 0 {
            print("Found a negative value")
            break search            // leaves both loops
        }
    }
}
```

Labels work with `continue` too (`continue outer`), and they're much clearer than a "found" flag checked after every inner loop.

## Checking API availability

`#available` runs code only on OS versions that have an API, and `#unavailable` (Swift 5.6) expresses the opposite without an empty branch:

```swift
if #available(iOS 17, macOS 14, *) {
    print("Use the newest API")
} else {
    print("Fall back to the older API")
}

if #unavailable(iOS 15) {
    print("Running on an older system")
}
```

## Common pitfalls

- **Nested `if let` pyramids.** Flatten them with `guard let` or combined conditions.
- **`default` in enum switches**, which hides new cases. List the cases.
- **Forgetting that `switch` doesn't fall through** when porting C code; each case ends automatically.
- **Mutating a collection while looping over it with indices.** Remove elements with `removeAll(where:)` instead.
- **Using `forEach` when you need `break`.**

## Interview questions

**What's the difference between `if let` and `guard let`?**
`if let` binds the value only inside its block; `guard let` binds it for the rest of the scope and requires the `else` branch to exit.

**Why does Swift require `switch` to be exhaustive?**
So every possible value is handled, and adding an enum case produces compile errors wherever it isn't handled, instead of silent bugs.

**What are the rules for `if` expressions?**
Each branch must be a single expression of the same type (or throw), and there must be an `else`.

**How do you break out of nested loops?**
Label the outer loop and use `break label`.

## Summary

- `if` needs a real `Bool`; `if let` (with the Swift 5.7 shorthand) unwraps optionals; conditions combine with commas.
- `if` and `switch` can be expressions since Swift 5.9, with single-expression, same-type branches.
- `guard` handles preconditions and keeps unwrapped values for the rest of the scope.
- `switch` is exhaustive, doesn't fall through, and matches ranges, lists, tuples, and patterns.
- `for-in` works with any `Sequence`; labels control nested loops; `#available`/`#unavailable` gate APIs by OS version.
