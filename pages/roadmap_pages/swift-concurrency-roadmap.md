---
layout: page
title: "Concurrency in Swift"
subtitle: "Tasks, isolation, cancellation, and predictable work over time"
permalink: /swift-concurrency-roadmap/
hide: true
excluded: true
---

Learn to coordinate concurrent work, protect mutable state, and give every task a clear lifetime. The topics move from suspension and structured tasks to isolation, streams, and diagnosing failures. These are planned article titles; links will be added as articles become available.

{% include roadmap/legend.liquid %}

## 1. Foundations

- Concurrency vs. Parallelism: Understanding the Difference
- Threads, Dispatch Queues, and Swift Tasks
- Suspending Functions with `async` and `await`
- Running Independent Work with `async let`
- Structured Concurrency and Child-Task Lifetimes
{: .roadmap-topics}

## 2. Task Ownership

- Creating Tasks and Choosing Their Lifetime Owner
- Task Groups: Fan-Out, Aggregation, and Early Exit
- Cooperative Cancellation and Cancellation Checks
- Cancellation Handlers and Reliable Resource Cleanup
- Unstructured and Detached Tasks: When to Use Each
- Task Priority, Inheritance, and Priority Inversion
{: .roadmap-topics}

## 3. Isolation and Shared State

- Actors: Protecting State Behind an Isolation Boundary
- Actor Reentrancy Across Suspension Points
- The Main Actor and UI-Facing State
- `Sendable`: Moving Values Across Isolation Boundaries
- Isolated and Nonisolated Methods
- Choosing an Executor Without Blocking the UI
- Migrating to Swift 6 Data-Race Safety
{: .roadmap-topics}

## 4. Streams and Legacy APIs

- Consuming Values with `AsyncSequence`
- Building Streams with `AsyncStream` and `AsyncThrowingStream`
- Buffering, Backpressure, and Stream Termination
- Bridging Callback APIs with Checked Continuations
- Continuation Ownership, Cancellation, and Double Resume
{: .roadmap-topics}

## 5. Testing and Diagnosis

- Rejecting Stale Results After Request Replacement
- Testing Concurrent Work with Controlled Interleavings
- Avoiding Deadlocks and Blocking Waits
- Finding Data Races with Thread Sanitizer
- Profiling Task Lifetimes and Main-Actor Contention
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-networking/" next_title="Networking" %}
