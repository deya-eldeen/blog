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

Some closures run and are gone before the function that received them returns. Others are saved for later: stored in a property, handed to a background queue, kept as a completion handler. Swift tracks the difference with one attribute, `@escaping`, and it affects safety, performance, and how you deal with `self`.

<!--more-->

## Non-escaping by default

A closure parameter is **non-escaping** unless you say otherwise. The compiler guarantees it's only used during the function call:

```swift
func measure(_ work: () -> Void) {
    let start = Date()
    work()                                 // called before measure returns
    print("Took \(Date().timeIntervalSince(start))s")
}

measure {
    _ = (1...1_000).reduce(0, +)
}
```

`map`, `filter`, `sorted(by:)`, and `forEach` all take non-escaping closures.

## When a closure escapes

A closure **escapes** when it can be called after the function returns. Typical cases:

- it's stored in a property,
- it's called asynchronously, for example from `DispatchQueue.async`,
- it's appended to an array of handlers.

Try to store a non-escaping closure and the compiler stops you:

```swift
final class EventBus {
    private var handlers: [() -> Void] = []

    func subscribe(_ handler: () -> Void) {
        handlers.append(handler)    // ❌ converting non-escaping parameter 'handler' ... may allow it to escape
    }
}
```

Mark the parameter `@escaping` to make the intent explicit:

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
```

Asynchronous work is the other classic case:

```swift
func fetchGreeting(completion: @escaping (String) -> Void) {
    DispatchQueue.global().async {
        let greeting = "Hello from the background"
        completion(greeting)          // called after fetchGreeting returned
    }
}
```

## Why the distinction matters

### 1. Explicit `self`

Inside an escaping closure that captures `self` (of a class), Swift requires you to write `self.` explicitly. It's a deliberate speed bump: an escaping closure that captures `self` strongly may create a retain cycle, and the explicit `self.` makes you notice.

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

Alternatively, list `self` in a capture list, `[self]` for a strong capture or `[weak self]` for a weak one, and then implicit `self` is allowed again. Prefer `[weak self]` for closures that `self` stores, so they don't keep it alive.

### 2. Memory and lifetime

A non-escaping closure can't outlive the call, so it can't create a lasting retain cycle. An escaping closure can, if `self` owns the closure and the closure captures `self` strongly. This is the source of most closure-related memory leaks.

### 3. Performance

Because a non-escaping closure can't outlive its call, the compiler can often keep its context on the stack instead of allocating it on the heap, and can inline it more aggressively. Non-escaping is the cheaper default.

## Optional closures are always escaping

A closure inside an optional is stored in an enum, so Swift treats it as escaping. You can't write `@escaping` on it; it's implied:

```swift
func run(completion: (() -> Void)? = nil) {
    completion?()
}
```

## Using a non-escaping closure as if it escaped

Occasionally an API needs an escaping closure, but you know it only runs during your call, like a lazy collection consumed immediately. `withoutActuallyEscaping` handles that safely:

```swift
func allMatch(_ values: [Int], _ predicate: (Int) -> Bool) -> Bool {
    withoutActuallyEscaping(predicate) { escapable in
        values.lazy.filter { !escapable($0) }.isEmpty
    }
}
```

If the closure really does escape, the runtime traps, so only use this when you're sure.

## Async/await reduces the need

With Swift concurrency, many completion handlers become `async` functions, and the escaping closure disappears from your API:

```swift
func fetchMessage() async -> String {
    "Hello"
}
```

The rules still apply to closures you store yourself, like event handlers and callbacks.

## Summary

- Closure parameters are non-escaping by default: they run during the call and then they're gone.
- Mark parameters `@escaping` when they're stored or called later; optional closures always escape.
- Escaping closures require explicit `self` (or a capture list) because they can create retain cycles.
- Non-escaping closures are safer and faster; prefer them when you can.
