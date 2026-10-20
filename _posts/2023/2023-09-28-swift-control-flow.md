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

Control flow decides which code runs and how many times. Swift's toolbox looks familiar if you've used any C-style language, but each tool comes with a twist that makes code safer: no fallthrough by default, exhaustive `switch`, and `guard` for clean early exits.

<!--more-->

## `if` and `else`

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

The condition must be a real `Bool`. Unlike C, Swift won't treat `0` or `nil` as false, so `if count { ... }` doesn't compile.

### `if` as an expression

Since Swift 5.9, `if` and `switch` can produce a value directly:

```swift
let label = if temperature > 30 { "Hot" } else { "Fine" }
```

### Unwrapping with `if let`

`if let` runs a block only when an optional has a value, and gives you the unwrapped value inside:

```swift
let input = "42"

if let number = Int(input) {
    print("Got \(number)")
}

// Shorthand when the names match (Swift 5.7+):
let nickname: String? = "Sam"
if let nickname {
    print("Hi, \(nickname)")
}
```

## `guard`: exit early, keep the happy path flat

`guard` checks a condition and **must** leave the current scope if it fails, with `return`, `throw`, `break`, or `continue`. Values unwrapped by `guard let` stay available for the rest of the scope.

```swift
func greet(_ name: String?) -> String {
    guard let name, !name.isEmpty else {
        return "Hello, stranger"
    }
    return "Hello, \(name)"
}
```

Compare that with nested `if let` blocks: with `guard`, the main logic isn't buried in indentation, and every precondition is checked at the top. Use `guard` for preconditions and `if` for genuine branches.

## `switch`: exhaustive and expressive

A Swift `switch` must handle **every possible value**, and cases don't fall through to the next one.

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

Notice the ranges (`200..<300`), multiple values per case (`301, 302`), and the one-sided range (`500...`). When you switch over an enum, the compiler checks that every case is covered, so adding a new case later points you at every `switch` that needs updating:

```swift
enum Direction {
    case north, south, east, west
}

let heading = Direction.east

switch heading {
case .north, .south:
    print("Vertical")
case .east, .west:
    print("Horizontal")
}
```

If you really want C-style fallthrough, you must ask for it explicitly with the `fallthrough` keyword. You'll rarely need it.

`switch` is also where Swift's pattern matching lives: tuples, `where` clauses, and enum associated values. That's big enough for its own article: [Pattern Matching in Swift](/swift-pattern-matching/).

## Loops

### `for-in`

```swift
for number in 1...3 {
    print(number)            // 1, 2, 3
}

for _ in 0..<3 {
    print("Hello")           // ignore the value with _
}

let fruits = ["apple", "fig", "kiwi"]
for fruit in fruits where fruit.count > 3 {
    print(fruit)             // apple, kiwi
}
```

For steps other than 1, use [`stride`](/swift-stride/):

```swift
for even in stride(from: 0, through: 10, by: 2) {
    print(even)
}
```

### `while` and `repeat-while`

`while` checks its condition before each pass; `repeat-while` runs the body at least once:

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
```

### `break`, `continue`, and labels

`continue` skips to the next iteration, `break` leaves the loop. In nested loops, a **label** says which loop you mean:

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

## Summary

- `if` needs a real `Bool`; `if let` unwraps optionals.
- `guard` handles preconditions and exits early, keeping the main path flat.
- `switch` is exhaustive, doesn't fall through, and matches ranges, lists, and patterns.
- `for-in` works with ranges, collections, and `where` filters; labels control nested loops.
