---
layout: post
title: "Swift Concurrency: async/await, Tasks, and Actors"
date: "2024-10-23"
last_modified_at: "2024-10-23"
permalink: /swift-concurrency/
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
  - "async/await"
---

For years, asynchronous Swift meant completion handlers, nested closures, and manual hops between dispatch queues, with data races found only by luck or by Thread Sanitizer. Swift concurrency replaces that with features built into the language: `async`/`await` for code that reads top to bottom, **tasks** for running work concurrently with structured cancellation, **actors** for protecting shared state, and, since Swift 6, a compiler that proves your code is free of data races. This article is a tour of the whole model, including the parts that trip people up.

<!--more-->

## `async` and `await`

A function marked `async` can **suspend** while it waits for something, without blocking a thread. Callers mark each potential suspension point with `await`:

```swift
struct Profile: Sendable {
    let name: String
}

func fetchProfile(id: Int) async throws -> Profile {
    try await Task.sleep(for: .milliseconds(50))     // stand-in for a network call
    return Profile(name: "User \(id)")
}

func showProfile() async {
    do {
        let profile = try await fetchProfile(id: 42)
        print(profile.name)
    } catch {
        print("Failed: \(error)")
    }
}
```

Compare that with the completion-handler version: no nesting, normal `do`/`catch` error handling, no way to forget to call a completion handler on some path, and no way to call it twice.

**Suspending is not blocking.** While `fetchProfile` waits, the thread it was running on is free to run other work. When the result is ready, the function **resumes**, possibly on a different thread. Two consequences:

- Code between two `await`s runs without interruption, but anything can happen **at** an `await`. Other code may run and change state before you resume.
- Don't assume which thread you're on after an `await`, unless you're isolated to an actor (see below).

## The cooperative thread pool

Swift concurrency runs tasks on a **cooperative thread pool** with roughly one thread per CPU core. Instead of creating a thread per piece of work (and paying for thread creation and context switches), tasks take turns: when one suspends, its thread picks up another task.

That design has one hard rule: **never block a thread** in async code. Waiting on a `DispatchSemaphore`, a `DispatchGroup.wait()`, or a lock held across long work keeps a pool thread busy doing nothing, and with only a handful of threads, a few blocked ones can stall the entire app. Always `await` instead.

## Calling async code from sync code: `Task`

You can only `await` inside an async context. To start async work from synchronous code, like a button action, create a `Task`:

```swift
func buttonTapped() {
    Task {
        await showProfile()
    }
}
```

A `Task { }` created this way is **unstructured**: it runs independently, and you can keep a handle to it to cancel it or await its result (`task.value`). It also **inherits** the caller's actor context and priority: a task created from main-actor UI code runs on the main actor, which is what you want for updating the UI. `Task.detached { }` inherits nothing, and is rarely needed.

## Running work in parallel

`await` calls one after another, and they run **sequentially**. To run independent work at the same time, use `async let`:

```swift
func loadDashboard() async throws -> (Profile, Profile) {
    async let first = fetchProfile(id: 1)       // starts immediately
    async let second = fetchProfile(id: 2)      // also starts immediately
    return try await (first, second)            // wait for both
}
```

For a dynamic number of child tasks, use a **task group**. Results arrive in **completion** order, not the order the tasks were added:

```swift
func delayed(_ value: Int, milliseconds: Int) async throws -> Int {
    try await Task.sleep(for: .milliseconds(milliseconds))
    return value
}

let completionOrder = try await withThrowingTaskGroup(of: Int.self) { group in
    group.addTask { try await delayed(1, milliseconds: 60) }
    group.addTask { try await delayed(2, milliseconds: 10) }
    group.addTask { try await delayed(3, milliseconds: 30) }

    var results: [Int] = []
    for try await value in group {
        results.append(value)
    }
    return results
}
print(completionOrder)   // [2, 3, 1]
```

If you need the original order, return the index along with each result and sort, or store results in a dictionary keyed by input.

This is **structured concurrency**: child tasks (from `async let` and task groups) can't outlive the scope that created them. If one child throws, the group cancels the others; if the parent is cancelled, so are its children. That's what makes concurrent code as predictable as sequential code.

## Cancellation is cooperative

Cancelling a task sets a flag. Nothing is forcibly stopped: the task checks the flag at convenient points and decides how to stop. Many APIs check it for you: `Task.sleep` throws `CancellationError` when cancelled, and `URLSession` cancels the request:

```swift
let job = Task { () -> String in
    do {
        try await Task.sleep(for: .seconds(5))
        return "finished"
    } catch {
        return "cancelled: \(type(of: error))"
    }
}
job.cancel()
print(await job.value)   // cancelled: CancellationError
```

In your own long-running loops, check it yourself, with `try Task.checkCancellation()` (throws) or `Task.isCancelled` (a `Bool`):

```swift
func processLines(_ lines: [String]) async throws -> Int {
    var count = 0
    for line in lines {
        try Task.checkCancellation()
        count += line.count
    }
    return count
}
```

To react immediately, for example to cancel an underlying callback-based operation, use `withTaskCancellationHandler`.

## Task-local values

`@TaskLocal` values flow automatically to child tasks, which is great for request IDs, tracing, and logging context:

```swift
enum RequestContext {
    @TaskLocal static var requestID = "none"
}

await RequestContext.$requestID.withValue("req-42") {
    await Task {
        print("child task sees \(RequestContext.requestID)")   // req-42
    }.value
}
print(RequestContext.requestID)   // none: the value only exists inside withValue
```

## Actors: safe shared mutable state

A **data race** happens when two threads access the same memory at the same time and at least one writes. **Actors** prevent them: an actor's mutable state can only be touched by one task at a time, and the compiler enforces that every access from outside goes through `await`:

```swift
actor BankAccount {
    private(set) var balance = 0

    func deposit(_ amount: Int) {
        balance += amount
    }

    func withdraw(_ amount: Int) -> Bool {
        guard balance >= amount else { return false }
        balance -= amount
        return true
    }
}

let account = BankAccount()
await account.deposit(100)          // `await`: we may have to wait our turn
let ok = await account.withdraw(30)
print(ok, await account.balance)    // true 70
```

Inside the actor, methods run one at a time, so no locks are needed. From outside, every access is `await`ed, because the actor might be busy with someone else.

### Reentrancy: the actor trap

Actors run one call at a time, **except at `await`s**. While an actor method is suspended, other calls to the actor can run. That makes actors deadlock-free, but it means state can change across a suspension point:

```swift
actor Wallet {
    private(set) var balance = 100

    private func authorize(_ amount: Int) async throws {
        try await Task.sleep(for: .milliseconds(10))   // e.g. a call to a payment server
    }

    func spendBroken(_ amount: Int) async throws -> Bool {
        guard balance >= amount else { return false }
        try await authorize(amount)          // suspension: another spend can run here!
        balance -= amount
        return true
    }

    func spendFixed(_ amount: Int) async throws -> Bool {
        guard balance >= amount else { return false }
        balance -= amount                    // change state before suspending...
        do {
            try await authorize(amount)
        } catch {
            balance += amount                // ...and roll back on failure
            throw error
        }
        return true
    }
}

let broken = Wallet()
async let firstSpend = broken.spendBroken(80)
async let secondSpend = broken.spendBroken(80)
print(try await [firstSpend, secondSpend], await broken.balance)   // [true, true] -60

let fixed = Wallet()
async let thirdSpend = fixed.spendFixed(80)
async let fourthSpend = fixed.spendFixed(80)
print(try await [thirdSpend, fourthSpend], await fixed.balance)    // [true, false] 20
```

Both broken calls passed the balance check before either one subtracted, so the wallet overdrew. The rule: **don't assume state is unchanged after an `await` inside an actor.** Either update state before suspending, or re-check it afterwards.

## The main actor

UI code must run on the main thread. `@MainActor` is a **global actor** that expresses that in the type system:

```swift
@MainActor
final class ProfileViewModel {
    var title = "Loading…"

    func load() async {
        do {
            let profile = try await fetchProfile(id: 7)   // runs off the main actor
            title = profile.name                          // back on the main actor
        } catch {
            title = "Error"
        }
    }
}
```

The compiler ensures `title` is only touched on the main actor, and `await` hops back automatically after the network call. No more `DispatchQueue.main.async`. Mark individual members `nonisolated` when they don't need main-actor protection.

## `Sendable` and Swift 6 data-race safety

Values that cross from one concurrency domain to another (into a task, into an actor, back to the main actor) must be safe to share. That's what the **`Sendable`** protocol marks:

- value types whose stored properties are all `Sendable` (inferred automatically for non-public structs and enums),
- actors,
- `final` classes with only immutable (`let`), `Sendable` properties,
- classes that do their own synchronization, marked `@unchecked Sendable` (a promise the compiler can't verify).

In **Swift 6 language mode**, these rules are enforced as **errors**: the compiler proves that your code has no data races. For example, sharing a mutable, non-`Sendable` object with a detached task is rejected, with an error saying that sending the closure risks causing data races:

```swift
final class Counter {
    var value = 0
}

func racy() {
    let counter = Counter()
    // Task.detached { counter.value += 1 }   // ❌ error in Swift 6: sending this closure risks data races
    counter.value += 1
}
```

Swift 6 also adds **region-based isolation**, which lets the compiler accept code that passes a non-`Sendable` value to another task when it can prove the original code never uses it again, and the **`sending`** keyword, which states that ownership of a value is transferred. Together, they remove many false alarms that made strict checking painful in earlier releases.

Migrating an existing project to Swift 6 mode can take work, but you can do it gradually: enable complete checking as warnings first, fix one module at a time, and switch modules to Swift 6 mode individually.

## Bridging callbacks and delegates

Wrap a single-result completion handler with a **continuation**, which must be resumed exactly once:

```swift
func legacyFetch(completion: @escaping @Sendable (Result<String, Error>) -> Void) {
    completion(.success("data"))
}

func modernFetch() async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
        legacyFetch { result in
            continuation.resume(with: result)
        }
    }
}
```

The "checked" variant traps if you resume twice, and warns if you never resume. For a **stream** of values, like delegate callbacks or a sensor, use `AsyncStream`:

```swift
final class Sensor: @unchecked Sendable {
    var onReading: ((Double) -> Void)?
    func emit() { [1.5, 2.5].forEach { onReading?($0) } }
}

func readings(from sensor: Sensor) -> AsyncStream<Double> {
    AsyncStream { continuation in
        sensor.onReading = { continuation.yield($0) }
        continuation.onTermination = { _ in sensor.onReading = nil }
    }
}

let sensor = Sensor()
let readingStream = readings(from: sensor)
sensor.emit()

var received: [Double] = []
for await reading in readingStream {
    received.append(reading)
    if received.count == 2 { break }
}
print(received)   // [1.5, 2.5]
```

## Common pitfalls

- **Blocking the cooperative pool** with semaphores, `wait()`, or long synchronous work. Await instead, and move heavy CPU work off actors.
- **Actor reentrancy**: assuming state is unchanged across an `await` inside an actor.
- **Forgetting that `Task { }` inherits the actor**: a task started from `@MainActor` code runs on the main actor, so CPU-heavy work inside it blocks the UI.
- **Unstructured tasks that are never cancelled**, outliving the screen that started them. Keep their handles and cancel them, or use structured APIs like SwiftUI's `.task` modifier.
- **Overusing `@unchecked Sendable`** to silence errors without real synchronization.

## Interview questions

**What's the difference between suspending and blocking?**
A suspended function gives its thread back to the pool while it waits; a blocked thread sits idle. Swift concurrency suspends; blocking the cooperative pool can stall the whole app.

**What's the difference between `async let`, task groups, and `Task { }`?**
`async let` and task groups create structured child tasks bound to their scope, with automatic cancellation; `Task { }` creates an unstructured task that runs independently and inherits the current actor.

**What is actor reentrancy, and why does it matter?**
At each `await`, an actor can run other calls. State checked before an `await` may be different afterwards, so update state before suspending or re-check after.

**What does `Sendable` mean, and what changed in Swift 6?**
`Sendable` marks types safe to share across concurrency domains. Swift 6 language mode turns the checks into errors, guaranteeing data-race freedom at compile time, with region-based isolation and `sending` reducing false positives.

## Summary

- `async` functions suspend without blocking threads; `await` marks every suspension point, where other code may run.
- Tasks run on a cooperative pool: never block it. `Task { }` starts unstructured work; `async let` and task groups run structured, cancellable child tasks.
- Cancellation is cooperative; `@TaskLocal` values flow to child tasks.
- Actors and `@MainActor` protect state, but actors are reentrant at each `await`.
- `Sendable`, region-based isolation, and Swift 6 mode turn data races into compile errors; continuations and `AsyncStream` bridge older APIs.
