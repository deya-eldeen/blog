---
layout: post
title: "Clean Code in Swift"
date: "2024-11-28"
last_modified_at: "2024-11-28"
permalink: /swift-clean-code/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Clean Code"
  - "Architecture"
---

Clean code is code that the next person, often you in six months, can read, trust, and change without fear. Swift gives you unusually good tools for it: expressive naming conventions, value types, optionals, enums, and a compiler that catches whole classes of mistakes. Here are the habits that make the biggest difference in day-to-day Swift.

<!--more-->

## 1. Names that read like sentences

Swift's API Design Guidelines put clarity at the point of use first. Names should make call sites read naturally:

```swift
struct Inbox {
    private(set) var messages: [String] = []

    // ✅ Reads as a phrase at the call site: inbox.insert(message, at: 0)
    mutating func insert(_ message: String, at index: Int) {
        messages.insert(message, at: index)
    }

    // ✅ Boolean properties read as assertions
    var isEmpty: Bool { messages.isEmpty }
}

var inbox = Inbox()
inbox.insert("Welcome!", at: 0)
```

Avoid abbreviations (`usr`, `mgr`), type names in variable names (`messagesArray`), and vague words like `data`, `info`, `handle`, or `process`. For more, see [Mastering Swift Style Guides](/swift-style-guides/).

## 2. Small functions that do one thing

If a function needs a comment to explain its sections, those sections probably want to be functions:

```swift
struct Order {
    var items: [Double]
    var couponPercent: Double
}

func total(for order: Order) -> Double {
    let subtotal = order.items.reduce(0, +)
    return applyDiscount(to: subtotal, percent: order.couponPercent)
}

private func applyDiscount(to amount: Double, percent: Double) -> Double {
    amount * (1 - percent / 100)
}
```

Each function has one reason to change, and its name tells you what it does without reading the body.

## 3. Flatten with `guard`

Deep nesting hides the main path. Check preconditions up front and exit early:

```swift
struct SignUpForm {
    var email: String?
    var password: String?
    var acceptedTerms: Bool
}

enum SignUpError: Error {
    case missingEmail, weakPassword, termsNotAccepted
}

func validate(_ form: SignUpForm) throws -> (email: String, password: String) {
    guard let email = form.email, !email.isEmpty else { throw SignUpError.missingEmail }
    guard let password = form.password, password.count >= 8 else { throw SignUpError.weakPassword }
    guard form.acceptedTerms else { throw SignUpError.termsNotAccepted }
    return (email, password)
}
```

## 4. Make invalid states unrepresentable

Booleans and optionals that must be kept in sync are a bug waiting to happen:

```swift
// ❌ Which combinations are valid? isLoading && error != nil?
struct ScreenStateFlags {
    var isLoading: Bool
    var items: [String]?
    var error: Error?
}

// ✅ Exactly one state at a time, each with its own data
enum ScreenState {
    case loading
    case loaded([String])
    case failed(Error)
}
```

The enum version can't be in a contradictory state, and every `switch` over it must handle all cases. See [Enumerations in Swift](/swift-enumerations/).

## 5. Prefer values and `let`

- Use `let` by default; switch to `var` only when something really changes.
- Prefer structs over classes, so data can't change behind your back. See [Structures and Classes](/swift-structures-and-classes/).
- Prefer non-mutating transformations, like `map` and `filter`, for data flow:

```swift
let prices = [12.0, 7.5, 30.0]
let affordable = prices.filter { $0 < 20 }.map { $0 * 1.2 }
```

## 6. Don't force-unwrap your way out

Every `!` is a promise that something is never `nil`. Sometimes that's true, like a URL from a string literal you control, but usually it's a crash waiting to happen. Use `if let`, `guard let`, `??`, or a non-optional type instead:

```swift
let input = "42"
let quantity = Int(input) ?? 1          // ✅ explicit fallback
// let quantity = Int(input)!           // ❌ crashes on bad input
```

## 7. Depend on abstractions at the edges

Code that talks to the network, the database, or the clock is hard to test. Put a small protocol in front of it:

```swift
protocol Clock {
    var now: Date { get }
}

struct SystemClock: Clock {
    var now: Date { Date() }
}

struct SessionValidator {
    let clock: any Clock

    func isExpired(_ expiry: Date) -> Bool {
        clock.now > expiry
    }
}
```

Tests can pass a fixed clock, and the production code doesn't change. [Test Doubles in Swift](/test-doubles-in-swift/) shows this pattern in depth.

## 8. Handle errors honestly

- Throw descriptive errors instead of returning `nil` when the caller needs to know *why* something failed.
- Never silently swallow errors with an empty `catch {}`; at minimum, log them.
- Reserve `fatalError` and `precondition` for programmer errors, not for user input or network failures.

## 9. Comments explain *why*

Code says what it does; comments should say what code can't:

```swift
// Apple's API returns the cached value for up to 5 minutes after a change,
// so we bypass the cache right after the user edits their profile.
let shouldBypassCache = true
```

Delete commented-out code (that's what version control is for), and keep `// MARK: -` sections to organize long files.

## 10. Let the tools help

- **Compiler warnings** are free code review; aim for zero.
- **swift-format** or **SwiftLint** keep formatting consistent, so code reviews can focus on design.
- **Swift 6 language mode** catches data races at compile time.
- **Tests** make refactoring safe, and refactoring is how code stays clean.

## Summary

- Name things for clarity at the call site, and keep functions small and focused.
- Use `guard` for early exits, enums to rule out invalid states, and `let` and value types by default.
- Avoid force-unwraps, put protocols in front of side effects, and handle errors explicitly.
- Comment the *why*, and let the compiler, formatters, and tests keep the code honest.
