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

For years, asynchronous Swift code meant completion handlers, nested closures, and manual thread hopping. Swift concurrency replaces that with three ideas built into the language: `async`/`await` for writing asynchronous code that reads top to bottom, **tasks** for running work concurrently, and **actors** for protecting shared state from data races, checked by the compiler.

<!--more-->

## `async` and `await`

A function marked `async` can suspend while it waits for something, without blocking a thread. Callers mark each potential suspension point with `await`:

```swift
struct Profile {
    let name: String
}

func fetchProfile(id: Int) async throws -> Profile {
    try await Task.sleep(for: .milliseconds(100))     // stand-in for a network call
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

Compare that with the completion-handler version: no nested closures, normal `do`/`catch` error handling, and no way to forget to call the completion handler on some path.

**Suspending is not blocking.** While `fetchProfile` waits, the thread is free to run other work. When the result is ready, the function resumes, possibly on a different thread.

## Calling async code from sync code: `Task`

You can only `await` inside an async context. To start async work from synchronous code, like a button action, create a `Task`:

```swift
func buttonTapped() {
    Task {
        await showProfile()
    }
}
```

A task is a unit of asynchronous work. It inherits the **actor** it's created on, so a task started from main-actor UI code also runs on the main actor, which is usually what you want for updating the UI.

## Running work in parallel

`await` one call after another and they run **sequentially**. To run independent work at the same time, use `async let`:

```swift
func loadDashboard() async throws -> (Profile, Profile) {
    async let first = fetchProfile(id: 1)       // starts immediately
    async let second = fetchProfile(id: 2)      // also starts immediately
    return try await (first, second)            // wait for both
}
```

For a dynamic number of child tasks, use a **task group**:

```swift
func fetchAll(ids: [Int]) async throws -> [Profile] {
    try await withThrowingTaskGroup(of: Profile.self) { group in
        for id in ids {
            group.addTask { try await fetchProfile(id: id) }
        }
        var profiles: [Profile] = []
        for try await profile in group {
            profiles.append(profile)
        }
        return profiles
    }
}
```

This is **structured concurrency**: child tasks can't outlive their scope. If one child throws, or the parent is cancelled, the remaining children are cancelled automatically.

## Cancellation

Cancellation in Swift is **cooperative**: cancelling a task sets a flag, and the task decides when to stop. Many system APIs, like `Task.sleep` and `URLSession`, check it for you. In your own loops, check it yourself:

```swift
func processLargeFile(lines: [String]) async throws -> Int {
    var count = 0
    for line in lines {
        try Task.checkCancellation()     // throws CancellationError if cancelled
        count += line.count
    }
    return count
}

let job = Task {
    try await processLargeFile(lines: ["a", "b"])
}
job.cancel()
```

## Actors: safe shared state

A **data race** happens when two threads access the same memory at the same time and at least one writes. Actors prevent them: an actor's mutable state can only be accessed by one task at a time.

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

func useAccount() async {
    let account = BankAccount()
    await account.deposit(100)          // `await`: we may have to wait our turn
    let ok = await account.withdraw(30)
    print(ok, await account.balance)
}
```

From outside, every access to an actor is `await`ed, because the actor might be busy. Inside, code runs one call at a time, so no locks are needed.

### Reentrancy

While an actor method is suspended at an `await`, other calls can run on the actor. Don't assume state is unchanged after an `await` inside an actor method: check it again.

## The main actor

UI code must run on the main thread. `@MainActor` expresses that in the type system:

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

The compiler ensures `title` is only touched on the main actor. No more `DispatchQueue.main.async`.

## `Sendable` and data-race safety

Values passed between concurrency domains, like into a task or an actor, must be safe to share. That's what the `Sendable` protocol marks: value types made of sendable parts, actors, and immutable or internally synchronized classes. In **Swift 6 language mode**, the compiler checks all of this and reports potential data races as errors at compile time. Migrating an existing project can take work, but the payoff is a whole class of bugs that can't reach production.

## Bridging old callback APIs

Wrap completion-handler APIs with a **continuation**:

```swift
func legacyFetch(completion: @escaping @Sendable (Result<String, Error>) -> Void) {
    completion(.success("data"))
}

func modernFetch() async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
        legacyFetch { result in
            continuation.resume(with: result)    // must be resumed exactly once
        }
    }
}
```

## Summary

- `async` functions can suspend without blocking threads; `await` marks every suspension point.
- `Task` starts async work from sync code; `async let` and task groups run work in parallel with structured cancellation.
- Cancellation is cooperative: check `Task.checkCancellation()` in long loops.
- Actors and `@MainActor` protect state; `Sendable` and Swift 6 mode turn data races into compile errors.
