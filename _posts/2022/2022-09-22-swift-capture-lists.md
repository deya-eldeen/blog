---
layout: post
title: "Capture Lists in Swift Closures"
date: "2022-09-22"
last_modified_at: "2022-09-22"
permalink: /swift-capture-lists/
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
  - "ARC"
  - "Memory Management"
---

A capture list is the small bracketed section at the start of a closure, like `[weak self]` or `[count]`. It controls *how* a closure captures the values it uses: by reference or by value, strongly or weakly. It's a tiny piece of syntax with a big influence on correctness and memory.

<!--more-->

## Default capturing: by reference

Without a capture list, a closure captures **variables**, not their current values. It sees later changes:

```swift
var counter = 0
let printCounter = {
    print(counter)
}

counter = 5
printCounter()   // 5, not 0
```

## Capturing a value with `[x]`

Put a variable in the capture list, and the closure copies its value **at the moment the closure is created**:

```swift
var level = 0
let printLevel = { [level] in
    print(level)
}

level = 5
printLevel()     // 0, the value when the closure was created
```

The captured copy is a constant inside the closure. This is handy when you want a snapshot, for example the state of a request at the moment you scheduled a retry.

You can also capture an expression under a new name:

```swift
let names = ["Ana", "Ben"]
let describe = { [count = names.count] in
    print("There were \(count) names")
}
describe()
```

## Reference types and strong captures

For class instances, the "value" in a capture is a **reference**. Capturing it strongly keeps the object alive for as long as the closure lives, which is usually what you want for short-lived closures. The danger is a **retain cycle**: an object owns a closure, and the closure owns the object.

```swift
final class Timer2 {
    var tick: (() -> Void)?
    var seconds = 0

    func start() {
        tick = {
            self.seconds += 1     // the closure retains self, and self retains the closure
        }
    }

    deinit {
        print("Timer2 freed")
    }
}
```

Neither the `Timer2` nor its closure can ever be freed, even when nothing else uses them. That's a memory leak.

## `[weak self]`

A weak capture doesn't keep the object alive. Inside the closure, `self` becomes an optional that turns `nil` once the object is gone:

```swift
final class Ticker {
    var tick: (() -> Void)?
    var seconds = 0

    func start() {
        tick = { [weak self] in
            guard let self else { return }   // the object may already be gone
            self.seconds += 1
        }
    }
}
```

After `guard let self`, `self` is a strong reference again for the rest of that run of the closure, so the object can't disappear halfway through. This is the standard pattern for stored callbacks, timers, and notification handlers.

## `[unowned self]`

An unowned capture also doesn't keep the object alive, but it isn't optional. It's a promise that the object will outlive the closure. If the promise is broken, accessing it crashes:

```swift
final class Form {
    var onSubmit: (() -> Void)?
    var title = "Sign up"

    init() {
        onSubmit = { [unowned self] in
            print("Submitting \(self.title)")
        }
    }
}
```

Here the closure is owned by the `Form` itself and only ever called through it, so the promise holds. When in doubt, use `weak`: the cost is an unwrap, while a wrong `unowned` is a crash.

## Capturing several things

A capture list can hold several entries, each with its own rule:

```swift
final class Uploader {
    let endpoint = "https://example.com/upload"
    var onFinish: ((Bool) -> Void)?

    func upload(fileName: String) {
        onFinish = { [weak self, fileName, endpoint] success in
            print("\(fileName) to \(endpoint): \(success)")
            self?.onFinish = nil
        }
    }
}
```

Capturing `endpoint` directly means the closure doesn't need `self` just to read it.

## Capture what you need, not `self`

Often the cleanest fix for a cycle is not to capture `self` at all. Capture the specific values or objects the closure uses:

```swift
final class Logger {
    func log(_ message: String) { print(message) }
}

final class Screen {
    let logger = Logger()
    var onEvent: ((String) -> Void)?

    func bind() {
        onEvent = { [logger] event in
            logger.log(event)           // no reference to self at all
        }
    }
}
```

## When you don't need a capture list

- **Non-escaping closures** like `map`, `filter`, and `forEach` run during the call and can't create lasting cycles.
- **Value types** like structs and enums can't form reference cycles through `self`.
- **Short-lived escaping closures**, such as a one-shot `DispatchQueue.main.async` block, retain `self` only briefly. That's fine as long as the closure isn't stored by `self`.

## Summary

- Without a capture list, closures capture variables by reference and see later changes.
- `[x]` captures a snapshot of a value at creation time.
- `[weak self]` avoids retain cycles safely; `[unowned self]` avoids them only when lifetimes are guaranteed.
- Capturing specific values instead of `self` is often the cleanest option.
