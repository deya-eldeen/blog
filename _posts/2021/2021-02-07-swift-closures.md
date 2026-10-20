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
thumbnail: "images/covers/swift_closures_thumbnail.webp"
thumbnail_ready: true
---

A closure is a block of code you can pass around and run later, together with the variables it uses from its surroundings. Completion handlers, `map` and `filter`, sort orders, animations, button actions: closures are everywhere in Swift. Their syntax can shrink from verbose to remarkably terse, and their capturing behavior is behind both some of Swift's most elegant APIs and some of its most common memory bugs.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_closures_thumbnail.webp"
 alt_text="A function capsule carrying captured values and links to its surrounding context"
 caption="Closures in Swift"
 width="640"
 height="400"
%}

## Three kinds of closures

The Swift book describes closures as taking one of three forms:

1. **Global functions**, which have a name and capture nothing.
2. **Nested functions**, which have a name and can capture values from their enclosing function.
3. **Closure expressions**, unnamed blocks written inline, which capture values from their surroundings.

They're all the same thing to the type system: values of a function type like `(Int) -> Bool`. Most of this article is about closure expressions, because that's what you write all day.

## From function to closure expression

A sort with a named function:

```swift
let names = ["Chris", "Alex", "Ewa", "Barry", "Daniella"]

func backward(_ a: String, _ b: String) -> Bool {
    a > b
}

let sortedA = names.sorted(by: backward)
```

The same logic written inline as a closure expression:

```swift
let sortedB = names.sorted(by: { (a: String, b: String) -> Bool in
    return a > b
})
```

The general shape is `{ (parameters) -> ReturnType in statements }`. The `in` keyword separates the signature from the body.

## Shrinking the syntax, step by step

Swift lets you drop everything it can infer from context. Each line below does exactly the same thing:

```swift
let sortedC = names.sorted(by: { a, b in return a > b })   // parameter and return types inferred
let sortedD = names.sorted(by: { a, b in a > b })          // single expression: implicit return
let sortedE = names.sorted(by: { $0 > $1 })                // shorthand argument names
let sortedF = names.sorted { $0 > $1 }                     // trailing closure
let sortedG = names.sorted(by: >)                          // an operator is a function too
```

How far to go is a readability decision:

- `$0` is great for one-liners where the meaning is obvious: `numbers.map { $0 * 2 }`.
- Named parameters are better as soon as the closure spans several lines, or when there are two or more parameters with different roles: `{ index, element in … }` beats `$0` and `$1`.

Key paths can stand in for simple property-access closures (since Swift 5.2), which is often the clearest option of all:

```swift
struct Person {
    let name: String
    let age: Int
}

let people = [Person(name: "Zoe", age: 30), Person(name: "Ali", age: 25)]
let peopleNames = people.map(\.name)              // ["Zoe", "Ali"]
let youngest = people.min { $0.age < $1.age }
```

## Trailing closures

When the last argument of a call is a closure, you can write it after the parentheses, and drop the parentheses entirely if it's the only argument:

```swift
let shouted = names.map { $0.uppercased() }

let total = [1, 2, 3].reduce(0) { partial, value in
    partial + value
}
```

Since Swift 5.3, a call can have **multiple trailing closures**. The first is unlabeled, and the following ones use their argument labels:

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

This is especially nice for UI APIs that take an action and a completion, like animation blocks.

## Capturing values

Here's what makes closures more than anonymous functions: they **capture** variables from the scope where they're created, and keep them alive for as long as the closure itself lives.

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
print(bySeven()) // 7: a separate captured `total`
```

`total` is a local variable of `makeIncrementer`, yet it survives after the function returns, because the closure captured it. Each call to `makeIncrementer` creates a new `total`, so `byTen` and `bySeven` don't interfere.

### Captures are by reference

By default, a closure captures the **variable itself**, not a copy of its value. It sees changes made after it was created, and its own changes are visible outside:

```swift
var counter = 0
let printCounter = { print("counter is \(counter)") }

counter = 5
printCounter()   // counter is 5

let incrementCounter = { counter += 1 }
incrementCounter()
print(counter)   // 6
```

If you want a snapshot of the value at creation time instead, list the variable in a **capture list**:

```swift
var level = 1
let printLevel = { [level] in print("captured level \(level)") }
level = 2
printLevel()     // captured level 1
```

Capture lists also let you capture objects weakly, which is essential for avoiding memory leaks, as we'll see below.

### Loops capture a fresh value each time

In a `for-in` loop, each iteration gets its own constant, so closures created in a loop capture different values:

```swift
var handlers: [() -> Void] = []
for index in 0..<3 {
    handlers.append { print("loop value \(index)") }
}
handlers.forEach { $0() }   // 0, 1, 2
```

But a variable declared *outside* the loop is shared by every closure:

```swift
var shared = 0
var sharedHandlers: [() -> Void] = []
for _ in 0..<3 {
    shared += 1
    sharedHandlers.append { print("shared \(shared)") }
}
sharedHandlers.forEach { $0() }   // 3, 3, 3
```

If you've used JavaScript's `var` in loops, the first behavior is the one you always wished it had.

## Closures are reference types

Assigning a closure to another constant doesn't copy its captured state. Both names refer to the same closure, with the same captured variables:

```swift
let sameIncrementer = byTen
print(sameIncrementer())   // 30: it shares `total` with byTen
```

That's important for memory management: a closure is an object with a reference count, and it holds strong references to everything it captures.

## Storing closures: callbacks and handlers

Storing a closure in a property is how callbacks, event handlers, and completion blocks usually work:

```swift
final class DownloadButton {
    var onTap: (() -> Void)?

    func simulateTap() {
        onTap?()
    }
}

let downloadButton = DownloadButton()
downloadButton.onTap = {
    print("Download started")
}
downloadButton.simulateTap()
```

A closure stored in a property outlives the function call that received it. Swift calls this an **escaping** closure, and function parameters that will be stored must be marked `@escaping`. Parameters are non-escaping by default, which lets the compiler optimize them and guarantees they can't create long-lived references.

## The classic leak: capturing `self`

Here's the bug every iOS developer writes at least once:

```swift
final class ProfileScreen {
    var name = "Sam"
    let saveButton = DownloadButton()

    func configure() {
        saveButton.onTap = {
            print("Saving \(self.name)")     // the closure strongly captures self
        }
    }

    deinit {
        print("ProfileScreen freed")
    }
}
```

`ProfileScreen` owns `saveButton`, `saveButton` owns its `onTap` closure, and the closure owns `ProfileScreen`. That's a **strong reference cycle**, and none of the three will ever be freed, even after the screen is closed. The fix is a weak capture:

```swift
final class FixedProfileScreen {
    var name = "Sam"
    let saveButton = DownloadButton()

    func configure() {
        saveButton.onTap = { [weak self] in
            guard let self = self else { return }
            print("Saving \(self.name)")
        }
    }
}
```

`[weak self]` captures a weak reference, which doesn't keep the screen alive. Inside, `self` is optional, and `guard let self = self` turns it back into a strong reference just for the duration of that call, or exits if the screen is already gone.

Not every closure that mentions `self` needs this. Closures that run immediately, like the ones passed to `map` or `forEach`, can't create lasting cycles. The danger is a closure that's *stored* by something `self` owns.

## Autoclosures

An `@autoclosure` parameter wraps an expression in a closure automatically, delaying its evaluation until the function decides to call it. That's how `assert` avoids computing its message when assertions are disabled, and how `&&` and `||` short-circuit:

```swift
func logIfNeeded(_ enabled: Bool, _ message: @autoclosure () -> String) {
    if enabled {
        print(message())
    }
}

logIfNeeded(false, names.joined(separator: ", "))   // the join never runs
```

Use autoclosures rarely: at the call site, nothing tells the reader that the expression might not be evaluated.

## Under the hood

- **A closure value is two pointers**: one to the code, one to a **context** object holding the captured variables. Capturing nothing means no context needs to be allocated.
- **Captured variables live in boxes.** A local `var` that's captured by an escaping closure is moved into a small heap-allocated box, so the variable can outlive its scope and be shared by every closure that captures it. That's the mechanism behind "captures are by reference".
- **Non-escaping closures are cheaper.** Since the compiler knows they won't outlive the call, it can keep their context on the stack and often inline them entirely. That's why non-escaping is the default.
- **Captures are strong by default**, adding to the reference count of every captured object. That's what makes the `self` cycle possible.

## Common pitfalls

- **Retain cycles** through stored closures that capture `self`. Use `[weak self]`, or capture only the values you need.
- **Expecting a snapshot but getting a reference.** Without a capture list, the closure sees the variable's current value when it runs.
- **Shared state between closures.** All closures that capture the same variable share it.
- **Heavy `$0` usage** in long closures, which forces the reader to keep track of positional arguments.
- **Side effects in `map`.** Use `forEach` or a `for-in` loop for side effects, and keep `map` for transformations.

## Interview questions

**What does it mean that closures "capture" variables?**
They keep references to variables from their defining scope, so those variables stay alive and shared for as long as the closure exists. Captured local variables are moved into heap boxes when needed.

**Are closures value or reference types?**
Reference types. Copying a closure shares its captured state.

**How does a capture list change behavior?**
`[x]` captures the value of `x` at creation time instead of the variable. `[weak self]` or `[unowned self]` captures `self` without a strong reference.

**When does a closure that uses `self` cause a leak?**
When `self` (directly or indirectly) stores the closure, and the closure strongly captures `self`, forming a cycle.

## Summary

- Closures are blocks of code plus the variables they capture; functions and closures share the same function types.
- Inference, implicit returns, `$0`, key paths, and trailing closures make them concise; keep them readable.
- Captures are by reference by default; capture lists take snapshots or weak references.
- Closures are reference types, and stored closures that capture `self` strongly are the classic source of memory leaks.
