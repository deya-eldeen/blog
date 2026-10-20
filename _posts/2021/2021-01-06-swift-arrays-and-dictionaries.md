---
layout: post
title: "Arrays and Dictionaries in Swift"
date: "2021-01-06"
last_modified_at: "2021-01-06"
permalink: /swift-arrays-and-dictionaries/
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
  - "Collections"
---

Almost every app is a story about lists and lookups: a list of messages, a table of settings, a cache keyed by ID. In Swift, those stories are told with two collection types you'll use every single day: `Array` and `Dictionary`.

<!--more-->

Both are generic, both are value types, and both are far more capable than they first look. Let's walk through how they work and the handful of details that separate everyday code from great code.

## Arrays: ordered collections

An array stores values of a single type in a specific order. You can let Swift infer the type, or spell it out:

```swift
var languages = ["Swift", "Kotlin", "Rust"]   // [String]
var scores: [Int] = []                       // empty array of Int
let zeros = Array(repeating: 0, count: 3)    // [0, 0, 0]
```

`[Int]` is shorthand for `Array<Int>`. Both mean the same thing; the short form is what you'll see in real code.

### Reading and changing elements

```swift
languages.append("Go")
languages.insert("C", at: 0)
languages += ["Zig", "Odin"]

print(languages[1])          // "Swift"
languages[1] = "Swift 6"

let removed = languages.remove(at: 0)    // "C"
print(languages.count, languages.isEmpty)
```

Subscripting an index that doesn't exist **crashes** your app with "Index out of range". Swift prefers a loud crash to silently reading garbage memory. When an index might be invalid, check it first, or use the safe accessors:

```swift
let first = languages.first      // String?
let last = languages.last        // String?

if languages.indices.contains(10) {
    print(languages[10])
}
```

### Iterating

```swift
for language in languages {
    print(language)
}

for (index, language) in languages.enumerated() {
    print("\(index + 1). \(language)")
}
```

### Transforming

Arrays shine with higher-order functions, which return new arrays instead of mutating in place:

```swift
let lengths = languages.map { $0.count }
let short = languages.filter { $0.count <= 4 }
let totalLength = languages.reduce(0) { $0 + $1.count }
let sortedLanguages = languages.sorted()
```

## Dictionaries: key-value lookups

A dictionary maps unique keys to values. Keys must conform to `Hashable`, which is what makes lookups fast, on average constant time, no matter how big the dictionary gets.

```swift
var capitals = ["France": "Paris", "Japan": "Tokyo"]   // [String: String]
var stock: [String: Int] = [:]                           // empty dictionary
```

### Reading always returns an optional

The key might not exist, so a lookup returns an optional:

```swift
let capital = capitals["France"]        // String? -> "Paris"
let missing = capitals["Atlantis"]      // nil

if let tokyo = capitals["Japan"] {
    print("Capital of Japan: \(tokyo)")
}
```

When there's a sensible fallback, provide a default instead of unwrapping:

```swift
let count = stock["apples", default: 0]
```

### Adding, updating, and removing

```swift
capitals["Italy"] = "Rome"             // add
capitals["Japan"] = "Tōkyō"            // update
capitals["France"] = nil               // remove

let old = capitals.updateValue("Kyoto", forKey: "Japan")   // returns the previous value
```

The `default:` subscript is also writable, which makes counting things beautifully short:

```swift
let words = ["swift", "is", "fun", "swift"]
var frequencies: [String: Int] = [:]
for word in words {
    frequencies[word, default: 0] += 1
}
// ["swift": 2, "is": 1, "fun": 1]
```

### Iterating

Dictionaries are **unordered**. Never rely on the order you inserted things in; it can change between runs. Sort when order matters:

```swift
for (country, city) in capitals.sorted(by: { $0.key < $1.key }) {
    print("\(country): \(city)")
}
```

### Building dictionaries from arrays

```swift
struct User {
    let id: Int
    let name: String
}

let users = [User(id: 1, name: "Sam"), User(id: 2, name: "Lina")]

// Index by ID. `uniqueKeysWithValues` traps on duplicate keys.
let usersByID = Dictionary(uniqueKeysWithValues: users.map { ($0.id, $0) })

// Group by a property.
let byInitial = Dictionary(grouping: users) { $0.name.first! }
```

## Value semantics and copy-on-write

Arrays and dictionaries are **value types**. Assigning one to another variable gives you an independent copy:

```swift
var original = [1, 2, 3]
var copy = original
copy.append(4)

print(original)   // [1, 2, 3]
print(copy)       // [1, 2, 3, 4]
```

That sounds expensive, but it isn't. Swift uses **copy-on-write**: both variables share the same storage until one of them is modified, and only then is the data copied. You get the safety of values with the performance of references.

## Performance tips

- **Reserve capacity** when you know roughly how many elements you'll add: `scores.reserveCapacity(1_000)` avoids repeated reallocations.
- **Use `contains` on a `Set` instead of an array** for frequent membership checks. `Array.contains` scans every element.
- **Check `isEmpty`, not `count == 0`.** It reads better, and for some collections it's faster.
- **Pick the right key type.** Small, cheap-to-hash keys like `Int` or `UUID` are faster than long strings.

## Summary

- `Array` is ordered and indexed; out-of-range subscripts crash, so prefer `first`, `last`, and index checks when unsure.
- `Dictionary` maps hashable keys to values; lookups return optionals, and `default:` keeps code short.
- Dictionaries are unordered; sort when you need a stable order.
- Both are value types with copy-on-write, so copying is cheap until you mutate.
