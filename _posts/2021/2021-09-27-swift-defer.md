---
layout: post
title: "defer in Swift"
date: "2021-09-27"
last_modified_at: "2021-09-27"
permalink: /swift-defer/
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
  - "Errors"
---

`defer` schedules a block of code to run when the current scope exits, no matter how it exits: a normal `return`, an early `guard` exit, a thrown error, or a `break` out of a loop. It lets you write cleanup right next to the setup it undoes, so you can't forget it on one of many exit paths. It's small, but it has precise rules about scope, order, and timing that are worth knowing well.

<!--more-->

## The basic idea

```swift
func processOrder() {
    print("Start")
    defer {
        print("Cleanup")
    }
    print("Working")
}

processOrder()
// Start
// Working
// Cleanup
```

The deferred block runs **after** everything else in the scope, just before control leaves it.

## Why it matters: many exit paths

Real functions have several ways out. Without `defer`, cleanup has to be repeated before every `return` and in every error path, and it only takes one forgotten copy to leak a resource:

```swift
final class Resource {
    func open() { print("open") }
    func close() { print("close") }
}

func readHeader(from resource: Resource, isValid: Bool, isEmpty: Bool) -> String? {
    resource.open()
    defer { resource.close() }      // written once, runs on every exit

    guard isValid else { return nil }
    guard !isEmpty else { return "" }
    return "HEADER"
}

_ = readHeader(from: Resource(), isValid: false, isEmpty: false)   // open, close
```

Add a new early return next month, and the resource is still closed. That's the point of `defer`: correctness that survives future edits.

## With thrown errors

`defer` also runs when an error propagates out of the scope, which makes it a natural partner for error handling:

```swift
enum ImportError: Error {
    case corrupted
}

func importData(_ resource: Resource) throws {
    resource.open()
    defer { resource.close() }
    throw ImportError.corrupted     // "close" still runs before the error propagates
}

do {
    try importData(Resource())
} catch {
    print("Import failed: \(error)")
}
// open, close, Import failed: corrupted
```

## Locks

One of the most common uses is releasing a lock, so it can never be left locked by an early return or an error:

```swift
final class Counter {
    private var value = 0
    private let lock = NSLock()

    func increment() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1
        return value              // the return value is computed before unlock runs
    }
}

print(Counter().increment())     // 1
```

The ordering matters: the `return` expression is evaluated first, while the lock is still held, and only then does the deferred `unlock()` run. That's exactly the safety you want.

## Scope, not function

`defer` is tied to the **current scope**, which can be a loop body, an `if` block, a `do` block, or a closure, not necessarily the whole function:

```swift
for index in 1...2 {
    defer { print("End of iteration \(index)") }
    print("Iteration \(index)")
}
// Iteration 1, End of iteration 1, Iteration 2, End of iteration 2

func work() {
    do {
        defer { print("Leaving the do block") }
        print("Inside the do block")
    }
    print("After the do block")
}

work()
```

A bare `do { }` block is a handy way to make a `defer` run in the middle of a function, for example to release a lock before doing slow work.

## Multiple `defer`s run in reverse order

When a scope contains several `defer` blocks, they run in **reverse** order of declaration, like a stack. That's exactly right for nested resources: whatever was acquired last is released first.

```swift
func layered() {
    print("acquire A")
    defer { print("release A") }
    print("acquire B")
    defer { print("release B") }
}

layered()
// acquire A, acquire B, release B, release A
```

## A `defer` only runs if it was reached

A `defer` is registered when execution **passes** it. One that appears after an early `return` never registers:

```swift
func example(shouldExit: Bool) {
    if shouldExit { return }
    defer { print("Deferred") }    // registered only when execution reaches this line
    print("Body")
}

example(shouldExit: true)    // prints nothing
example(shouldExit: false)   // Body, Deferred
```

That's why the convention is to put `defer` **immediately after** the setup it undoes: if the setup happened, the cleanup is registered; if it didn't, there's nothing to clean up.

## Values are read when it runs

A deferred block sees variables as they are when the scope **exits**, not when the `defer` was written:

```swift
func lastValue() {
    var x = 1
    defer { print("x is \(x)") }
    x = 99
}

lastValue()   // x is 99
```

This enables a neat "return the old value, then update" pattern, like a post-increment:

```swift
struct TicketDispenser {
    private(set) var next = 1

    mutating func take() -> Int {
        defer { next += 1 }
        return next             // returns the current value, then increments
    }
}

var dispenser = TicketDispenser()
print(dispenser.take(), dispenser.take(), dispenser.next)   // 1 2 3
```

Use it sparingly: it's compact, but readers have to notice the `defer` to understand the function.

## A trick: triggering property observers from `init`

Property observers don't fire for assignments in a type's own initializer. Assignments inside a `defer` in the initializer, though, happen after initialization is complete, so they do:

```swift
final class Profile {
    var name: String {
        didSet { print("didSet name -> \(name)") }
    }

    init(name: String) {
        self.name = "placeholder"
        defer { self.name = name }   // runs after init finishes, so didSet fires
    }
}

_ = Profile(name: "Sam")   // didSet name -> Sam
```

It works, but it's subtle. If observer logic must run at setup time, calling a clearly named method from `init` is easier for others to understand.

## What you can't do in `defer`

- You can't `return`, `break`, or `continue` out of a `defer` block, and you can't `throw` an error out of it: the scope is already exiting, and there'd be nowhere for the control flow to go. Handle errors inside the block, for example with `try?`.
- You can't refer to variables declared *after* the `defer`, because they might not exist at the point it was registered.

## Under the hood

`defer` is a compile-time feature with no runtime cost of its own. The compiler copies the deferred code to every exit point of the scope that occurs after the `defer` statement: each `return`, each `throw` path, each `break`, and the end of the scope. It's equivalent to writing the cleanup by hand at every exit, just without the chance of forgetting one.

## Good and bad uses

**Good:**

- closing files, sockets, and database transactions,
- unlocking locks and leaving `DispatchGroup`s (`group.enter()` then `defer { group.leave() }`),
- ending balanced operations: performance signposts, `beginUpdates`/`endUpdates`, `UIGraphicsBeginImageContext`/`End…`,
- resetting temporary state, like an `isLoading` flag:

```swift
final class Loader {
    private(set) var isLoading = false

    func load(_ work: () throws -> Void) rethrows {
        isLoading = true
        defer { isLoading = false }   // reset whether work succeeds or throws
        try work()
    }
}
```

**Bad:** core logic. If the important work of a function happens in a `defer`, readers have to mentally reorder the function to understand it. Keep `defer` for cleanup and bookkeeping.

## Interview questions

**When does a `defer` block run?**
When the scope that contains it exits, by any path: normal end, `return`, `break`, `continue`, or a thrown error.

**In what order do multiple `defer` blocks run?**
In reverse order of declaration (last in, first out).

**Does a `defer` placed after a `return` run?**
No. A `defer` only runs if execution reached it and registered it.

**Does `defer` see the value of a variable at declaration time or at exit?**
At exit. It reads the current values when it runs.

## Summary

- `defer` runs when the current scope exits, through any path, including thrown errors.
- It's scoped to the enclosing block (loop body, `if`, `do`, closure), not necessarily the function.
- Multiple `defer` blocks run in reverse order; each runs only if execution reached it.
- It reads variables at exit time, can't transfer control out, and has no runtime cost.
- Use it for cleanup, like closing resources, releasing locks, and resetting flags, right after the matching setup.
