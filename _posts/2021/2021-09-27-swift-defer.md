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

`defer` schedules code to run when the current scope exits, no matter how it exits: a normal `return`, an early `guard`, a thrown error, or a `break` out of a loop. It keeps setup and cleanup side by side, so you can't forget the cleanup on one of many exit paths.

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

The deferred block runs **after** everything else in the scope, just before the scope is left.

## Why it matters: many exit paths

Without `defer`, cleanup must be repeated before every `return`:

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
```

Add a new early return next month, and the resource is still closed.

## With errors

`defer` runs when an error is thrown out of the scope too, which makes it a natural partner for error handling:

```swift
enum ImportError: Error {
    case corrupted
}

func importData(_ resource: Resource) throws {
    resource.open()
    defer { resource.close() }

    throw ImportError.corrupted     // "close" is still printed
}
```

## Locks

One of the most common uses is releasing a lock, so it's never left locked by an early return or a throw:

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
```

## Scope, not function

`defer` is tied to the **current scope**, which can be a loop body, an `if` block, or a `do` block, not necessarily the whole function:

```swift
for index in 1...3 {
    defer { print("End of iteration \(index)") }
    print("Iteration \(index)")
}
// Iteration 1, End of iteration 1, Iteration 2, ...

if true {
    defer { print("Leaving the if block") }
    print("Inside the if block")
}
```

## Multiple `defer`s run in reverse order

When a scope has several `defer` blocks, they run in **reverse** order of declaration, like a stack. That's exactly right for nested resources: whatever was acquired last is released first.

```swift
func layered() {
    defer { print("1") }
    defer { print("2") }
    defer { print("3") }
}

layered()   // 3, 2, 1
```

## `defer` only runs if it was reached

A `defer` that appears after an early `return` never registers, so it never runs:

```swift
func example(shouldExit: Bool) {
    if shouldExit { return }
    defer { print("Deferred") }    // only runs when this line was executed
    print("Body")
}

example(shouldExit: true)   // prints nothing
```

Put `defer` right after the setup it undoes.

## Values are read when it runs

A deferred block sees variables as they are when the scope exits, not when the `defer` was written:

```swift
func lastValue() {
    var x = 1
    defer { print("x is \(x)") }
    x = 99
}

lastValue()   // x is 99
```

## What you can't do in `defer`

- You can't `return`, `break`, or `throw` out of a `defer` block, because the scope is already exiting.

## Good and bad uses

**Good:** closing files and connections, unlocking locks, ending signposts or performance measurements, resetting temporary state like an `isLoading` flag.

**Bad:** core logic. If the important work of a function happens in a `defer`, readers have to mentally reorder the function. Keep `defer` for cleanup.

## Summary

- `defer` runs when the current scope exits, through any path: return, throw, break, or falling off the end.
- Put it right after the setup it undoes; it only runs if execution reached it.
- Multiple `defer` blocks run in reverse order.
- Use it for cleanup like closing resources and releasing locks, not for main logic.
