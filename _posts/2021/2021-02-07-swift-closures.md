---
layout: post
title: "Closures in Swift"
date: "2021-02-07"
last_modified_at: "2021-02-07"
permalink: /swift-closures/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Closures"
  - "Functions"
---

A closure is a self-contained block of code you can pass around and call later. Completion handlers, `map` and `filter`, SwiftUI button actions, sort orders: closures are everywhere in Swift, and Swift gives them a syntax that can shrink from verbose to remarkably terse.

<!--more-->

## From function to closure

Here's a sort with a regular function:

```swift
let names = ["Chris", "Alex", "Ewa", "Barry", "Daniella"]

func backward(_ a: String, _ b: String) -> Bool {
    a > b
}

let sortedA = names.sorted(by: backward)
```

The same thing as a **closure expression**, written inline:

```swift
let sortedB = names.sorted(by: { (a: String, b: String) -> Bool in
    return a > b
})
```

The general shape is `{ (parameters) -> ReturnType in statements }`.

## Shrinking the syntax

Swift lets you drop everything it can infer. Each line below is equivalent:

```swift
let sortedC = names.sorted(by: { a, b in return a > b })   // types inferred
let sortedD = names.sorted(by: { a, b in a > b })          // implicit return
let sortedE = names.sorted(by: { $0 > $1 })                // shorthand argument names
let sortedF = names.sorted(by: >)                          // operator as a function
```

Shorthand names (`$0`, `$1`) are great for short, obvious closures. For anything longer than a line, named parameters make the code easier to read.

## Trailing closures

When a closure is the last argument, you can write it after the parentheses:

```swift
let shouted = names.map { $0.uppercased() }

let total = [1, 2, 3].reduce(0) { partial, value in
    partial + value
}
```

If a function takes several closures, label the extra ones (Swift 5.3+):

```swift
func load(onSuccess: (String) -> Void, onFailure: (Error) -> Void) {
    onSuccess("data")
}

load { data in
    print("Loaded \(data)")
} onFailure: { error in
    print("Failed: \(error)")
}
```

## Capturing values

Closures **capture** variables from the scope where they're created, and keep them alive as long as the closure lives:

```swift
func makeIncrementer(step: Int) -> () -> Int {
    var total = 0
    return {
        total += step
        return total
    }
}

let byTen = makeIncrementer(step: 10)
print(byTen())   // 10
print(byTen())   // 20

let bySeven = makeIncrementer(step: 7)
print(bySeven()) // 7, a separate captured `total`
```

By default, closures capture variables **by reference**: the closure sees later changes to the variable, and changes it makes are visible outside. Capture lists, like `[weak self]` or `[count]`, change that; they deserve an article of their own.

## Closures are reference types

Assigning a closure to another constant doesn't copy its captured state; both refer to the same closure:

```swift
let sameIncrementer = byTen
print(sameIncrementer())   // 30, it shares state with byTen
```

## Closures as properties

Storing a closure is how callbacks and event handlers usually work:

```swift
final class DownloadButton {
    var onTap: (() -> Void)?

    func simulateTap() {
        onTap?()
    }
}

let button = DownloadButton()
button.onTap = {
    print("Download started")
}
button.simulateTap()
```

A stored closure outlives the function call that received it, which makes it an **escaping** closure. That has consequences for memory and syntax, which a future article on escaping closures will cover.

## Autoclosures

An `@autoclosure` parameter wraps an expression in a closure automatically, delaying its evaluation. That's how `assert` avoids computing its message unless it's needed:

```swift
func logIfNeeded(_ enabled: Bool, _ message: @autoclosure () -> String) {
    if enabled {
        print(message())
    }
}

logIfNeeded(false, names.joined(separator: ", "))   // join never runs
```

Use autoclosures rarely: at the call site, nothing tells the reader the expression might not run.

## Summary

- Closures are inline functions: `{ params in body }`.
- Type inference, implicit returns, `$0`, and trailing closures make them concise.
- Closures capture variables by reference and keep them alive.
- Closures are reference types; stored closures escape the function that received them.
