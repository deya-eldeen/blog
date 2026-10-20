---
layout: post
title: "Deinitialization in Swift"
date: "2023-10-16"
last_modified_at: "2023-10-16"
permalink: /swift-deinitialization/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "ARC"
  - "Classes"
---

An initializer sets an object up; a deinitializer gets the last word before it disappears. In Swift, `deinit` runs automatically when a class instance is about to be freed, and it's the right place to release resources the object owns. It's also one of the best debugging tools for spotting memory leaks.

<!--more-->

## Declaring `deinit`

```swift
final class FileHandleWrapper {
    let path: String

    init(path: String) {
        self.path = path
        print("Opened \(path)")
    }

    deinit {
        print("Closed \(path)")
    }
}

do {
    let file = FileHandleWrapper(path: "/tmp/log.txt")
    print("Using \(file.path)")
}
// Prints: Opened, Using, Closed
```

A few rules:

- Only **classes** (and noncopyable types) have deinitializers. Structs and enums are values without a shared lifetime to end.
- `deinit` takes no parameters and no parentheses.
- You never call it yourself. Swift calls it when the last strong reference goes away.
- A class has at most one `deinit`.

## When does `deinit` run?

When the instance's strong reference count drops to zero, thanks to [Automatic Reference Counting](/swift-automatic-reference-counting/). That's deterministic: unlike garbage-collected languages, there's no collector deciding later. As soon as the last reference is released, `deinit` runs.

```swift
var player: FileHandleWrapper? = FileHandleWrapper(path: "song.mp3")
var alias = player

player = nil     // still alive: `alias` holds a reference
alias = nil      // the last reference is gone, and deinit runs now
```

One subtlety: Swift only promises that an object lives until its **last use**, not until the end of the scope. Don't write code that depends on `deinit` running at a precise line inside a function.

## Inheritance

Superclass deinitializers run automatically after the subclass's `deinit` finishes, even if the subclass doesn't define one. You never call `super.deinit`:

```swift
class Connection {
    deinit { print("Connection closed") }
}

final class SecureConnection: Connection {
    deinit { print("Secure session wiped") }
}

do {
    _ = SecureConnection()
}
// Secure session wiped
// Connection closed
```

All stored properties are still valid during `deinit`, so you can read them while cleaning up.

## What belongs in `deinit`

Good uses:

- **Releasing non-memory resources:** closing file handles or sockets, invalidating timers, cancelling tasks.
- **Unregistering** from things that don't clean up automatically, like some C callbacks or KVO observations created with the old API.
- **Logging** during development to confirm objects actually go away.

```swift
final class Poller {
    private var timer: Timer?
    private var task: Task<Void, Never>?

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in }
        task = Task { /* long-running work */ }
    }

    deinit {
        timer?.invalidate()
        task?.cancel()
    }
}
```

What to avoid:

- **Heavy or slow work.** `deinit` runs on whatever thread released the last reference, at a moment you don't control.
- **Escaping `self`.** Storing `self` somewhere during `deinit` (for example in a global array or a closure that outlives it) is a serious bug.
- **Relying on order** between different objects' deinitializers.

## `deinit` as a leak detector

If a screen closes but its `deinit` never prints, something is still holding a strong reference to it, often a closure capturing `self` or a delegate declared without `weak`.

```swift
final class ProfileScreen {
    var onSave: (() -> Void)?

    func configure() {
        onSave = { [weak self] in    // without [weak self], deinit would never run
            self?.save()
        }
    }

    func save() {}

    deinit {
        print("ProfileScreen deinit")
    }
}
```

A quick `print` in `deinit`, or a breakpoint there, is the fastest way to confirm a fix. Xcode's Memory Graph Debugger shows *what* is holding the object alive. See [Capture Lists in Swift Closures](/swift-capture-lists/) for the most common cause.

## Summary

- `deinit` runs automatically, exactly once, when a class instance's last strong reference goes away.
- Superclass deinitializers run after the subclass's, with no `super` call needed.
- Use it to release resources and cancel work, not for heavy logic.
- A `deinit` that never runs is the clearest sign of a retain cycle.
