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

Optional chaining lets you call properties, methods, and subscripts on an optional that might be `nil`, all in one expression. If any link in the chain is `nil`, the whole chain quietly returns `nil` instead of crashing. It's the polite alternative to force-unwrapping with `!`.

<!--more-->

## The problem it solves

```swift
final class Residence {
    var numberOfRooms = 1
    var address: Address?
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

`john.residence` is `nil`. Force-unwrapping it crashes:

```swift
// let rooms = john.residence!.numberOfRooms   // crash: unexpectedly found nil
```

## Chaining with `?`

Put `?` after the optional instead, and the access only happens if there's a value:

```swift
if let rooms = john.residence?.numberOfRooms {
    print("John's residence has \(rooms) room(s).")
} else {
    print("Unable to retrieve the number of rooms.")
}
```

Notice the type: `numberOfRooms` is an `Int`, but `john.residence?.numberOfRooms` is an `Int?`. **The result of optional chaining is always optional**, because the chain might fail.

## Multiple levels

Chains can go as deep as you need, and they stop at the first `nil`:

```swift
john.residence = Residence()
let street = john.residence?.address?.street      // String?, nil because address is nil

john.residence?.address = Address(street: "1 Infinite Loop", city: "Cupertino")
print(john.residence?.address?.street ?? "none")  // 1 Infinite Loop
```

The result doesn't become "more optional" as you go deeper. `street` is already a `String?`, and chaining through two optionals still gives a `String?`, not a `String??`.

## Calling methods

```swift
let description = john.residence?.address?.formatted()   // String?
```

Even methods returning `Void` work: the call returns `Void?`, which tells you whether the method ran:

```swift
final class Lamp {
    func turnOn() { print("Light!") }
}

let maybeLamp: Lamp? = nil
if maybeLamp?.turnOn() != nil {
    print("Lamp turned on")
} else {
    print("No lamp to turn on")
}
```

## Setting values through a chain

Assignment through an optional chain does nothing if any link is `nil`, and the right side **isn't even evaluated**:

```swift
func makeAddress() -> Address {
    print("Building address")
    return Address(street: "Main St")
}

let nobody = Resident()
nobody.residence?.address = makeAddress()   // "Building address" is never printed
```

## Subscripts

Put the `?` before the brackets when the collection itself is optional:

```swift
var testScores: [String: [Int]]? = ["Dave": [86, 82, 84]]
let first = testScores?["Dave"]?[0]           // 86, as Int?
testScores?["Dave"]?[0] = 91
```

`testScores?["Dave"]` checks that the dictionary exists; the second `?` handles the key possibly missing.

## Combining with other tools

Optional chaining shines next to `??`, `if let`, and `guard let`:

```swift
let city = john.residence?.address?.city ?? "Unknown city"

func roomCount(for resident: Resident) -> Int {
    guard let rooms = resident.residence?.numberOfRooms else { return 0 }
    return rooms
}
```

It also works with `map` and `flatMap` on optionals, but `?.` usually reads better.

## When not to chain

Long chains like `a?.b?.c?.d?.e` hide *which* link was `nil`. If that matters for debugging or error messages, unwrap step by step with `guard let` and handle each failure. And if a value should never be `nil`, consider making it non-optional instead of chaining around it everywhere.

## Summary

- `?.` accesses a property, method, or subscript only when the optional has a value.
- The result of a chain is always optional, and nesting doesn't add extra layers.
- Assignments through a nil chain are skipped, including evaluating the right-hand side.
- Pair chains with `??` for defaults and `guard let` for early exits.
