---
layout: post
title: "Error Handling in Swift"
date: "2024-09-26"
last_modified_at: "2024-09-26"
permalink: /swift-error-handling/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Errors"
  - "Basics"
---

Things go wrong: files are missing, networks drop, users type nonsense. Swift handles recoverable errors with `throw`, `try`, and `catch`, a model that's explicit at every step. You can see which calls can fail just by reading the code, because each one is marked with `try`.

<!--more-->

## Defining errors

Any type that conforms to the `Error` protocol can be thrown. Enums are a natural fit, because they can describe several failure cases with associated data:

```swift
enum VendingMachineError: Error {
    case invalidSelection
    case insufficientFunds(coinsNeeded: Int)
    case outOfStock
}
```

## Throwing

A function that can fail is marked `throws`, and uses `throw` to report an error:

```swift
struct Item {
    var price: Int
    var count: Int
}

final class VendingMachine {
    var inventory = [
        "Candy Bar": Item(price: 12, count: 7),
        "Chips": Item(price: 10, count: 4),
        "Pretzels": Item(price: 7, count: 0),
    ]
    var coinsDeposited = 0

    func vend(itemNamed name: String) throws -> String {
        guard let item = inventory[name] else {
            throw VendingMachineError.invalidSelection
        }
        guard item.count > 0 else {
            throw VendingMachineError.outOfStock
        }
        guard item.price <= coinsDeposited else {
            throw VendingMachineError.insufficientFunds(coinsNeeded: item.price - coinsDeposited)
        }

        coinsDeposited -= item.price
        inventory[name]?.count -= 1
        return name
    }
}
```

Throwing immediately exits the function, like `return`. Swift errors are **not** expensive exceptions that unwind the stack; a throw is about as cheap as returning a value.

## Catching with `do`/`catch`

Call a throwing function with `try`, inside a `do` block, and handle errors in `catch` clauses, which use [pattern matching](/swift-pattern-matching/):

```swift
let machine = VendingMachine()
machine.coinsDeposited = 8

do {
    let snack = try machine.vend(itemNamed: "Candy Bar")
    print("Enjoy your \(snack)")
} catch VendingMachineError.invalidSelection {
    print("Invalid selection.")
} catch VendingMachineError.outOfStock {
    print("Out of stock.")
} catch VendingMachineError.insufficientFunds(let coinsNeeded) {
    print("Please insert \(coinsNeeded) more coins.")
} catch {
    print("Unexpected error: \(error)")     // `error` is available automatically
}
```

## Propagating errors

You don't have to handle an error where it happens. A throwing function can let errors pass through to its caller just by using `try`:

```swift
func buyFavoriteSnack(person: String, machine: VendingMachine) throws -> String {
    let favorites = ["Alice": "Chips", "Bob": "Licorice"]
    let snackName = favorites[person] ?? "Candy Bar"
    return try machine.vend(itemNamed: snackName)    // errors flow up to our caller
}
```

## `try?` and `try!`

- `try?` converts an error into `nil`. Use it when failure just means "no value" and the reason doesn't matter:

```swift
let snack = try? machine.vend(itemNamed: "Chips")   // String?
```

- `try!` asserts that the call can't fail, and crashes if it does. Use it only when failure would be a programmer error, like loading a resource bundled with your app.

## Cleaning up with `defer`

`defer` runs code when the current scope exits, whether normally or because of a thrown error. It's ideal for cleanup:

```swift
func processFile(at path: String) throws {
    let handle = FileHandle(forReadingAtPath: path)
    defer {
        try? handle?.close()
    }
    guard handle != nil else {
        throw CocoaError(.fileNoSuchFile)
    }
    // ... read and process; the handle is closed however we leave this scope
}
```

More on that in [defer in Swift](/swift-defer/).

## Typed throws

Since Swift 6, a function can declare exactly which error type it throws:

```swift
enum ParseError: Error {
    case empty
    case notANumber(String)
}

func parseAge(_ text: String) throws(ParseError) -> Int {
    guard !text.isEmpty else { throw .empty }
    guard let age = Int(text) else { throw .notANumber(text) }
    return age
}

do {
    let age = try parseAge("abc")
    print(age)
} catch {
    // `error` is a ParseError here, not just `any Error`
    switch error {
    case .empty: print("Please enter an age")
    case .notANumber(let text): print("\(text) isn't a number")
    }
}
```

Typed throws are most useful inside a module, or in generic code that rethrows exactly what its closure throws. For public APIs, the plain `throws` usually ages better, because you can add new error types later without breaking callers.

## `Result`

`Result<Success, Failure>` stores either a value or an error. It's handy for storing an outcome to process later, or in callback-based APIs:

```swift
func fetchUsername(completion: (Result<String, VendingMachineError>) -> Void) {
    completion(.success("sam"))
}

fetchUsername { result in
    switch result {
    case .success(let name): print("Hello, \(name)")
    case .failure(let error): print("Failed: \(error)")
    }
}

let outcome = Result { try machine.vend(itemNamed: "Chips") }   // from a throwing call
```

With `async`/`await`, plain `throws` usually reads better than `Result`.

## Errors vs. crashes

Swift separates two kinds of failure:

- **Recoverable errors** (bad input, missing files, network failures) are thrown and handled.
- **Programmer errors** (an out-of-range index, a broken invariant) should stop the program with `precondition` or `fatalError`, because continuing would only cause stranger bugs later.

## Summary

- Errors are values conforming to `Error`, usually enums; functions that fail are marked `throws`.
- Every throwing call is marked `try`; handle errors with `do`/`catch` or let them propagate.
- `try?` turns errors into `nil`; `try!` asserts success and crashes otherwise.
- `defer` guarantees cleanup; typed throws (Swift 6) and `Result` add precision when needed.
