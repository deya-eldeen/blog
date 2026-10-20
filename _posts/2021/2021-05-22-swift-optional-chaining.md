---
layout: post
title: "Optional Chaining in Swift"
date: "2021-05-22"
last_modified_at: "2021-05-22"
permalink: /swift-optional-chaining/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Optionals"
  - "Syntax"
---

Optional chaining lets you call properties, methods, and subscripts on a value that might be `nil`, in one expression. If any link in the chain is `nil`, the whole chain quietly evaluates to `nil` instead of crashing. It's the polite alternative to force-unwrapping with `!`, and you'll use it every time you write `delegate?.didFinish()` or `self?.update()`.

<!--more-->

## A quick reminder: optionals are enums

An optional is either `.none` (written `nil`) or `.some(value)`:

```swift
enum MyOptional<Wrapped> {
    case none
    case some(Wrapped)
}
```

Everything about optional chaining follows from that: to reach a value inside an optional, you first have to check which case it is. Optional chaining is a compact way to say "if it's `.some`, continue; if it's `.none`, stop and produce `nil`."

## The problem it solves

```swift
final class Residence {
    var numberOfRooms = 1
    var address: Address?
    var rooms: [String] = []

    func printNumberOfRooms() {
        print("The number of rooms is \(numberOfRooms)")
    }
}

struct Address {
    var street: String?
    var city = "Unknown"

    func formatted() -> String {
        "\(street ?? "No street"), \(city)"
    }
}

final class Resident {
    var residence: Residence?
}

let john = Resident()
```

`john.residence` is `nil`. Force-unwrapping it crashes your app:

```swift
// let rooms = john.residence!.numberOfRooms   // crash: unexpectedly found nil
```

## Chaining with `?`

Put `?` after the optional instead, and the rest of the expression only runs if there's a value:

```swift
if let rooms = john.residence?.numberOfRooms {
    print("John's residence has \(rooms) room(s).")
} else {
    print("Unable to retrieve the number of rooms.")
}
```

Notice the type. `numberOfRooms` is an `Int`, but `john.residence?.numberOfRooms` is an `Int?`. **The result of optional chaining is always optional**, because the chain might fail. That's the whole trick: the possibility of `nil` is carried in the type, so you have to deal with it before using the value.

## Chaining through several levels

Chains can go as deep as you need, and they stop at the first `nil`:

```swift
john.residence = Residence()
let street = john.residence?.address?.street      // String?: nil, because address is nil

john.residence?.address = Address(street: "1 Infinite Loop", city: "Cupertino")
print(john.residence?.address?.street ?? "none")  // 1 Infinite Loop
```

### Optionals don't stack up

`street` is itself a `String?`. Reaching it through two optional links still gives you a `String?`, not a `String??`. Optional chaining **flattens** the result to a single level of optionality:

```swift
let words: [String]? = ["a", "bb"]
let firstWordLength = words?.first?.count   // Int?, not Int??
print(firstWordLength ?? 0)                 // 1
```

The same flattening applies to `try?` since Swift 5: calling a throwing function that returns `Int?` with `try?` gives you an `Int?`, not an `Int??`.

## Calling methods

```swift
let description = john.residence?.address?.formatted()   // String?
```

Even methods that return nothing can be chained. A `Void` method called through a chain returns `Void?`, which tells you whether the call actually happened:

```swift
let nobody = Resident()

if nobody.residence?.printNumberOfRooms() != nil {
    print("It was possible to print the number of rooms.")
} else {
    print("It was not possible to print the number of rooms.")
}
```

## Setting values through a chain

Assignment through an optional chain does nothing if any link is `nil`, and the right-hand side **isn't even evaluated**:

```swift
func makeAddress() -> Address {
    print("Building address")
    return Address(street: "Main St")
}

nobody.residence?.address = makeAddress()   // "Building address" is never printed
```

That's both efficient and occasionally surprising: if `makeAddress()` had a side effect you relied on, it wouldn't happen. The assignment also returns `Void?`, so you can check whether it succeeded with `!= nil`.

## Subscripts

Put the `?` **before** the brackets when the value being subscripted is optional:

```swift
john.residence?.rooms.append("Living Room")
print(john.residence?.rooms[0] ?? "no room")      // Living Room

var testScores: [String: [Int]]? = ["Dave": [86, 82, 84]]
let first = testScores?["Dave"]?[0]               // 86, as Int?
testScores?["Dave"]?[0] = 91
testScores?["Brian"]?[0] = 72                     // no "Brian": silently does nothing
print(testScores ?? [:])
```

In `testScores?["Dave"]?[0]`, the first `?` handles the dictionary itself being `nil`, and the second handles the key `"Dave"` being missing, because a dictionary subscript returns an optional.

Note that `rooms[0]` inside a chain still **traps** if `rooms` is empty. Optional chaining only protects you from `nil`, not from invalid indices.

## Where you'll use it every day

**Delegates and callbacks**, which are optional by nature:

```swift
protocol DownloaderDelegate: AnyObject {
    func downloaderDidFinish()
}

final class Downloader {
    weak var delegate: DownloaderDelegate?
    var onProgress: ((Double) -> Void)?

    func finish() {
        onProgress?(1.0)              // call an optional closure
        delegate?.downloaderDidFinish()
    }
}
```

**Weak self in closures**, where `self?.method()` simply does nothing if the object is gone:

```swift
final class Screen {
    var title = ""

    func load(using fetch: (@escaping (String) -> Void) -> Void) {
        fetch { [weak self] result in
            self?.title = result      // no-op if the screen was closed
        }
    }
}
```

**Defaults with `??`**: optional chaining and the nil-coalescing operator are a natural pair:

```swift
let city = john.residence?.address?.city ?? "Unknown city"
let text: String? = nil
let isEmpty = text?.isEmpty ?? true     // treat nil as empty
let length = text?.count ?? 0
```

The right side of `??` is only evaluated when needed, so `value ?? expensiveDefault()` doesn't call the function unless `value` is `nil`.

## Optional chaining vs. `map` and `flatMap`

Optionals have `map` and `flatMap` methods that do the same job in functional style. They're useful when you want to transform an optional with a function that isn't a member of the wrapped type:

```swift
let maybeNumber: String? = "42"
let parsed = maybeNumber.flatMap { Int($0) }      // Int?: flatMap avoids Int??
let doubled = parsed.map { $0 * 2 }               // Int?
print(doubled ?? 0)                               // 84
```

`a?.b` is equivalent to `a.map { $0.b }` when `b` isn't optional, and to `a.flatMap { $0.b }` when it is. Use `?.` for members, and `map`/`flatMap` for free functions and initializers like `Int(_:)`.

## Under the hood

Optional chaining compiles to a simple check of the optional's case at each link, followed by an early exit to "produce `nil`". There's no exception machinery and no hidden allocation. For optionals of class references, `nil` is represented as a null pointer, so the check is a single comparison against zero. Chaining is as cheap as the `if let` code you'd write by hand.

## When not to chain

- **When you need to know which link failed.** `a?.b?.c?.d` gives you `nil` without saying why. If that matters, for an error message or for logging, unwrap step by step with `guard let` and handle each case.
- **When a value should never be `nil`.** If `residence` must always exist, make it non-optional, rather than chaining around it everywhere and hiding a real bug.
- **When the silent no-op is dangerous.** `account?.withdraw(100)` silently doing nothing might be worse than an error.

## Common pitfalls

- **Expecting optional chaining to prevent crashes from invalid indices.** It only handles `nil`.
- **Comparing chained booleans.** `user?.isAdmin == true` reads oddly but is correct: `user?.isAdmin` is a `Bool?`, and comparing with `true` handles `nil` as "not admin". `if user?.isAdmin { … }` doesn't compile, because a `Bool?` isn't a `Bool`.
- **Forgetting that assignments may be skipped**, along with any side effects on the right-hand side.

## Interview questions

**What's the type of `person.residence?.numberOfRooms` if `numberOfRooms` is an `Int`?**
`Int?`. Optional chaining always produces an optional.

**Does chaining through two optionals give `Int??`?**
No. Optional chaining flattens to a single level of optionality.

**What happens to the right-hand side of `a?.b = makeValue()` when `a` is `nil`?**
It isn't evaluated at all.

**How do you call an optional closure?**
`completion?(result)`. It calls the closure if it's non-nil, and does nothing otherwise.

## Summary

- `?.` accesses a property, method, or subscript only when the optional has a value; otherwise the whole chain is `nil`.
- The result of a chain is always optional, and nested optionals are flattened.
- Assignments through a `nil` chain are skipped, including evaluating the right-hand side; `Void` calls return `Void?`.
- Pair chains with `??` for defaults; use `map`/`flatMap` for free functions; unwrap step by step when you need to know what failed.
