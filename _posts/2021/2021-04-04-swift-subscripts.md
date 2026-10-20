---
layout: post
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
---

Every time you write `array[0]` or `dictionary["key"]`, you're calling a subscript. Subscripts are shortcuts for accessing elements of a collection, list, or sequence, and you can define them on your own types to give them the same natural syntax.

<!--more-->

## Defining a subscript

A subscript looks like a computed property with parameters:

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

This one is read-only. Unlike functions, subscript parameters have no argument labels by default, which is why you write `threeTimes[6]` and not `threeTimes[index: 6]`.

## Read-write subscripts

Add a `set` block to allow assignment:

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

Subscripts can take several parameters, and setting through a subscript on a struct is a mutation, so `matrix` must be a `var`.

The `precondition` mirrors how `Array` behaves: an invalid index is a programming error and should fail loudly, not return a wrong value.

## Argument labels in subscripts

You can opt into a label when it makes the call clearer:

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

## Returning optionals: a safe index

A popular extension adds a non-crashing subscript to every collection. It returns `nil` instead of trapping on a bad index:

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

Use it where a missing element is a normal, expected case, like reading user-provided indices. Don't use it to hide real bugs.

## Overloading subscripts

A type can have several subscripts with different parameter types:

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

## Static subscripts

Since Swift 5.1, subscripts can be `static`, for lookups on the type itself:

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

Subscripts can be generic too. Here's a type-safe settings store:

```swift
struct SettingKey<Value> {
    let name: String
}

struct Settings2 {
    private var storage: [String: Any] = [:]

    subscript<Value>(key: SettingKey<Value>) -> Value? {
        get { storage[key.name] as? Value }
        set { storage[key.name] = newValue }
    }
}

let fontSize = SettingKey<Int>(name: "fontSize")
var settings = Settings2()
settings[fontSize] = 17
let size: Int? = settings[fontSize]   // Int, no casting at the call site
```

## Summary

- Subscripts give your types `[ ]` access, read-only or read-write.
- They can take multiple parameters, opt-in labels, and be overloaded.
- An optional-returning subscript like `[safe:]` handles expected missing values.
- Subscripts can be `static` and generic.
