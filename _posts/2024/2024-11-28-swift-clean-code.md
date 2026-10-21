---
layout: post
hidden: true
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
  - "Best Practices"
thumbnail: "images/covers/swift_clean_code_thumbnail.webp"
thumbnail_ready: true
---

Clean code is code that the next person, often you in six months, can read, trust, and change without fear. Most clean code advice is language-agnostic, but Swift gives you unusually strong tools to apply it: API design guidelines built around the call site, value types, optionals, enums with associated values, access control, and a compiler that can rule out whole classes of mistakes, including data races. This article starts with a realistic refactoring, then goes through the habits that make the biggest difference in day-to-day Swift, the code smells to watch for, and where "clean" turns into over-engineering.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_clean_code_thumbnail.webp"
 alt_text="A tangled implementation reorganized into clear, cohesive modules"
 caption="Clean Code in Swift"
 width="640"
 height="400"
%}

## A refactoring, start to finish

Here's a function of a kind that exists in many codebases. It works, and it's tested by hand every release:

```swift
func price(_ items: [(String, Double, Int)], _ type: String, _ code: String?, _ express: Bool) -> Double {
    var t = 0.0
    for i in items {
        t += i.1 * Double(i.2)
    }
    if type == "gold" {
        t = t * 0.9
    } else {
        if type == "silver" {
            t = t * 0.95
        }
    }
    if code != nil {
        if code! == "WELCOME10" {
            t = t - 10
        }
    }
    if t < 0 { t = 0 }
    if express {
        t += 15
    } else {
        if t < 50 {
            t += 5
        }
    }
    return t
}

let legacyTotal = price([("Book", 20, 2), ("Pen", 2.5, 4)], "gold", "WELCOME10", false)
print(legacyTotal)   // 40.0
```

What makes it hard to work with:

- **The call site is unreadable.** `price(items, "gold", "WELCOME10", false)`: what's `false`?
- **Stringly typed inputs.** A typo like `"Gold"` silently means "no discount".
- **Tuples with positional fields** (`i.1`, `i.2`) hide meaning.
- **Magic numbers** (`0.9`, `15`, `50`, `5`) carry business rules nobody can find.
- **Nesting and a force-unwrap**, and one function doing four jobs: subtotal, membership discount, coupons, shipping.

Here's the same logic, refactored step by step into types that carry meaning:

```swift
struct LineItem {
    let name: String
    let unitPrice: Double
    let quantity: Int

    var total: Double { unitPrice * Double(quantity) }
}

enum Membership {
    case standard, silver, gold

    var discountRate: Double {
        switch self {
        case .standard: 0
        case .silver: 0.05
        case .gold: 0.10
        }
    }
}

enum Coupon: String {
    case welcome10 = "WELCOME10"

    var amountOff: Double {
        switch self {
        case .welcome10: 10
        }
    }
}

enum Shipping {
    case standard, express

    static let freeStandardThreshold = 50.0

    func cost(forSubtotal subtotal: Double) -> Double {
        switch self {
        case .express: 15
        case .standard: subtotal < Self.freeStandardThreshold ? 5 : 0
        }
    }
}

struct Checkout {
    let items: [LineItem]
    let membership: Membership
    let coupon: Coupon?
    let shipping: Shipping

    var total: Double {
        let discounted = subtotal * (1 - membership.discountRate)
        let afterCoupon = max(0, discounted - (coupon?.amountOff ?? 0))
        return afterCoupon + shipping.cost(forSubtotal: afterCoupon)
    }

    private var subtotal: Double {
        items.reduce(0) { $0 + $1.total }
    }
}

let checkout = Checkout(
    items: [
        LineItem(name: "Book", unitPrice: 20, quantity: 2),
        LineItem(name: "Pen", unitPrice: 2.5, quantity: 4),
    ],
    membership: .gold,
    coupon: Coupon(rawValue: "WELCOME10"),
    shipping: .standard
)
print(checkout.total)   // 40.0
```

The result is longer, and that's fine: **clean doesn't mean short**. Every rule now has a name and a home. A typo in a membership level is a compile error. The call site documents itself. Adding a membership tier makes the compiler point at every `switch` that must handle it. And each piece can be tested on its own: `Shipping.standard.cost(forSubtotal: 49)` is a one-line test.

Before refactoring code like this for real, pin its current behavior with a few tests (including the odd cases, like a coupon larger than the subtotal), so you can prove the new version gives the same answers.

## Names that read at the point of use

Swift's API Design Guidelines put **clarity at the point of use** first. You write a declaration once, but it's read at every call site:

```swift
struct Inbox {
    private(set) var messages: [String] = []

    // Reads as a phrase at the call site: inbox.insert(message, at: 0)
    mutating func insert(_ message: String, at index: Int) {
        messages.insert(message, at: index)
    }

    // Boolean properties read as assertions
    var isEmpty: Bool { messages.isEmpty }
}

var inbox = Inbox()
inbox.insert("Welcome!", at: 0)
print(inbox.isEmpty)   // false
```

The guidelines' most useful rules in practice:

- **Name by role, not type.** `greeting`, not `string`; `messages`, not `messagesArray`.
- **Omit needless words**, but keep words that prevent ambiguity: `remove(at: index)` is clear; `remove(index)` could mean "remove the value `index`".
- **Mutating and non-mutating pairs** follow a pattern: verbs mutate, past participles return a new value: `sort()` / `sorted()`, `append(_:)` / `appending(_:)`, `normalize()` / `normalized()`.
- **Side-effect-free methods read as nouns** (`distance(to:)`); methods with side effects read as verbs (`print(_:)`, `save()`).
- **Factory methods start with `make`**: `makeIterator()`.
- **Protocols** that describe what something **is** are nouns (`Collection`); capabilities end in `-able`, `-ible`, or `-ing` (`Equatable`, `ProgressReporting`).
- Avoid abbreviations (`usr`, `mgr`, `cfg`) and vague words (`data`, `info`, `manager`, `handle`, `process`) that could mean anything.

For formatting and layout conventions, see [Mastering Swift Style Guides](/swift-style-guides/).

## Boolean parameters are a smell

`render(true, false)` tells the reader nothing. Swift's argument labels help, but an enum is usually better still, because it can grow a third case later without changing every call site:

```swift
enum ImageQuality {
    case thumbnail, full
}

func loadImage(named name: String, quality: ImageQuality) -> String {
    switch quality {
    case .thumbnail: "\(name)@small"
    case .full: "\(name)@full"
    }
}

print(loadImage(named: "avatar", quality: .thumbnail))   // avatar@small
```

The same goes for long parameter lists: when a function takes six parameters, several of them usually belong together in a struct.

## Small functions that do one thing

If a function needs comments to explain its sections, those sections probably want to be functions with names:

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

print(total(for: Order(items: [10, 30], couponPercent: 25)))   // 30.0
```

Each function has one reason to change, and its name tells you what it does without reading the body. A good test: can you describe the function in one sentence without "and"?

## Flatten with `guard`

Deep nesting hides the main path. Check preconditions up front and exit early, so the happy path runs down the left margin:

```swift
struct SignUpForm {
    var email: String?
    var password: String?
    var acceptedTerms: Bool
}

enum SignUpError: Error {
    case missingEmail, weakPassword, termsNotAccepted
}

func validate(_ form: SignUpForm) throws(SignUpError) -> (email: String, password: String) {
    guard let email = form.email, !email.isEmpty else { throw .missingEmail }
    guard let password = form.password, password.count >= 8 else { throw .weakPassword }
    guard form.acceptedTerms else { throw .termsNotAccepted }
    return (email, password)
}

do {
    _ = try validate(SignUpForm(email: "sam@example.com", password: "short", acceptedTerms: true))
} catch {
    print(error)   // weakPassword
}
```

Each `guard` states one requirement, and the compiler guarantees its `else` branch leaves the scope. Swift 6's typed throws let the caller know the exact set of failures; see [Error Handling in Swift](/swift-error-handling/).

## Make invalid states unrepresentable

Booleans and optionals that must be kept in sync are a bug waiting to happen:

```swift
// Which combinations are valid? isLoading == true with an error and items?
struct ScreenStateFlags {
    var isLoading: Bool
    var items: [String]?
    var error: Error?
}

// Exactly one state at a time, each with its own data
enum ScreenState {
    case loading
    case loaded([String])
    case failed(Error)
}
```

Three independent properties allow 2 × 2 × 2 = 8 combinations, most of them nonsense; the enum allows exactly three. The enum version can't be in a contradictory state, and every `switch` over it must handle all cases. See [Enumerations in Swift](/swift-enumerations/).

## Types instead of primitives

"Primitive obsession", using `String`, `Int`, and `Double` for everything, lets you mix up values that happen to share a type. Small wrapper types cost nothing at runtime and turn mix-ups into compile errors:

```swift
struct UserID: Hashable {
    let rawValue: Int
}

struct OrderID: Hashable {
    let rawValue: Int
}

func cancel(_ order: OrderID, requestedBy user: UserID) -> String {
    "user \(user.rawValue) cancelled order \(order.rawValue)"
}

let user = UserID(rawValue: 7)
let order = OrderID(rawValue: 1_042)
print(cancel(order, requestedBy: user))   // user 7 cancelled order 1042
// cancel(order, requestedBy: order)      // ❌ compile error: an OrderID isn't a UserID
```

The same idea works for **validated values**. A failable initializer checks once, and every function that takes the type can rely on it:

```swift
struct EmailAddress {
    let value: String

    init?(_ candidate: String) {
        let parts = candidate.split(separator: "@")
        guard parts.count == 2, parts[1].contains(".") else { return nil }
        value = candidate
    }
}

print(EmailAddress("sam@example.com")?.value ?? "invalid")   // sam@example.com
print(EmailAddress("not-an-email")?.value ?? "invalid")      // invalid
```

A function that takes an `EmailAddress` instead of a `String` never needs to validate it again. That's "parse, don't validate": convert untrusted input into a type that proves it's valid at the boundary, then trust it everywhere inside.

## Prefer values and `let`

- Use `let` by default; switch to `var` only when something really changes. The compiler warns when a `var` is never mutated.
- Prefer structs over classes, so data can't change behind your back through another reference. See [Structures and Classes](/swift-structures-and-classes/).
- Prefer non-mutating transformations for data flow:

```swift
let prices = [12.0, 7.5, 30.0]
let affordableWithTax = prices
    .filter { $0 < 20 }
    .map { $0 * 1.25 }
print(affordableWithTax)   // [15.0, 9.375]
```

- When you do use classes, mark them `final` unless they're designed for subclassing. It documents intent and enables static dispatch.

## Don't force-unwrap your way out

Every `!` is a promise that something is never `nil`. Sometimes that's genuinely true, like a URL built from a string literal you control, but usually it's a crash waiting to happen. Use `if let`, `guard let`, `??`, or a non-optional type instead:

```swift
let input = "4x2"
let quantity = Int(input) ?? 1          // explicit fallback
// let quantity = Int(input)!           // ❌ crashes on bad input
print(quantity)                         // 1
```

When a value truly can't be `nil` because of an invariant, say so with a message, so the crash report explains itself: `guard let url = URL(string: template) else { preconditionFailure("Invalid URL template: \(template)") }`.

## Hide what others shouldn't touch

Start with the most restrictive access and widen only when needed. `private` and `private(set)` keep invariants in one place:

```swift
struct BankAccount {
    private(set) var balance = 0   // readable everywhere, writable only here

    mutating func deposit(_ amount: Int) {
        precondition(amount > 0, "Deposits must be positive")
        balance += amount
    }
}

var account = BankAccount()
account.deposit(50)
print(account.balance)   // 50
// account.balance = 1_000_000   // ❌ the setter is private
```

Organize each conformance in its own extension, with `private` helpers next to the code that uses them. It keeps files scannable and makes a type's responsibilities visible at a glance; see [Access Control](/swift-access-control/) and [Extensions](/swift-extensions/).

## Depend on abstractions at the edges

Code that talks to the network, the database, the file system, or the clock is hard to test and hard to reason about. Put a small protocol in front of it, and inject the dependency:

```swift
import Foundation

protocol Clock {
    var now: Date { get }
}

struct SystemClock: Clock {
    var now: Date { Date() }
}

struct FixedClock: Clock {
    let now: Date
}

struct SessionValidator {
    let clock: any Clock

    func isExpired(_ expiry: Date) -> Bool {
        clock.now > expiry
    }
}

let expiry = Date(timeIntervalSince1970: 1_000)
let validator = SessionValidator(clock: FixedClock(now: Date(timeIntervalSince1970: 2_000)))
print(validator.isExpired(expiry))   // true, every time, on every machine
```

Production code passes `SystemClock()`; tests pass a fixed clock and get deterministic results. Keep the **core logic pure** (inputs in, outputs out) and push side effects to the edges: pure code is trivial to test and impossible to break through hidden state. [Test Doubles in Swift](/test-doubles-in-swift/) shows this pattern in depth.

## Handle errors honestly

- Throw descriptive errors instead of returning `nil` when the caller needs to know *why* something failed.
- Never silently swallow errors with an empty `catch {}`; at minimum, log them.
- Translate low-level errors at module boundaries, so UI code doesn't switch over `URLError` codes.
- Reserve `fatalError` and `precondition` for programmer errors, never for user input or network failures.

## Comments explain *why*

Code says **what** it does; comments should say what code can't:

```swift
// The payments API caches responses for up to 5 minutes after a change,
// so we bypass the cache right after the user edits their card.
let shouldBypassCache = true
```

Documentation comments (`///`) show up in Xcode's Quick Help and in DocC, so use them for public APIs: what the function does, its parameters, what it throws, and any complexity guarantees. Delete commented-out code (version control remembers it), and use `// MARK: -` to organize long files into sections that appear in Xcode's jump bar.

## A catalog of Swift code smells

| Smell | Usually means | Try |
|---|---|---|
| A 1,000-line view controller | Too many responsibilities | Extract views, view models, and services |
| `func f(_: Bool, _: Bool)` | Unclear call sites | Argument labels, or an enum |
| `"gold"`, `"pending"`, `"admin"` strings | Stringly-typed logic | Enums |
| Several optionals that must be set together | Invalid states are representable | An enum with associated values, or a struct |
| `Int` IDs passed everywhere | Primitive obsession | Small wrapper types |
| `!` sprinkled through code | Unhandled absence | `guard let`, defaults, non-optional types |
| Deep class hierarchies | Inheritance used for code reuse | Protocols, composition |
| One change requires edits in ten files | Scattered responsibility | Move the knowledge into one type |
| `Manager`, `Helper`, `Utils` type names | No clear responsibility | Split by what each part actually does |

## When "clean" goes too far

Clean code is about making change **cheaper**, and abstractions have a cost too. Watch for:

- **A protocol with a single implementation and no test double.** It's indirection with no benefit; extract it when a second implementation or a test actually needs it.
- **Premature generalization.** Duplication is cheaper than the wrong abstraction. Wait until the third copy, when you can see what really varies.
- **Clever code.** Long chains of closures, custom operators, and dense one-liners can be shorter and still harder to read. Optimize for the reader.
- **Architecture by cargo cult.** Five layers and a coordinator for a settings screen with two toggles isn't clean; it's ceremony.

## Let the tools help

- **Compiler warnings** are free code review; aim for zero, and treat new ones as errors in CI.
- **swift-format** (included with the Swift 6 toolchain as `swift format`) or **SwiftLint** keep formatting consistent, so code reviews can focus on design.
- **Swift 6 language mode** turns data races into compile errors.
- **Tests** make refactoring safe, and refactoring is how code stays clean. The "boy scout rule" applies: leave each file a little better than you found it.

## Interview questions

**What does "clarity at the point of use" mean?**
APIs are designed so that call sites read clearly, because code is read far more often than it's written: argument labels, role-based names, and mutating/non-mutating naming pairs like `sort()`/`sorted()`.

**How can Swift's type system make invalid states unrepresentable?**
With enums that hold associated values for each state instead of independent flags and optionals, and with small wrapper types and failable initializers that validate data once.

**Why are Boolean parameters considered a smell?**
They make call sites unreadable and can't grow beyond two options. Argument labels help; enums are clearer and extensible.

**When is an abstraction not worth it?**
When it has a single implementation, no test needs to replace it, and it only adds indirection. Introduce it when a real second use appears.

## Summary

- Clean code makes change cheap and safe; it isn't about being short.
- Name things for clarity at the call site; replace Boolean flags, strings, and primitive IDs with enums and small types.
- Keep functions small, use `guard` for early exits, and make invalid states unrepresentable.
- Prefer `let`, value types, `final`, and the most restrictive access level; avoid force-unwraps.
- Put protocols in front of side effects, keep core logic pure, and handle errors explicitly.
- Comment the *why*, avoid over-abstraction, and let the compiler, formatters, and tests keep the code honest.
