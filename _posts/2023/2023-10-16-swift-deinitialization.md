---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_deinitialization_thumbnail.webp"
thumbnail_ready: true
---

An initializer sets an object up; a deinitializer gets the last word before it disappears. In Swift, `deinit` runs automatically when an instance is about to be destroyed, and it's the right place to release resources the instance owns: file handles, sockets, timers, observations. It's also one of the best debugging tools there is for spotting memory leaks. And since Swift 5.9, it's no longer just for classes.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_deinitialization_thumbnail.webp"
 alt_text="An object releasing its resources after its final reference is removed"
 caption="Deinitialization in Swift"
 width="640"
 height="400"
%}

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
// Opened /tmp/log.txt
// Using /tmp/log.txt
// Closed /tmp/log.txt
```

A few rules:

- `deinit` takes no parameters and no parentheses, and a type has at most one.
- You never call it yourself. Swift calls it exactly once, at the right moment.
- It can't throw and can't be `async`.
- Only **classes** and, since Swift 5.9, **noncopyable types** (see below) can have one. Ordinary structs and enums are values without a single lifetime to end.

## When does `deinit` run?

For a class, when the instance's **strong reference count drops to zero**, thanks to Automatic Reference Counting. That's deterministic: unlike garbage-collected languages, there's no collector deciding to clean up later. As soon as the last strong reference is released, `deinit` runs, on that same thread.

```swift
var player: FileHandleWrapper? = FileHandleWrapper(path: "song.mp3")
var alias = player

player = nil     // still alive: `alias` holds a reference
alias = nil      // the last reference is gone: "Closed song.mp3" prints now
```

One subtlety: Swift only promises that an object lives until the **last use** of its last reference, not until the end of the enclosing scope. Don't write code that depends on `deinit` running at a precise line in the middle of a function. If something must stay alive until a certain point, `withExtendedLifetime` makes it explicit.

## Inheritance: subclass first, then superclass

Superclass deinitializers are called automatically after the subclass's `deinit` finishes, even if the subclass doesn't define one. You never write `super.deinit`:

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

All stored properties are still valid during `deinit`, so you can read them while cleaning up. They're released **after** the whole chain of deinitializers has run:

```swift
final class Child {
    let name: String
    init(name: String) { self.name = name }
    deinit { print("Child \(name) freed") }
}

final class Parent {
    let child = Child(name: "Ada")
    deinit { print("Parent deinit, child is still \(child.name)") }
}

do {
    _ = Parent()
}
// Parent deinit, child is still Ada
// Child Ada freed
```

## What belongs in `deinit`

Good uses:

- **Releasing non-memory resources:** closing file descriptors and sockets, invalidating timers, cancelling tasks, ending audio sessions.
- **Unregistering** from things that don't clean up automatically, like C callbacks or manually managed observers.
- **Logging** during development, to confirm objects actually go away.

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
- **Escaping `self`.** Storing `self` somewhere during `deinit` (in a global array, or a closure that outlives it) is a serious bug: the object is being destroyed regardless.
- **Async work and actor-isolated state.** `deinit` is synchronous and isn't isolated to an actor. A `@MainActor` class's `deinit` may run off the main thread, so it shouldn't touch UI. Do that cleanup earlier, for example when the screen disappears.
- **Relying on ordering** between different objects' deinitializers.

## The cleanup that never runs: cycles

`deinit` only runs when the strong count reaches zero. If an object is part of a retain cycle, it never does, and neither does the cleanup inside it. A common trap:

```swift
final class Ticker {
    private var timer: Timer?

    func start() {
        // The timer retains its block, the block retains self, and self retains the timer.
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            self.tick()
        }
    }

    private func tick() {}

    deinit {
        timer?.invalidate()   // never reached: the timer keeps self alive
    }
}
```

Invalidating the timer in `deinit` can't break the cycle, because `deinit` can't run while the timer holds `self`. Capture `[weak self]` in the block, and invalidate the timer explicitly when the work should stop.

## `deinit` as a leak detector

If a screen closes but its `deinit` never prints, something still holds a strong reference to it, most often a closure capturing `self`, a delegate declared without `weak`, a timer, or a notification observer.

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

A `print` or breakpoint in `deinit` is the fastest way to confirm a fix. Xcode's Memory Graph Debugger then shows *what* is holding an object alive.

## Noncopyable types have `deinit` too (Swift 5.9)

Swift 5.9 introduced **noncopyable** structs and enums, declared with `~Copyable`. A noncopyable value has exactly one owner at a time, so it has a well-defined end of life, and it can have a `deinit`. That makes it possible to manage a resource like a file descriptor without the overhead of a class:

```swift
struct FileDescriptor: ~Copyable {
    let number: Int32

    init(number: Int32) {
        self.number = number
        print("open \(number)")
    }

    consuming func close() {
        print("explicit close \(number)")
        discard self              // ends the value's life without running deinit
    }

    deinit {
        print("deinit closes \(number)")
    }
}

func useAndForget() {
    let descriptor = FileDescriptor(number: 3)
    print("using \(descriptor.number)")
}   // deinit closes 3

func useAndClose() {
    let descriptor = FileDescriptor(number: 4)
    descriptor.close()            // explicit close 4; no deinit afterwards
}

func handOff() {
    let original = FileDescriptor(number: 5)
    let moved = consume original  // ownership moves; `original` can't be used anymore
    print("now owned by moved: \(moved.number)")
}   // deinit closes 5: exactly once

useAndForget()
useAndClose()
handOff()
```

Because the value can't be copied, there's no reference counting and no risk of two copies both closing the same descriptor. `consuming` methods take ownership of the value, and `discard self` lets such a method finish the value's life without triggering `deinit`, which is useful when it already released the resource itself.

## Interview questions

**When does a class's `deinit` run?**
Immediately when its last strong reference is released, on the thread that released it.

**In what order do deinitializers run in a class hierarchy?**
The subclass's `deinit` first, then the superclass's, automatically; stored properties are released after the whole chain finishes.

**Why might `timer.invalidate()` in `deinit` never execute?**
If the timer (through its block or target) strongly references the object, the object is never freed, so its `deinit` never runs.

**Can structs have a `deinit`?**
Since Swift 5.9, noncopyable (`~Copyable`) structs and enums can, because they have a single owner and a defined end of life.

## Summary

- `deinit` runs automatically, exactly once, when an instance's life ends: for classes, when the last strong reference goes away.
- Subclass deinitializers run before superclass ones; properties are released afterwards.
- Use it to release resources and cancel work, not for heavy, async, or UI work.
- A `deinit` that never runs is the clearest sign of a retain cycle, and cleanup inside it can't break that cycle.
- Since Swift 5.9, noncopyable types can have a `deinit`, with `consume` and `discard self` for precise ownership.
