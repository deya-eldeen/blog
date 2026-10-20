---
layout: post
title: "Pattern Matching in Swift"
date: "2021-01-22"
last_modified_at: "2021-01-22"
permalink: /swift-pattern-matching/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Syntax"
  - "Enums"
---

Pattern matching is how Swift asks "does this value look like *that*?" and pulls the interesting parts out in the same breath. It powers `switch`, `if case`, `for case`, and even `catch` clauses, and once it clicks, it replaces a lot of clumsy `if` chains.

<!--more-->

## The building blocks

Swift has a small set of patterns that combine freely:

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything, ignoring it |
| Identifier | `let x` | anything, binding it to `x` |
| Value | `42`, `"admin"` | equal values (via `~=`) |
| Range | `0..<10` | values inside the range |
| Tuple | `(0, _)` | tuples whose parts match |
| Enum case | `.success(let value)` | a case, extracting its associated values |
| Optional | `let x?` | a non-nil optional, unwrapping it |
| Type casting | `is Int`, `let n as Int` | values of a given type |

## Tuples

Matching several values at once is where `switch` beats `if` chains:

```swift
let point = (x: 0, y: 5)

switch point {
case (0, 0):
    print("Origin")
case (0, let y):
    print("On the y-axis at \(y)")
case (let x, 0):
    print("On the x-axis at \(x)")
case (-1...1, -1...1):
    print("Close to the origin")
default:
    print("Somewhere else")
}
```

## `where` clauses

Add extra conditions to any case:

```swift
let size = (width: 120, height: 80)

switch size {
case let (w, h) where w == h:
    print("Square")
case let (w, h) where w > h:
    print("Landscape")
default:
    print("Portrait")
}
```

## Enums with associated values

This is pattern matching's killer feature: checking a case and extracting its data in one step.

```swift
enum LoadState {
    case idle
    case loading(progress: Double)
    case loaded(items: [String])
    case failed(message: String)
}

let state = LoadState.loading(progress: 0.4)

switch state {
case .idle:
    print("Waiting")
case .loading(let progress) where progress < 0.5:
    print("Just started: \(progress)")
case .loading(let progress):
    print("Almost there: \(progress)")
case .loaded(let items) where items.isEmpty:
    print("Nothing to show")
case .loaded(let items):
    print("Loaded \(items.count) items")
case .failed(let message):
    print("Error: \(message)")
}
```

## `if case` and `guard case`

When you care about just one pattern, a full `switch` is overkill:

```swift
if case .failed(let message) = state {
    print("Show alert: \(message)")
}

func progressValue(of state: LoadState) -> Double? {
    guard case .loading(let progress) = state else { return nil }
    return progress
}
```

The syntax reads backwards at first: pattern on the left, value on the right of `=`.

## `for case`

Filter a sequence by pattern while you loop:

```swift
let states: [LoadState] = [.idle, .failed(message: "Timeout"), .loaded(items: ["A"]), .failed(message: "Offline")]

for case .failed(let message) in states {
    print(message)          // Timeout, Offline
}

let maybeNumbers: [Int?] = [1, nil, 3]
for case let number? in maybeNumbers {
    print(number)           // 1, 3
}
```

## Optional patterns

`let value?` matches only non-nil values. You can combine it with other patterns:

```swift
let reply: Int? = 404

switch reply {
case nil:
    print("No reply")
case let code? where code >= 500:
    print("Server error \(code)")
case let code?:
    print("Status \(code)")
}
```

## Type-casting patterns

```swift
let things: [Any] = [42, "hello", 3.14, [1, 2]]

for thing in things {
    switch thing {
    case let number as Int:
        print("Int: \(number)")
    case let text as String:
        print("String: \(text)")
    case is Double:
        print("Some Double")
    default:
        print("Something else")
    }
}
```

## Custom matching with `~=`

Value patterns use the `~=` operator under the hood, and you can overload it. Here's a `switch` that matches strings against a prefix:

```swift
struct Prefix {
    let value: String
}

func ~= (pattern: Prefix, input: String) -> Bool {
    input.hasPrefix(pattern.value)
}

let command = "/help topics"

switch command {
case Prefix(value: "/help"):
    print("Show help")
case Prefix(value: "/quit"):
    print("Bye")
default:
    print("Unknown command")
}
```

Use this sparingly. It's clever, and clever code needs a good reason to exist.

## Summary

- Patterns combine: tuples of ranges, enum cases with `where` clauses, optionals inside switches.
- `if case`, `guard case`, and `for case` bring pattern matching outside `switch`.
- `let x?` unwraps, `as` casts, `_` ignores.
- `~=` defines how value patterns match, and can be extended for your own types.
