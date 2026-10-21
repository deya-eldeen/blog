---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_error_handling_thumbnail.webp"
thumbnail_ready: true
---

Things go wrong: files are missing, networks drop, users type nonsense. Swift handles recoverable errors with `throw`, `try`, and `catch`, a model that's explicit at every step: you can see which calls can fail just by reading the code, because each one is marked with `try`. Swift 6 adds **typed throws**, which lets a function say exactly which error it can throw. This article covers the whole toolbox, how it works under the hood, and how to design errors that are pleasant to handle.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_error_handling_thumbnail.webp"
 alt_text="An operation routing an error into a recovery path beside its normal result"
 caption="Error Handling in Swift"
 width="640"
 height="400"
%}

## Defining errors

Any type that conforms to the `Error` protocol can be thrown. Enums are a natural fit, because they can list several failure cases, each with its own data:

```swift
enum VendingMachineError: Error {
    case invalidSelection
    case insufficientFunds(coinsNeeded: Int)
    case outOfStock
}
```

Structs work well when errors share common data, like a file path or a line number:

```swift
struct ParseFailure: Error {
    let line: Int
    let message: String
}
```

## Throwing and propagating

A function that can fail is marked `throws`, and reports a failure with `throw`:

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

Throwing immediately exits the function, like `return`. A function doesn't have to handle errors from the calls it makes: by calling them with `try`, it lets them **propagate** to its own caller:

```swift
func buyFavoriteSnack(person: String, machine: VendingMachine) throws -> String {
    let favorites = ["Alice": "Chips", "Bob": "Licorice"]
    let snackName = favorites[person] ?? "Candy Bar"
    return try machine.vend(itemNamed: snackName)    // errors flow up to our caller
}
```

## Catching with `do`/`catch`

Handle errors in a `do` block with `catch` clauses, which use pattern matching:

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
} catch VendingMachineError.insufficientFunds(let coinsNeeded) where coinsNeeded > 5 {
    print("You need a lot more coins.")
} catch VendingMachineError.insufficientFunds(let coinsNeeded) {
    print("Please insert \(coinsNeeded) more coins.")
} catch {
    print("Unexpected error: \(error)")     // `error` is bound automatically
}
// Please insert 4 more coins.
```

With untyped `throws`, a `do` block can throw **any** error, so the compiler requires a final catch-all `catch` (or the enclosing function must throw too).

## `try?` and `try!`

- **`try?`** converts an error into `nil`. Use it when failure just means "no value", and the reason doesn't matter:

```swift
let snack = try? machine.vend(itemNamed: "Chips")   // String?: nil if anything failed
```

- **`try!`** asserts that the call can't fail, and **crashes** if it does. Use it only when a failure would be a programmer error, like decoding a resource bundled with your app, never for input from the outside world.

## Typed throws (Swift 6)

Since Swift 6, a function can declare exactly which error type it throws, with `throws(ErrorType)`:

```swift
enum AgeError: Error {
    case empty
    case notANumber(String)
}

func parseAge(_ text: String) throws(AgeError) -> Int {
    guard !text.isEmpty else { throw .empty }          // the type is known, so `.empty` is enough
    guard let age = Int(text) else { throw .notANumber(text) }
    return age
}

do {
    _ = try parseAge("abc")
} catch {
    // `error` is an AgeError here, not `any Error`, so the switch is exhaustive.
    switch error {
    case .empty: print("Please enter an age")
    case .notANumber(let text): print("\"\(text)\" isn't a number")
    }
}
```

The benefits: callers get a concrete type they can switch over exhaustively, no catch-all is needed, and no existential box is allocated for the error.

Typed throws also make **generic** error handling precise. A function can throw exactly what its closure throws, and when the closure can't throw, the error type is inferred as `Never`, and no `try` is needed at all:

```swift
func transformAll<E: Error>(_ values: [Int], _ transform: (Int) throws(E) -> Int) throws(E) -> [Int] {
    var result: [Int] = []
    for value in values {
        result.append(try transform(value))
    }
    return result
}

let doubled = transformAll([1, 2]) { $0 * 2 }   // E == Never: no `try` required
print(doubled)                                   // [2, 4]
```

In fact, `throws(Never)` *is* non-throwing, and plain `throws` is the same as `throws(any Error)`.

**When to use typed throws:** inside a module, for errors the caller is expected to handle case by case, and in generic code that passes through its closure's errors. For **public APIs**, plain `throws` usually ages better: with a typed error, you can never add a new kind of failure without breaking clients.

## `rethrows`

A function that takes a throwing closure and only throws when the closure does can be marked `rethrows`. Callers only need `try` when they pass a throwing closure:

```swift
func callTwice(_ body: () throws -> Int) rethrows -> Int {
    try body() + body()
}

print(callTwice { 21 })   // 42: no `try`, because the closure doesn't throw
```

That's how `map`, `filter`, and `sorted(by:)` let you throw from their closures without forcing `try` on everyone else.

## Cleaning up with `defer`

`defer` runs code when the current scope exits, including when an error is thrown, which makes it the natural place for cleanup:

```swift
func processFile(at path: String) throws {
    guard let handle = FileHandle(forReadingAtPath: path) else {
        throw CocoaError(.fileNoSuchFile)
    }
    defer {
        try? handle.close()          // runs whether we return normally or throw
    }
    // ... read and process; any error thrown here still closes the file
}
```

More in [defer in Swift](/swift-defer/).

## User-facing messages: `LocalizedError`

Conform to `LocalizedError` to give errors readable messages. `localizedDescription` uses your `errorDescription`, which is what alerts usually display:

```swift
enum UploadError: Error, LocalizedError {
    case tooLarge(megabytes: Int)
    case offline

    var errorDescription: String? {
        switch self {
        case .tooLarge(let megabytes): "The file is \(megabytes) MB. The limit is 10 MB."
        case .offline: "You're offline. Check your connection and try again."
        }
    }
}

let uploadError: Error = UploadError.tooLarge(megabytes: 25)
print(uploadError.localizedDescription)   // The file is 25 MB. The limit is 10 MB.
```

Without it, `localizedDescription` for a Swift error is a generic message that's useless to users.

## Bridging to `NSError`

On Apple platforms, every Swift error can be converted to an `NSError`, which is how errors reach Objective-C code, analytics, and crash reporters. The domain is the error type's fully qualified name, and the code is derived from the enum case, but **not** necessarily in declaration order:

```swift
let bridged = AgeError.notANumber("x") as NSError
print(bridged.domain, bridged.code)          // MyApp.AgeError 0
print((AgeError.empty as NSError).code)      // 1, even though `empty` is declared first
```

If the domain or codes matter, for example for analytics dashboards or Objective-C callers, set them explicitly with `CustomNSError`:

```swift
extension UploadError: CustomNSError {
    static var errorDomain: String { "com.example.upload" }

    var errorCode: Int {
        switch self {
        case .tooLarge: 1001
        case .offline: 1002
        }
    }
}

print((UploadError.offline as NSError).code)   // 1002
```

## `Result`

`Result<Success, Failure>` stores either a value or an error. It's useful for storing an outcome to process later, passing it across a boundary, or in older callback-based APIs:

```swift
func fetchUsername(completion: (Result<String, UploadError>) -> Void) {
    completion(.success("sam"))
}

fetchUsername { result in
    switch result {
    case .success(let name): print("Hello, \(name)")
    case .failure(let error): print("Failed: \(error.localizedDescription)")
    }
}

let outcome = Result { try machine.vend(itemNamed: "Chips") }   // capture a throwing call
print((try? outcome.get()) ?? "nothing")
```

With `async`/`await`, plain `throws` usually reads better than passing `Result` around.

## Under the hood: errors are cheap

Swift errors aren't C++-style exceptions that unwind the stack through tables. A throwing function returns its error through a **dedicated register**, and the caller checks it after the call, like an extra return value. Throwing is therefore about as cheap as returning, and there's no hidden cost in functions that *can* throw but don't. That's why it's fine to use errors for expected failures like validation.

With untyped `throws`, the error is boxed in an `any Error` existential, which may allocate. Typed throws avoid that box, which matters in embedded or performance-critical code.

## Errors vs. crashes

Swift separates two kinds of failure:

- **Recoverable errors**: bad input, missing files, network failures, permission denials. Throw them, and let callers decide.
- **Programmer errors**: an out-of-range index, a broken invariant, an impossible state. Stop the program with `precondition` or `fatalError`, because continuing would only cause stranger bugs later.

`assert` checks only in debug builds; `precondition` checks in release builds too; `fatalError` always stops.

## Designing good errors

- **Model errors per domain** (`NetworkError`, `ValidationError`), not one giant `AppError`.
- **Carry the data needed to recover or explain**: the field that failed, the status code, the file path.
- **Translate at boundaries**: convert low-level errors (`URLError`, `DecodingError`) into errors your app's UI understands.
- **Never swallow errors silently** with an empty `catch {}`; at minimum, log them.

## Interview questions

**How do Swift errors differ from exceptions in other languages?**
They're explicit (`throws`, `try`), checked by the compiler, and implemented as cheap extra return values rather than stack unwinding.

**What's the difference between `try?` and `try!`?**
`try?` turns an error into `nil`; `try!` crashes if an error is thrown.

**What does typed throws add?**
A concrete error type in the signature: exhaustive `catch` handling, no existential boxing, and precise generic rethrowing, with `throws(Never)` meaning non-throwing.

**When should you use `rethrows`?**
For functions that take a throwing closure and only throw when that closure does, so callers with non-throwing closures don't need `try`.

## Summary

- Errors are values conforming to `Error`; throwing functions are marked `throws`, and every call is marked `try`.
- Handle errors with `do`/`catch` (with pattern matching) or let them propagate; `try?` turns them into `nil`, `try!` asserts success.
- Typed throws (Swift 6) give precise error types, exhaustive catches, and `Never`-inferred generic code; prefer plain `throws` for public APIs.
- `LocalizedError` and `CustomNSError` control user-facing messages and `NSError` bridging.
- Throwing is cheap; reserve crashes for programmer errors.
