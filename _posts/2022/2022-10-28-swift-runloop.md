---
layout: post
title: "RunLoop Explained for Swift Developers"
date: "2022-10-28"
last_modified_at: "2022-10-28"
permalink: /swift-runloop/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Runtime"
  - "Concurrency"
---

Why does a `Timer` stop firing while you scroll? Why does a timer created on a background thread never fire at all? Both answers lead to the same place: the **run loop**, the event-processing loop at the heart of every Apple app. You rarely touch it directly, but understanding it explains a lot of everyday behavior.

<!--more-->

## What a run loop is

A run loop is a loop that a thread runs to wait for events and handle them. In pseudocode:

```swift
// while appIsRunning {
//     let event = waitForNextEvent()     // sleeps the thread until something happens
//     handle(event)                      // touches, timers, network callbacks, ...
// }
```

The key word is **sleeps**: a thread with an idle run loop uses no CPU. It wakes up when there's an event: a touch, a timer firing, a port receiving a message.

Each thread has at most one run loop, created lazily the first time you ask for it with `RunLoop.current`. The **main thread's run loop** is started automatically by `UIApplicationMain` (or `NSApplicationMain`), and it's what keeps your app alive and responsive.

## Input sources and timers

A run loop handles two kinds of things:

- **Input sources:** events from outside the thread, like touches, Mach ports, and custom sources.
- **Timers:** `Timer` (`NSTimer`) instances scheduled on the run loop.

If a run loop has no sources and no timers, running it returns immediately: there's nothing to wait for.

## Run loop modes

A run loop always runs in a **mode**, and it only handles sources and timers registered for that mode. That's how the system prioritizes work:

| Mode | When it's used |
|---|---|
| `.default` | normal operation |
| `.tracking` (UIKit) | while the user is dragging or scrolling |
| `.common` | a set of modes; registering in `.common` means "all common modes" |

This explains the classic scrolling bug. `Timer.scheduledTimer` adds the timer in `.default` mode. While a scroll view is being dragged, the main run loop switches to tracking mode, and the timer is paused until scrolling stops. The fix is to add it to `.common`:

```swift
import Foundation

let timer = Timer(timeInterval: 1.0, repeats: true) { _ in
    print("Tick")
}
RunLoop.main.add(timer, forMode: .common)   // keeps firing during scrolling
```

## Why background timers don't fire

```swift
DispatchQueue.global().async {
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        print("Never printed")
    }
}
```

The timer is scheduled on the background thread's run loop, but nobody **runs** that run loop. GCD worker threads don't run their run loops by default, and the thread may be reused or go away. Options:

- schedule the timer on the main run loop,
- use a `DispatchSourceTimer`, which doesn't need a run loop,
- in async code, loop with `try await Task.sleep(for:)`, or use `AsyncTimerSequence` from Swift Async Algorithms.

```swift
let source = DispatchSource.makeTimerSource(queue: .global())
source.schedule(deadline: .now(), repeating: 1.0)
source.setEventHandler {
    print("Tick from a dispatch timer")
}
source.resume()
```

## Running a run loop yourself

Occasionally, usually in command-line tools or tests, you need to spin a run loop manually so timers and callbacks are delivered:

```swift
var finished = false

DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
    finished = true
}

while !finished {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}
print("Done")
```

Each call to `run(mode:before:)` processes events until the date passes or a source fires. In apps, you almost never need this, because the system runs the main run loop for you.

## The main run loop and the UI

The main run loop also drives UI updates. When you change a view, UIKit doesn't redraw immediately. It marks the view as needing layout and display, and the actual work happens at the end of the current run loop iteration, in a single pass. That's why many changes in the same turn of the loop produce one redraw, and why long synchronous work on the main thread freezes the UI: the run loop can't get back to processing touches and drawing until your code returns.

## RunLoop and Swift concurrency

Swift concurrency doesn't use run loops for scheduling. Tasks run on a cooperative thread pool, and `@MainActor` work is scheduled onto the main queue, which the main run loop drains. You'll still meet run loops when using `Timer`, `Combine`'s `RunLoop` scheduler, older `NSURLConnection`-style APIs, and some Core Foundation APIs.

## Summary

- A run loop sleeps a thread until events arrive, then handles input sources and timers.
- The main run loop starts automatically; background threads' run loops don't run unless you run them.
- Modes decide which sources are handled; add timers to `.common` to keep them running while scrolling.
- Prefer `DispatchSourceTimer` or `Task.sleep` for background timing, and keep the main run loop free for UI work.
