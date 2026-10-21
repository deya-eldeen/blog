---
layout: post
hidden: true
title: "Subscripts in Swift"
date: "2021-04-04"
last_modified_at: "2021-04-04"
permalink: /swift-subscripts/
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
  - "Collections"
thumbnail: "images/covers/swift_subscripts_thumbnail.webp"
thumbnail_ready: true
---

Every time you write `array[0]`, `dictionary["key"]`, or `string[index]`, you're calling a subscript. Subscripts are a shortcut for accessing parts of a value, and you can define them on your own types to give them the same natural square-bracket syntax. They're also more powerful than they look: they can take several parameters, be generic, be static, and even power dynamic member lookup.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_subscripts_thumbnail.webp"
 alt_text="Square brackets selecting one drawer in an indexed storage rack"
 caption="Subscripts in Swift"
 width="640"
 height="400"
%}

## Defining a subscript

A subscript looks like a cross between a computed property and a method:

```swift
struct TimesTable {
    let multiplier: Int

    subscript(index: Int) -> Int {
        multiplier * index
    }
}

let threeTimes = TimesTable(multiplier: 3)
print(threeTimes[6])   // 18
```

This one is read-only, like a computed property with only a getter. Note one difference from functions: **subscript parameters have no argument labels by default.** That's why you write `threeTimes[6]`, not `threeTimes[index: 6]`.

## Read-write subscripts

Add `get` and `set` blocks to make a subscript assignable:

```swift
struct Grid {
    let rows: Int
    let columns: Int
    private var values: [Double]

    init(rows: Int, columns: Int) {
        self.rows = rows
        self.columns = columns
        values = Array(repeating: 0, count: rows * columns)
    }

    func isValid(row: Int, column: Int) -> Bool {
        row >= 0 && row < rows && column >= 0 && column < columns
    }

    subscript(row: Int, column: Int) -> Double {
        get {
            precondition(isValid(row: row, column: column), "Index out of range")
            return values[row * columns + column]
        }
        set {
            precondition(isValid(row: row, column: column), "Index out of range")
            values[row * columns + column] = newValue
        }
    }
}

var matrix = Grid(rows: 2, columns: 2)
matrix[0, 1] = 1.5
matrix[1, 0] = 3.2
print(matrix[0, 1])   // 1.5
```

Three things to notice:

- Subscripts can take **several parameters**, so a two-dimensional grid reads naturally as `matrix[row, column]`.
- Setting through a subscript of a struct is a **mutation**, so `matrix` must be a `var`, just like with a mutating method.
- The `precondition` mirrors `Array`'s behavior: an invalid index is a programming error, so it stops the program instead of returning a wrong value. Storing a 2D grid in one flat array (`row * columns + column`) keeps the data contiguous, which is faster than an array of arrays.

## Argument labels in subscripts

You can opt into a label by writing it explicitly, which helps when the meaning of the parameter isn't obvious:

```swift
struct Library {
    private var books = ["978-0-13-468599-1": "The Pragmatic Programmer"]

    subscript(isbn isbn: String) -> String? {
        books[isbn]
    }
}

let library = Library()
print(library[isbn: "978-0-13-468599-1"] ?? "Not found")
```

## Optional-returning subscripts

A very popular extension adds a non-crashing subscript to every collection. It returns `nil` instead of trapping on a bad index:

```swift
extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

let colors = ["red", "green", "blue"]
print(colors[safe: 1] ?? "none")    // green
print(colors[safe: 10] ?? "none")   // none
```

Use it where a missing element is a normal, expected situation, like reading an index that came from user input or a server. Don't sprinkle it everywhere to avoid crashes: if an index *should* be valid, a crash in development is better than silently showing the wrong data.

`Dictionary` uses the same idea in its own API: its key subscript returns an optional, because a missing key is normal.

## Overloading subscripts

A type can have several subscripts, as long as their parameter types or labels differ:

```swift
struct Spreadsheet {
    private var cells: [String: String] = [:]

    subscript(cell: String) -> String {
        get { cells[cell, default: ""] }
        set { cells[cell] = newValue }
    }

    subscript(column: Character, row: Int) -> String {
        get { self["\(column)\(row)"] }
        set { self["\(column)\(row)"] = newValue }
    }
}

var sheet = Spreadsheet()
sheet["A1"] = "Name"
sheet["B", 1] = "Score"
print(sheet["B1"])   // Score
```

`Array` does this too: `array[2]` returns an element, while `array[1...3]` returns an `ArraySlice`.

## Static subscripts

Since Swift 5.1, subscripts can belong to the type itself:

```swift
enum Theme {
    private static let colors = ["primary": "#EE7956", "text": "#161C32"]

    static subscript(name: String) -> String? {
        colors[name]
    }
}

print(Theme["primary"] ?? "")
```

## Generic subscripts

Subscripts can be generic, which enables type-safe heterogeneous containers. Here's a settings store where each key knows the type of its value:

```swift
struct SettingKey<Value> {
    let name: String
}

struct SettingsStore {
    private var storage: [String: Any] = [:]

    subscript<Value>(key: SettingKey<Value>) -> Value? {
        get { storage[key.name] as? Value }
        set { storage[key.name] = newValue }
    }
}

let fontSize = SettingKey<Int>(name: "fontSize")
let username = SettingKey<String>(name: "username")

var settings = SettingsStore()
settings[fontSize] = 17
settings[username] = "sam"

let size: Int? = settings[fontSize]     // Int, no casting at the call site
print(size ?? 0, settings[username] ?? "")
```

The storage uses `Any` internally, but the public API never lets you put a `String` under `fontSize`.

## Dynamic member lookup

`@dynamicMemberLookup` turns property syntax into a subscript call. Combined with key paths, it lets a type expose the properties of something it wraps, with full type checking:

```swift
struct Address {
    var city: String
    var zip: String
}

@dynamicMemberLookup
struct Customer {
    var name: String
    var address: Address

    subscript<T>(dynamicMember keyPath: WritableKeyPath<Address, T>) -> T {
        get { address[keyPath: keyPath] }
        set { address[keyPath: keyPath] = newValue }
    }
}

var customer = Customer(name: "Sam", address: Address(city: "Amman", zip: "11118"))
print(customer.city)          // "Amman": really customer.address.city
customer.city = "Irbid"
print(customer.address.city)  // Irbid
```

`customer.city` doesn't exist as a property: the compiler rewrites it into `customer[dynamicMember: \Address.city]`. Because the parameter is a key path, a typo like `customer.cty` is still a compile error. SwiftUI's `Binding` uses exactly this trick, which is why `$model.name` works.

## Why `String` has no integer subscript

Coming from other languages, everyone tries this:

```swift
let word = "Swift"
let second = word[1]   // ❌ cannot subscript String with an Int, use a String.Index instead.
```

Swift strings are collections of `Character`s, and a character can be made of several Unicode scalars (think of emoji with skin tones, or letters with combining accents). Finding the n-th character means walking the string from the start, which is O(n). An `Int` subscript would hide that cost behind syntax that looks O(1), so Swift makes you be explicit:

```swift
let thirdCharacter = word[word.index(word.startIndex, offsetBy: 2)]
print(thirdCharacter)   // i
```

If you need fast random access to characters, convert once with `Array(word)` and index the array.

## Under the hood

A subscript is compiled into accessor functions, just like a computed property: a getter, a setter, and, for types like `Array` and `Dictionary`, a special **modify** accessor. The modify accessor yields direct access to the element's storage, so an in-place operation like:

```swift
var lists = [[1, 2], [3]]
lists[0].append(99)    // appends in place, without copying the inner array
print(lists)           // [[1, 2, 99], [3]]
```

modifies the inner array directly, instead of getting a copy, appending to it, and setting it back. Your own subscripts with a plain `get`/`set` use the get-then-set path, which is fine for most types, but means mutating through them copies the value out and back in.

## Common pitfalls

- **Hiding expensive work** behind brackets. Readers assume subscripts are fast, like array access. If a lookup is O(n) or does I/O, a named method is more honest.
- **Silent `nil`s.** An optional subscript that returns `nil` for an invalid index can turn a real bug into a blank screen.
- **Mutating copies.** `var row = grid.rows[0]; row[1] = 5` changes the copy, not the grid.
- **Integer indexing into strings**: use `String.Index`, or convert to an array once if you need random access.

## Interview questions

**How do subscripts differ from methods?**
They're called with square brackets, can be read-write like properties, and their parameters have no argument labels by default.

**Why can't you write `string[2]` in Swift?**
Characters have variable size in memory, so reaching the n-th one is O(n). Swift uses `String.Index` to make that cost visible.

**What does `@dynamicMemberLookup` do?**
It turns `value.member` into a call to `subscript(dynamicMember:)`. With a key path parameter, the lookup stays type-checked.

**How does `array[i].append(x)` avoid copying the inner array?**
`Array`'s subscript has a modify accessor that gives in-place access to the element, so the inner array is mutated directly.

## Summary

- Subscripts give your types `[ ]` access, read-only or read-write, with any number of parameters.
- Labels are opt-in; subscripts can be overloaded, static, and generic.
- Optional-returning subscripts handle expected missing values; crashing ones catch programming errors.
- `@dynamicMemberLookup` with key paths forwards properties type-safely.
- `String` deliberately has no `Int` subscript, because character access is O(n).
