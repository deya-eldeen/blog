---
layout: post
title: "Escaping and Non-Escaping Closures in Swift"
date: "2021-09-30"
last_modified_at: "2021-09-30"
permalink: /swift-escaping-closures/
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
  - "Memory Management"
---

Some closures run and are gone before the function that received them returns. Others are saved for later: stored in a property, handed to a background queue, kept as a completion handler. Swift tracks that difference in the type system with a single attribute, `@escaping`. It affects what the compiler allows, how fast your code runs, and whether you have to think about retain cycles.

<!--more-->

## Non-escaping by default

Since Swift 3 (SE-0103), closure parameters are **non-escaping** unless you say otherwise. The compiler guarantees that a non-escaping closure is only used **during** the function call: it can be called, passed to other non-escaping parameters, and then it's gone.

```swift
func measure(_ label: String, _ work: () -> Void) {
    let start = Date()
    work()                                  // called before measure returns
    let elapsed = Date().timeIntervalSince(start)
    print("\(label) took \(elapsed < 1 ? "less than a second" : "a while")")
}

measure("Summing") {
    _ = (1...100_000).reduce(0, +)
}
```

`map`, `filter`, `sorted(by:)`, `forEach`, `reduce`, and `withUnsafeBufferPointer` all take non-escaping closures.

## What "escaping" means

A closure **escapes** when it can be called **after** the function that received it has returned. That happens when it's:

- stored in a property or a collection,
- called asynchronously, for example from `DispatchQueue.async` or a network callback,
- captured by another closure that escapes.

Try to store a non-escaping closure, and the compiler stops you:

```swift
final class EventBus {
    private var handlers: [() -> Void] = []

    func subscribe(_ handler: () -> Void) {
        handlers.append(handler)    // ❌ converting non-escaping parameter 'handler' ... may allow it to escape
    }
}
```

Marking the parameter `@escaping` makes the intent explicit, to the compiler and to every caller:

```swift
final class Notifier {
    private var handlers: [() -> Void] = []

    func subscribe(_ handler: @escaping () -> Void) {
        handlers.append(handler)
    }

    func notifyAll() {
        handlers.forEach { $0() }
    }
}

let notifier = Notifier()
notifier.subscribe { print("Notified!") }
notifier.notifyAll()
```

Asynchronous work is the other classic case:

```swift
func fetchGreeting(completion: @escaping (String) -> Void) {
    DispatchQueue.global().async {
        let greeting = "Hello from the background"
        completion(greeting)          // runs after fetchGreeting has returned
    }
}
```

## The compiler's other escaping checks

Two more errors come from the same rule:

```swift
func scheduleIncrement(_ value: inout Int) {
    DispatchQueue.main.async {
        value += 1                    // ❌ escaping closure captures 'inout' parameter 'value'
    }
}
```

An `inout` parameter only exists for the duration of the call (its value is written back when the function returns), so an escaping closure can't hold onto it. Copy the value, or pass back a result instead.

```swift
func runLater(_ work: () -> Void) {
    DispatchQueue.main.async {
        work()                        // ❌ escaping closure captures non-escaping parameter 'work'
    }
}
```

A non-escaping closure can't be smuggled out inside an escaping one. If `runLater` really needs to defer the work, its parameter must be `@escaping`.

## Why the distinction matters

### 1. Explicit `self`

Inside an escaping closure that refers to a property or method of a **class**, Swift requires you to write `self.` explicitly:

```swift
final class Downloader {
    var progress = 0.0

    func start() {
        // Non-escaping: implicit self is fine.
        [0.25, 0.5].forEach { value in
            progress = value
        }

        // Escaping: `self.` is required.
        DispatchQueue.main.async {
            self.progress = 1.0
        }
    }
}
```

That's a deliberate speed bump: an escaping closure that captures `self` strongly keeps the object alive until the closure is released, and might create a retain cycle. Writing `self.` makes you notice.

Since Swift 5.3 (SE-0269), there are two ways to drop the explicit `self.` again:

- Capture `self` explicitly in the capture list, as `[self]` (strong, intentional) or with `[weak self]` and an unwrap.
- If `self` is a **value type** (a struct or enum), implicit `self` is always allowed, because capturing a value can't create a reference cycle.

```swift
final class Uploader {
    var status = "idle"

    func start() {
        DispatchQueue.main.async { [self] in
            status = "uploading"     // allowed: capture made explicit with [self]
        }
    }
}

struct Ticker {
    var count = 0

    func report() {
        DispatchQueue.main.async {
            print(count)             // allowed: self is a struct
        }
    }
}
```

### 2. Memory and lifetime

A non-escaping closure can't outlive the call, so it can't create a lasting retain cycle. An escaping closure **can**, whenever an object stores a closure that strongly captures that same object:

```swift
final class Player {
    var onFinish: (() -> Void)?
    var title = "Song"

    func prepare() {
        onFinish = { [weak self] in              // weak: Player stores this closure
            guard let self = self else { return }
            print("Finished \(self.title)")
        }
    }

    deinit { print("Player freed") }
}

var player: Player? = Player()
player?.prepare()
player?.onFinish?()
player = nil   // "Player freed": no cycle thanks to [weak self]
```

Without `[weak self]`, `Player` would own the closure and the closure would own `Player`, so neither would ever be freed. Escaping closures that are **not** stored by `self`, like a one-shot `DispatchQueue.main.async` block, only keep `self` alive briefly, which is usually fine.

### 3. Performance

Because a non-escaping closure can't outlive the call, the compiler can allocate its captured context **on the stack** instead of the heap, avoid reference counting it, and often inline it entirely. An escaping closure needs a heap-allocated, reference-counted context, because it might live for a long time. Non-escaping is the cheaper default, which is one more reason APIs should only use `@escaping` when they truly need it.

## Optional closures are always escaping

A closure wrapped in an optional is stored inside an enum (`Optional`), so Swift treats it as escaping. You can't write `@escaping` on it, and you don't need to:

```swift
func run(completion: (() -> Void)? = nil) {
    completion?()
}
```

That has a side effect: an optional closure parameter is escaping even if you only call it synchronously, so it gets the explicit-`self` rule and the heap allocation. If a callback is required and synchronous, prefer a non-optional parameter with an empty default: `completion: () -> Void = {}`.

## `withoutActuallyEscaping`

Occasionally an API needs an escaping closure, but you know it will only run during your call, for example with a lazy collection that you consume immediately. `withoutActuallyEscaping(_:do:)` lets you pass a non-escaping closure there safely:

```swift
func allMatch(_ values: [Int], _ predicate: (Int) -> Bool) -> Bool {
    withoutActuallyEscaping(predicate) { escapablePredicate in
        values.lazy.filter { !escapablePredicate($0) }.isEmpty
    }
}

print(allMatch([2, 4, 6]) { $0 % 2 == 0 })   // true
```

If the closure really does escape (if it's still referenced when the block ends), the program traps at runtime. Only use it when you're certain.

## Completion handlers vs. async/await

Escaping completion handlers have been the standard way to write asynchronous APIs, but they're easy to get wrong: you can forget to call the completion on some error path, or call it twice. Swift 5.5 introduces `async`/`await`, which removes the escaping closure from the API surface entirely:

```swift
// Completion-handler style
func loadUsername(completion: @escaping (Result<String, Error>) -> Void) {
    DispatchQueue.global().async {
        completion(.success("sam"))
    }
}

// async/await style (Swift 5.5)
func loadUsername() async throws -> String {
    "sam"
}
```

You can wrap an existing completion-handler API with a **continuation**, which must be resumed exactly once:

```swift
func loadUsernameAsync() async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
        loadUsername { result in
            continuation.resume(with: result)
        }
    }
}
```

The `@escaping` rules still apply to closures you store yourself: event handlers, callbacks, and observers.

## Common pitfalls

- **Adding `@escaping` "to make the error go away"**, without thinking about whether the closure should really outlive the call, or about the retain cycle it may create.
- **Strong `self` in stored closures**, the most common cause of leaked view controllers.
- **Calling completion handlers zero or two times** on some code path. Use `defer`, a `guard` structure that always calls it once, or move to `async`/`await`.
- **Calling a completion handler on a background queue** when the caller expects the main queue. Document which queue callbacks are delivered on.

## Interview questions

**Are closure parameters escaping or non-escaping by default?**
Non-escaping, since Swift 3. Mark parameters `@escaping` when they're stored or called after the function returns.

**Why does Swift require explicit `self` in escaping closures?**
To make you aware that the closure captures `self` strongly and may extend its lifetime or create a retain cycle. Capturing with `[self]` or `[weak self]`, or `self` being a value type, lifts the requirement.

**Why are non-escaping closures faster?**
Their context can live on the stack, they don't need reference counting, and they can be inlined, because they can't outlive the call.

**Why are optional closure parameters escaping?**
They're stored inside an `Optional` enum value, and the compiler can't prove they don't escape.

## Summary

- Closure parameters are non-escaping by default: they run during the call and then they're gone.
- Mark parameters `@escaping` when closures are stored or run later; optional closures always escape.
- Escaping closures can't capture `inout` or non-escaping parameters, and need explicit `self` for classes (unless captured with `[self]`).
- Escaping closures that capture `self` strongly, and are stored by `self`, create retain cycles; use `[weak self]`.
- Non-escaping closures are cheaper; `async`/`await` (Swift 5.5) removes many escaping completion handlers.
