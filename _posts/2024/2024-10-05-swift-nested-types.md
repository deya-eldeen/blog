---
layout: post
title: "Nested Types in Swift"
date: "2024-10-05"
last_modified_at: "2024-10-05"
permalink: /swift-nested-types/
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
  - "Architecture"
---

Some types only make sense in the context of another type. A playing card's suit, a network request's error, a view model's state: Swift lets you declare these types *inside* the type they belong to. Nested types keep related code together, avoid name clashes, and make APIs read naturally.

<!--more-->

## A first example

```swift
struct BlackjackCard {
    enum Suit: Character {
        case spades = "♠", hearts = "♡", diamonds = "♢", clubs = "♣"
    }

    enum Rank: Int {
        case two = 2, three, four, five, six, seven, eight, nine, ten
        case jack, queen, king, ace

        struct Values {
            let first: Int
            let second: Int?
        }

        var values: Values {
            switch self {
            case .ace:
                return Values(first: 1, second: 11)
            case .jack, .queen, .king:
                return Values(first: 10, second: nil)
            default:
                return Values(first: rawValue, second: nil)
            }
        }
    }

    let rank: Rank
    let suit: Suit

    var description: String {
        var output = "suit is \(suit.rawValue), value is \(rank.values.first)"
        if let second = rank.values.second {
            output += " or \(second)"
        }
        return output
    }
}

let theAceOfSpades = BlackjackCard(rank: .ace, suit: .spades)
print(theAceOfSpades.description)   // suit is ♠, value is 1 or 11
```

Types can nest as deeply as needed: `Values` lives inside `Rank`, which lives inside `BlackjackCard`.

## Referring to nested types

Inside the outer type, you use the short name, `Suit`. Outside, you qualify it with the outer type's name:

```swift
let heartsSymbol = BlackjackCard.Suit.hearts.rawValue    // "♡"
let rankValues: BlackjackCard.Rank.Values = BlackjackCard.Rank.king.values
```

Thanks to type inference, you rarely need the full name: `BlackjackCard(rank: .ace, suit: .spades)` already knows the types.

## Why nest?

### Avoiding name clashes

Two types can each have their own `Error`, `State`, or `Configuration` without prefixes:

```swift
struct LoginViewModel {
    enum State {
        case idle, submitting, failed(String)
    }
    var state = State.idle
}

struct CheckoutViewModel {
    enum State {
        case cart, paying, done
    }
    var state = State.cart
}
```

Compare that with top-level `LoginViewModelState` and `CheckoutViewModelState`.

### Expressing ownership

A nested type says "this belongs to that". Reading `APIClient.Error` tells you exactly where the error comes from:

```swift
struct APIClient {
    enum Error: Swift.Error {
        case invalidURL
        case badStatus(Int)
    }

    func validate(status: Int) throws(APIClient.Error) {
        guard (200..<300).contains(status) else {
            throw .badStatus(status)
        }
    }
}
```

Note the `Swift.Error` in the conformance: inside `APIClient`, the name `Error` now refers to the nested enum, so the standard protocol needs its module name.

### Scoping with access control

A `private` nested type is invisible outside its parent, which is ideal for helpers:

```swift
final class ImageLoader {
    private struct CacheEntry {
        let data: Data
        let date: Date
    }

    private var cache: [URL: CacheEntry] = [:]

    func store(_ data: Data, for url: URL) {
        cache[url] = CacheEntry(data: data, date: Date())
    }
}
```

## Nesting in extensions

You can add nested types in an extension, which helps keep a large type organized:

```swift
extension BlackjackCard {
    enum Color {
        case red, black
    }

    var color: Color {
        switch suit {
        case .hearts, .diamonds: .red
        case .spades, .clubs: .black
        }
    }
}
```

## Nested types and generics

A type nested inside a generic type can use the outer type parameters:

```swift
struct LinkedList<Element> {
    final class Node {
        let value: Element
        var next: Node?
        init(value: Element) { self.value = value }
    }

    private(set) var head: Node?

    mutating func prepend(_ value: Element) {
        let node = Node(value: value)
        node.next = head
        head = node
    }
}

var list = LinkedList<String>()
list.prepend("world")
list.prepend("hello")
print(list.head?.value ?? "")   // hello
```

## Namespaces with caseless enums

Swift has no `namespace` keyword, but an enum with no cases can't be instantiated, which makes it a perfect container for related constants and helpers:

```swift
enum Constants {
    enum API {
        static let baseURL = "https://api.example.com"
        static let timeout = 30.0
    }

    enum Layout {
        static let padding = 16.0
    }
}

print(Constants.API.baseURL)
```

## When not to nest

Deep nesting can make names long and code hard to scan. If a type is useful on its own, or used by many unrelated types, it probably deserves to be top-level. Nest when the inner type genuinely belongs to the outer one.

## Summary

- Declare types inside other types when they only make sense in that context.
- Use the short name inside, and `Outer.Inner` outside.
- Nesting avoids name clashes, expresses ownership, and combines well with `private` and generics.
- Caseless enums work as namespaces for constants and helpers.
