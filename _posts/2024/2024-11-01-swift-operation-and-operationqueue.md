---
layout: post
title: "Operation and OperationQueue in Swift"
date: "2024-11-01"
last_modified_at: "2024-11-01"
permalink: /swift-operation-and-operationqueue/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Concurrency"
  - "Foundation"
---

Before `async`/`await`, there were two main ways to run work concurrently on Apple platforms: Grand Central Dispatch for lightweight blocks, and `Operation` with `OperationQueue` for work that needed **dependencies, cancellation, priorities, and limits on concurrency**. Operations are built on top of GCD, they're still common in large codebases, and some of their ideas are worth knowing even if you write new code with Swift concurrency.

<!--more-->

## The basics

An `OperationQueue` runs `Operation` objects, using as many threads as it decides are useful. The simplest operation is a block:

```swift
import Foundation

let queue = OperationQueue()
queue.name = "com.example.images"
queue.maxConcurrentOperationCount = 2     // at most two at a time

queue.addOperation {
    print("Resizing image 1")
}

let compress = BlockOperation {
    print("Compressing")
}
queue.addOperation(compress)
```

`maxConcurrentOperationCount = 1` turns the queue into a **serial** queue.

## Dependencies

Dependencies are where operations shine. An operation doesn't start until all of its dependencies have **finished**, even if they're on different queues:

```swift
let download = BlockOperation { print("1. Download") }
let decode = BlockOperation { print("2. Decode") }
let save = BlockOperation { print("3. Save") }

decode.addDependency(download)
save.addDependency(decode)

let workQueue = OperationQueue()
workQueue.addOperations([save, decode, download], waitUntilFinished: true)
// Always prints 1, 2, 3, whatever order they were added in.
```

Be careful not to create cycles: two operations depending on each other will never run.

## Cancellation

Calling `cancel()` on an operation, or `cancelAllOperations()` on a queue, marks operations as cancelled. Operations that haven't started yet won't run their main work. Running operations must check `isCancelled` themselves; cancellation is cooperative:

```swift
final class ThumbnailOperation: Operation, @unchecked Sendable {
    let imageIDs: [Int]
    private(set) var processed = 0

    init(imageIDs: [Int]) {
        self.imageIDs = imageIDs
    }

    override func main() {
        for _ in imageIDs {
            if isCancelled { return }      // stop promptly when cancelled
            processed += 1
        }
    }
}

let thumbnails = ThumbnailOperation(imageIDs: Array(1...100))
let thumbnailQueue = OperationQueue()
thumbnailQueue.addOperation(thumbnails)
thumbnails.cancel()
```

Subclassing `Operation` and overriding `main()` is the standard way to write reusable, testable units of work. `@unchecked Sendable` acknowledges that `Operation` subclasses manage their own thread safety, which Swift 6's checker can't verify.

## Priorities and quality of service

```swift
let urgent = BlockOperation { print("User is waiting for this") }
urgent.queuePriority = .high
urgent.qualityOfService = .userInitiated

let background = OperationQueue()
background.qualityOfService = .utility
```

`queuePriority` orders ready operations within a queue. `qualityOfService` tells the system how important the work is for CPU and energy scheduling.

## Waiting and completion

```swift
let report = BlockOperation { print("Building report") }
report.completionBlock = {
    print("Report finished")        // runs on a background thread
}

let reportQueue = OperationQueue()
reportQueue.addOperations([report], waitUntilFinished: true)
```

`completionBlock` runs on an arbitrary thread, so hop to the main queue before touching UI. And never call `waitUntilFinished: true` on the main thread: it blocks the UI.

## Observing the queue

`Operation` properties like `isExecuting`, `isFinished`, and `isCancelled` are KVO-compliant, and so is `OperationQueue.operationCount`. That's how progress UIs and asynchronous operations traditionally worked; see [Key-Value Observing in Swift](/swift-key-value-observing/).

Asynchronous operations, which wrap callback-based work like a network request, must manage those KVO notifications themselves by overriding `isAsynchronous`, `isExecuting`, and `isFinished`. It's notoriously easy to get wrong, and it's one of the main reasons people moved to Swift concurrency.

## Operations vs. GCD vs. Swift concurrency

| Need | Good fit |
|---|---|
| Fire off a quick block in the background | GCD or a `Task` |
| Complex dependency graphs between units of work | `OperationQueue` |
| Limiting concurrency, e.g. at most 3 downloads | `OperationQueue`, or a task group with a counter |
| Structured cancellation and readable async code | Swift concurrency |
| Protecting shared mutable state | actors |

In new code, Swift concurrency covers most of what operations offered, with less ceremony: task groups for parallel work, cooperative cancellation built in, and `async let` for simple dependencies. Operations remain a solid choice when you have a real dependency graph, or when you're working in an existing codebase built around them. See [Swift Concurrency](/swift-concurrency/) for the modern approach.

## Summary

- `OperationQueue` runs `Operation`s concurrently, with optional limits on how many run at once.
- Dependencies order work across queues; cancellation is cooperative through `isCancelled`.
- Subclass `Operation` and override `main()` for reusable units of work.
- Operations are built on GCD; for new code, Swift concurrency is usually simpler.
