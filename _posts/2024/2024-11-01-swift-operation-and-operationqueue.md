---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_operation_and_operationqueue_thumbnail.webp"
thumbnail_ready: true
---

Before `async`/`await`, Apple platforms offered two main ways to run work concurrently: Grand Central Dispatch for lightweight blocks, and `Operation` with `OperationQueue` for work that needed **dependencies, cancellation, priorities, and limits on concurrency**. Operations are built on top of GCD and still power many large codebases, and some of their ideas, like a dependency graph between units of work, have no direct one-line equivalent in Swift concurrency. This article covers how operations really behave, including the parts the documentation glosses over: cancelled dependencies, asynchronous operations and their KVO contract, passing data between operations, and bridging to `async`/`await`.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_operation_and_operationqueue_thumbnail.webp"
 alt_text="Queued operations waiting for their prerequisite operations to finish"
 caption="Operation and OperationQueue in Swift"
 width="640"
 height="400"
%}

## The model in one paragraph

An `Operation` is an object that represents **one unit of work** and goes through a state machine: *pending → ready → executing → finished*, with *cancelled* as a flag that can be set at any time. An `OperationQueue` holds operations and starts each one when it becomes **ready** (all its dependencies have finished), running it on a thread from a GCD-managed pool. Because operations are objects, you can keep references to them, cancel them, inspect their state, observe them with KVO, and wire them together, which is what separates them from fire-and-forget GCD blocks.

The examples below record events through a small thread-safe helper, so their output is deterministic:

```swift
import Foundation

final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String] = []

    func record(_ event: String) {
        lock.lock(); defer { lock.unlock() }
        storage.append(event)
    }

    var events: [String] {
        lock.lock(); defer { lock.unlock() }
        return storage
    }
}
```

## The basics

The simplest operation is a block. `addOperation(_:)` with a closure wraps it in a `BlockOperation` for you:

```swift
let basicLog = EventLog()
let queue = OperationQueue()
queue.name = "com.example.images"     // shows up in the debugger and in crash logs
queue.maxConcurrentOperationCount = 2  // at most two operations at a time

queue.addOperation {
    basicLog.record("resize")
}

let compress = BlockOperation {
    basicLog.record("compress")
}
queue.addOperation(compress)
queue.waitUntilAllOperationsAreFinished()
print(basicLog.events.sorted())   // ["compress", "resize"]
```

The order of those two isn't guaranteed: with a concurrency limit of 2, they run at the same time. Setting `maxConcurrentOperationCount = 1` makes the queue **serial**, but note that a serial `OperationQueue` still respects dependencies and priorities, so it's not strictly first-in, first-out like a serial `DispatchQueue`.

A `BlockOperation` can hold several blocks with `addExecutionBlock(_:)`. They run **concurrently** with each other, and the operation finishes only when all of them have finished.

## Concurrency limits actually hold

`maxConcurrentOperationCount` is the feature people miss most when they move to other APIs. Here, six operations each take 20 ms, and we measure the highest number running at once:

```swift
final class Gauge: @unchecked Sendable {
    private let lock = NSLock()
    private var current = 0
    private(set) var peak = 0

    func enter() {
        lock.lock(); defer { lock.unlock() }
        current += 1
        peak = max(peak, current)
    }

    func leave() {
        lock.lock(); defer { lock.unlock() }
        current -= 1
    }
}

let gauge = Gauge()
let limitedQueue = OperationQueue()
limitedQueue.maxConcurrentOperationCount = 2

for _ in 1...6 {
    limitedQueue.addOperation {
        gauge.enter()
        Thread.sleep(forTimeInterval: 0.02)
        gauge.leave()
    }
}
limitedQueue.waitUntilAllOperationsAreFinished()
print(gauge.peak)   // 2
```

That's exactly what you want for "at most 3 downloads at a time" or "don't decode more than 2 large images at once to limit memory".

## Dependencies

An operation doesn't start until all of its dependencies have **finished**, even if they're on different queues:

```swift
let pipelineLog = EventLog()
let download = BlockOperation { pipelineLog.record("download") }
let decode = BlockOperation { pipelineLog.record("decode") }
let save = BlockOperation { pipelineLog.record("save") }

decode.addDependency(download)
save.addDependency(decode)

let workQueue = OperationQueue()
workQueue.addOperations([save, decode, download], waitUntilFinished: true)
print(pipelineLog.events)   // ["download", "decode", "save"]
```

The operations were added in reverse order, and the queue could run three at once, but the dependencies forced the order.

Dependencies aren't limited to chains. An operation can depend on several others, which makes **fan-in** easy: start ten downloads in parallel, and run a "build the gallery" operation that depends on all ten.

Two things to watch:

- **Cycles deadlock silently.** If A depends on B and B depends on A, neither ever becomes ready, and nothing reports an error.
- **Add dependencies before adding operations to a queue.** Adding them afterwards works only while the operation hasn't started yet, which is a race.

### Cancelled dependencies don't stop dependents

This surprises almost everyone. "Finished" includes "finished because it was cancelled", so **a dependent operation still runs when its dependency was cancelled**:

```swift
let cancelLog = EventLog()
let fetch = BlockOperation { cancelLog.record("fetch") }
let render = BlockOperation { cancelLog.record("render") }
render.addDependency(fetch)

fetch.cancel()

let cancelQueue = OperationQueue()
cancelQueue.addOperations([fetch, render], waitUntilFinished: true)
print(cancelLog.events)   // ["render"]
```

`fetch` never ran its block, yet `render` ran anyway, probably with missing data. The dependent operation must check its dependencies itself, for example `if dependencies.contains(where: \.isCancelled) { return }` at the top of `main()`, or you cancel the whole chain together with `cancelAllOperations()`.

## Cancellation is cooperative

Calling `cancel()` only **sets a flag**. An operation that hasn't started yet will still be started by the queue, but the default `start()` sees the flag and finishes immediately, without calling `main()`. An operation that's already running must check `isCancelled` itself:

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
            Thread.sleep(forTimeInterval: 0.001)
            processed += 1
        }
    }
}

let thumbnails = ThumbnailOperation(imageIDs: Array(1...1_000))
let thumbnailQueue = OperationQueue()
thumbnailQueue.addOperation(thumbnails)
Thread.sleep(forTimeInterval: 0.05)
thumbnails.cancel()
thumbnailQueue.waitUntilAllOperationsAreFinished()
print(thumbnails.processed < 1_000, thumbnails.isCancelled, thumbnails.isFinished)   // true true true
```

Subclassing `Operation` and overriding `main()` is the standard way to write reusable, testable units of work. `@unchecked Sendable` acknowledges that `Operation` subclasses manage their own thread safety, which Swift 6's checker can't verify. That's a real promise: here, `processed` is only written by the operation itself and read after it has finished, so it's safe.

Checking `isCancelled` once per loop iteration, or between stages, is usually enough. Checking only at the start of `main()` isn't: an operation cancelled mid-way would run to completion.

## Passing data between operations

Operations have no built-in return value. The idiomatic way to pass results is through the dependency: the consumer looks up its producer, which is guaranteed to have finished:

```swift
final class FetchNumbers: Operation, @unchecked Sendable {
    private(set) var output: [Int] = []

    override func main() {
        guard !isCancelled else { return }
        output = [3, 1, 2]
    }
}

final class SumNumbers: Operation, @unchecked Sendable {
    private(set) var total: Int?

    override func main() {
        guard let input = dependencies.compactMap({ $0 as? FetchNumbers }).first,
              !input.isCancelled else { return }
        total = input.output.reduce(0, +)
    }
}

let fetchNumbers = FetchNumbers()
let sumNumbers = SumNumbers()
sumNumbers.addDependency(fetchNumbers)

OperationQueue().addOperations([fetchNumbers, sumNumbers], waitUntilFinished: true)
print(sumNumbers.total ?? -1)   // 6
```

Because the dependency has finished before `main()` runs, reading `output` doesn't race. This also handles the cancelled-dependency problem from earlier: `SumNumbers` refuses to run on missing data. An alternative is an "adapter" `BlockOperation` between the two that copies the output across, which keeps each operation unaware of the other's type.

## Asynchronous operations

By default, an operation is finished as soon as `main()` returns. That's wrong for work that completes later, like a network request with a completion handler: the queue would consider it done immediately, start its dependents too early, and stop counting it toward the concurrency limit.

An **asynchronous operation** overrides `start()` and manages its own state, and must send **KVO notifications** for `isExecuting` and `isFinished`, because that's how the queue learns about state changes. Here's a reusable base class:

```swift
class AsyncOperation: Operation, @unchecked Sendable {
    private enum State {
        case ready, executing, finished
    }

    private let stateLock = NSLock()
    private var _state = State.ready

    private var state: State {
        get {
            stateLock.lock(); defer { stateLock.unlock() }
            return _state
        }
        set {
            willChangeValue(forKey: "isExecuting")
            willChangeValue(forKey: "isFinished")
            stateLock.lock()
            _state = newValue
            stateLock.unlock()
            didChangeValue(forKey: "isFinished")
            didChangeValue(forKey: "isExecuting")
        }
    }

    override var isAsynchronous: Bool { true }
    override var isExecuting: Bool { state == .executing }
    override var isFinished: Bool { state == .finished }

    override func start() {
        if isCancelled {
            state = .finished
            return
        }
        state = .executing
        execute()
    }

    /// Subclasses do their work here and must call `finish()` exactly once.
    func execute() {
        fatalError("Subclasses must override execute()")
    }

    final func finish() {
        state = .finished
    }
}

final class DelayedGreeting: AsyncOperation, @unchecked Sendable {
    private(set) var message: String?

    override func execute() {
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) {
            self.message = "Hello after a delay"
            self.finish()
        }
    }
}

let greetingLog = EventLog()
let greeting = DelayedGreeting()
let afterGreeting = BlockOperation { greetingLog.record("dependent ran") }
afterGreeting.addDependency(greeting)

OperationQueue().addOperations([greeting, afterGreeting], waitUntilFinished: true)
print(greeting.message ?? "nil", greetingLog.events)   // Hello after a delay ["dependent ran"]
```

The details that make this correct:

- **KVO notifications are sent outside the lock.** Observers (the queue) read `isFinished` from inside the notification; holding the lock there would deadlock.
- **`start()` checks for cancellation first**, and moves to finished without doing any work, because the queue still calls `start()` on cancelled operations.
- **`finish()` must be called exactly once**, on every path, including errors and cancellation. Forget it, and the operation never finishes: its dependents never run, and `waitUntilFinished` hangs forever.
- **Don't call `super.start()`** in an asynchronous operation; the default implementation would call `main()` and mark the operation finished when it returns.

This boilerplate, and how easy it is to get subtly wrong, is one of the main reasons people moved to Swift concurrency.

## Completion blocks, barriers, and waiting

```swift
let reportLog = EventLog()
let report = BlockOperation { reportLog.record("build report") }
report.completionBlock = {
    reportLog.record("report finished")   // runs on a background thread
}

let reportQueue = OperationQueue()
reportQueue.addOperation(report)
reportQueue.addBarrierBlock {
    reportLog.record("barrier: everything before me is done")
}
reportQueue.waitUntilAllOperationsAreFinished()
print(reportLog.events.first ?? "", reportLog.events.count)   // build report 3
```

- **`completionBlock`** runs on an arbitrary thread once the operation finishes, even when it finished because it was cancelled. Hop to the main queue before touching UI, check `isCancelled` if it matters, and watch for retain cycles: a completion block stored on an operation that captures the operation strongly keeps it alive. The completion block runs concurrently with whatever the queue does next, so it isn't ordered relative to dependents either.
- **`addBarrierBlock(_:)`** (iOS 13 / macOS 10.15) runs a block after every operation added before it has finished, and holds back operations added after it, like a dispatch barrier.
- **`waitUntilAllOperationsAreFinished()`** and **`waitUntilFinished: true`** block the calling thread. Never call them on the main thread, and never inside Swift concurrency code, where blocking a cooperative pool thread can stall everything.

## Priorities and quality of service

```swift
let urgent = BlockOperation { print("User is waiting for this") }
urgent.queuePriority = .high
urgent.qualityOfService = .userInitiated

let background = OperationQueue()
background.qualityOfService = .utility
```

- **`queuePriority`** orders **ready** operations within one queue. It never overrides dependencies: a high-priority operation whose dependency hasn't finished still waits.
- **`qualityOfService`** tells the system how important the work is for CPU and energy scheduling. An operation's QoS overrides its queue's default, and the system raises a dependency's QoS when a more urgent operation is waiting on it, which avoids priority inversion.

## Suspending, observing, and progress

- **`isSuspended = true`** stops a queue from starting new operations (running ones continue). It's useful for pausing downloads when the app loses connectivity.
- **`isExecuting`, `isFinished`, `isCancelled`, `isReady`**, and the queue's **`operationCount`** are KVO-compliant, which is how progress UIs were traditionally built; see [Key-Value Observing in Swift](/swift-key-value-observing/).
- **`OperationQueue.progress`** (iOS 13): set `progress.totalUnitCount` before adding operations, and each finished operation counts as one unit, which you can attach to a `UIProgressView` via its `observedProgress`.

## Bridging to `async`/`await`

Operations can't be awaited directly, but a continuation turns "everything on this queue is done" into an `await`. A barrier block makes a convenient signal:

```swift
extension OperationQueue {
    func waitForAll() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            addBarrierBlock {
                continuation.resume()
            }
        }
    }
}

let bridgeLog = EventLog()
let bridgeQueue = OperationQueue()
bridgeQueue.addOperation { bridgeLog.record("legacy work") }
await bridgeQueue.waitForAll()
print(bridgeLog.events)   // ["legacy work"]
```

Unlike `waitUntilAllOperationsAreFinished()`, this suspends instead of blocking, so it's safe to call from async code. In fact, the SDK enforces this: calling `waitUntilAllOperationsAreFinished()`, `addOperations(_:waitUntilFinished:)` or `Thread.sleep` from an async context is a compile error ("unavailable from asynchronous contexts; Use addBarrierBlock or a dependent Operations instead"). It's a handy seam when migrating an operation-based codebase to Swift concurrency one layer at a time.

## Operations vs. GCD vs. Swift concurrency

| Need | Good fit |
|---|---|
| Fire off a quick block in the background | GCD or a `Task` |
| A real dependency graph, with fan-out and fan-in | `OperationQueue` |
| Limiting concurrency, e.g. at most 3 downloads | `OperationQueue`, or a task group that adds a new child as each one finishes |
| Cancelling a whole tree of work, with errors propagating | Swift concurrency (structured tasks) |
| Readable sequential async code | `async`/`await` |
| Protecting shared mutable state | actors |

In new code, Swift concurrency covers most of what operations offered, with less ceremony and with compiler-checked data-race safety: task groups for parallel work, cancellation that propagates to children automatically, `async let` for simple dependencies. Operations remain a solid choice for explicit dependency graphs and in existing codebases built around them. See [Swift Concurrency](/swift-concurrency/) for the modern approach.

## Common pitfalls

- **Assuming a cancelled dependency stops its dependents.** It doesn't; check `dependencies` for cancellation.
- **Checking `isCancelled` only once**, so long-running operations ignore cancellation.
- **Asynchronous operations that never call `finish()`**, or that change state without KVO notifications. The queue hangs, silently.
- **Dependency cycles**, which deadlock without any error.
- **Blocking waits on the main thread** or in async code.
- **Retain cycles in `completionBlock`** that capture the operation itself.
- **Mutable state shared between operations without synchronization.** Operations run on many threads; `@unchecked Sendable` is a promise, not a protection.

## Interview questions

**What happens to an operation's dependents when the operation is cancelled?**
They still run: a cancelled operation counts as finished. Dependents must check whether their dependencies were cancelled.

**What's the difference between overriding `main()` and overriding `start()`?**
Overriding `main()` gives a synchronous operation: it's finished when `main()` returns. Overriding `start()` gives an asynchronous operation, which must manage `isExecuting` and `isFinished` itself, with KVO notifications, and finish exactly once.

**How do you limit the number of concurrent tasks with `OperationQueue`?**
Set `maxConcurrentOperationCount`. A value of 1 makes the queue serial, while still respecting dependencies and priorities.

**What's the difference between `queuePriority` and `qualityOfService`?**
`queuePriority` orders ready operations within a queue; `qualityOfService` influences system-wide CPU and energy scheduling.

**When would you still choose operations over Swift concurrency?**
For explicit, reusable dependency graphs, for strict concurrency limits with little code, and in codebases already built around operations.

## Summary

- `OperationQueue` runs `Operation` objects concurrently; `maxConcurrentOperationCount` limits how many run at once, and really does.
- Dependencies order work across queues and allow fan-in, but cancelled dependencies still count as finished.
- Cancellation is cooperative: check `isCancelled` regularly in `main()`.
- Pass data through dependencies; write asynchronous operations by overriding `start()` and sending KVO notifications for state changes.
- Barriers, completion blocks, priorities, QoS, and progress round out the API; bridge to `async`/`await` with a continuation, and prefer Swift concurrency for new code.
