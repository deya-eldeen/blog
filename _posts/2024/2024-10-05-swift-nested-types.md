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
thumbnail: "images/covers/swift_nested_types_thumbnail.webp"
thumbnail_ready: true
---

Some types only make sense in the context of another type. A playing card's suit, a network client's error, a view model's state, a model's coding keys: Swift lets you declare these types **inside** the type they belong to. Nested types keep related code together, avoid name clashes, express ownership, and make APIs read naturally at the call site. Since Swift 5.10, even protocols can be nested.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_nested_types_thumbnail.webp"
 alt_text="A small type token nested inside two related enclosing types"
 caption="Nested Types in Swift"
 width="640"
 height="400"
%}

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
            case .ace: Values(first: 1, second: 11)
            case .jack, .queen, .king: Values(first: 10, second: nil)
            default: Values(first: rawValue, second: nil)
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

Types can nest as deeply as you need: `Values` lives inside `Rank`, which lives inside `BlackjackCard`.

## Referring to nested types

Inside the outer type, you use the short name, `Suit`. Outside, you qualify it with the outer type:

```swift
let heartsSymbol = BlackjackCard.Suit.hearts.rawValue    // "♡"
let kingValues: BlackjackCard.Rank.Values = BlackjackCard.Rank.king.values
print(heartsSymbol, kingValues.first)                    // ♡ 10
```

Thanks to type inference, you rarely need the full name at call sites: `BlackjackCard(rank: .ace, suit: .spades)` already knows the types. `Self.Suit` also works inside the type, which is useful in protocol extensions and generic code.

## Why nest?

### 1. Avoiding name clashes

Two types can each have their own `State`, `Error`, `Configuration`, or `Style` without prefixes:

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

Compare that with top-level `LoginViewModelState` and `CheckoutViewModelState`: longer names, and nothing in the language tying them to their owners.

### 2. Expressing ownership

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

do {
    try APIClient().validate(status: 503)
} catch {
    print(error)   // badStatus(503)
}
```

Note the `Swift.Error` in the conformance: inside `APIClient`, the name `Error` now refers to the nested enum, so the standard protocol must be qualified with its module name. Shadowing like this is legal and common, but it's worth knowing why the qualification is needed.

### 3. Scoping helpers with access control

A `private` nested type is invisible outside its parent, which is ideal for implementation details:

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

## The classic nested type: `CodingKeys`

The most common nested type in Swift code is `CodingKeys`, which customizes how `Codable` maps properties to JSON keys:

```swift
struct User: Codable {
    let id: Int
    let displayName: String

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
    }
}

let json = #"{"id": 1, "display_name": "Sam"}"#
let decoded = try JSONDecoder().decode(User.self, from: Data(json.utf8))
print(decoded.displayName)   // Sam
```

`Codable` looks for a nested type with exactly that name, which shows how nested types can act as a convention between a type and the frameworks that use it.

## Nested protocols (Swift 5.10)

Since Swift 5.10, protocols can be nested inside non-generic types. That's perfect for delegate protocols, which belong to the type that calls them:

```swift
final class TableView {
    protocol Delegate: AnyObject {
        func didSelect(row: Int)
    }

    weak var delegate: Delegate?

    func tap(row: Int) {
        delegate?.didSelect(row: row)
    }
}

final class SettingsScreen: TableView.Delegate {
    func didSelect(row: Int) {
        print("Selected row \(row)")
    }
}

let table = TableView()
let settings = SettingsScreen()
table.delegate = settings
table.tap(row: 2)   // Selected row 2
```

`TableView.Delegate` reads better than a top-level `TableViewDelegate`, and the protocol lives right next to the code that uses it.

## Nesting in extensions

You can add nested types in an extension, which helps keep a large type organized, or add helper types to a type you don't own:

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

print(theAceOfSpades.color)   // black
```

## Nested types and generics

A type nested inside a generic type can use the outer type's parameters:

```swift
struct LinkedList<Element> {
    final class Node {
        let value: Element          // uses the outer generic parameter
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

`LinkedList<String>.Node` and `LinkedList<Int>.Node` are different types, each specialized for its element type.

## Namespaces with caseless enums

Swift has no `namespace` keyword, but an enum with no cases can't be instantiated, which makes it a clean container for related constants and helpers:

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

A caseless enum is preferred over a struct for this, because a struct could accidentally be instantiated: `Constants()`.

## Under the hood

Nesting is purely about **naming and scope**. A nested type has no hidden reference to an instance of its outer type (unlike inner classes in Java), and it doesn't make the outer type larger. `BlackjackCard.Suit` is an ordinary enum whose full name, in symbols and in `String(reflecting:)`, includes its parent: `MyApp.BlackjackCard.Suit`.

## When not to nest

Deep nesting makes names long and code hard to scan. If a type is useful on its own, or used by many unrelated types, it probably deserves to be top-level. A good rule: nest when the inner type **genuinely belongs** to the outer one, and its name only makes sense next to the parent's.

## Interview questions

**Does a nested type have access to an instance of its outer type?**
No. Nesting only affects naming and scope; the nested type has no hidden reference to an outer instance.

**Why write `Swift.Error` inside a type that declares its own `Error`?**
The nested `Error` shadows the standard library protocol inside that type, so the protocol must be qualified with its module.

**Can protocols be nested?**
Since Swift 5.10, inside non-generic types, which is great for delegate protocols like `TableView.Delegate`.

**How do you create a namespace in Swift?**
With a caseless enum holding static members and nested types.

## Summary

- Declare types inside other types when they only make sense in that context; use the short name inside and `Outer.Inner` outside.
- Nesting avoids name clashes, expresses ownership, and combines well with `private`; `CodingKeys` is the classic example.
- Protocols can be nested in non-generic types since Swift 5.10.
- Types nested in generic types can use the outer type's parameters.
- Caseless enums work as namespaces; nesting has no runtime cost and no hidden outer reference.
