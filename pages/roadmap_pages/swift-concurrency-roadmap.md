---
layout: page
title: "Concurrency in Swift"
subtitle: "Tasks, isolation, cancellation, and predictable work over time"
permalink: /swift-concurrency-roadmap/
hide: true
excluded: true
---

Learn to coordinate concurrent work, protect mutable state, and give every task a clear lifetime. The topics move from suspension and structured tasks to isolation, streams, and diagnosing failures. Each article builds a working example, measures the behavior it describes, and ends with an exercise.

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Features from Swift 6.2 to 6.4, such as `@concurrent`, `Task.immediate`, cancellation shields, and the noncopyable `Continuation`, are labeled where they appear, together with the OS versions they require.

Read the examples in order within each article: later Swift blocks extend the earlier definitions and include executable assertions. Diagrams show task trees, interleavings, and state machines; equations appear where queueing, scheduling, or probability gives a precise answer, such as how many requests to keep in flight or how often responses arrive out of order. The earlier [Swift Concurrency: async/await, Tasks, and Actors](/swift-concurrency/) gives a one-article overview of the whole model.

{% include roadmap/legend.liquid %}

## 1. Foundations

- [Concurrency vs. Parallelism: Understanding the Difference](/swift-concurrency-vs-parallelism/)
- [Threads, Dispatch Queues, and Swift Tasks](/swift-threads-dispatch-queues-tasks/)
- [Suspending Functions with `async` and `await`](/swift-async-await-suspension/)
- [Running Independent Work with `async let`](/swift-async-let/)
- [Structured Concurrency and Child-Task Lifetimes](/swift-structured-concurrency/)
{: .roadmap-topics}

## 2. Task Ownership

- [Creating Tasks and Choosing Their Lifetime Owner](/swift-task-lifetime-ownership/)
- [Task Groups: Fan-Out, Aggregation, and Early Exit](/swift-task-groups/)
- [Cooperative Cancellation and Cancellation Checks](/swift-cooperative-cancellation/)
- [Cancellation Handlers and Reliable Resource Cleanup](/swift-cancellation-handlers-cleanup/)
- [Unstructured and Detached Tasks: When to Use Each](/swift-unstructured-detached-tasks/)
- [Task Priority, Inheritance, and Priority Inversion](/swift-task-priority/)
{: .roadmap-topics}

## 3. Isolation and Shared State

- [Actors: Protecting State Behind an Isolation Boundary](/swift-actors/)
- [Actor Reentrancy Across Suspension Points](/swift-actor-reentrancy/)
- [The Main Actor and UI-Facing State](/swift-main-actor/)
- [`Sendable`: Moving Values Across Isolation Boundaries](/swift-sendable/)
- [Isolated and Nonisolated Methods](/swift-isolated-nonisolated/)
- [Choosing an Executor Without Blocking the UI](/swift-executors/)
- [Migrating to Swift 6 Data-Race Safety](/swift-6-data-race-safety-migration/)
{: .roadmap-topics}

## 4. Streams and Legacy APIs

- [Consuming Values with `AsyncSequence`](/swift-asyncsequence/)
- [Building Streams with `AsyncStream` and `AsyncThrowingStream`](/swift-asyncstream/)
- [Buffering, Backpressure, and Stream Termination](/swift-stream-backpressure/)
- [Bridging Callback APIs with Checked Continuations](/swift-checked-continuations/)
- [Continuation Ownership, Cancellation, and Double Resume](/swift-continuation-ownership/)
{: .roadmap-topics}

## 5. Testing and Diagnosis

- [Rejecting Stale Results After Request Replacement](/swift-rejecting-stale-results/)
- [Testing Concurrent Work with Controlled Interleavings](/swift-testing-controlled-interleavings/)
- [Avoiding Deadlocks and Blocking Waits](/swift-deadlocks-blocking-waits/)
- [Finding Data Races with Thread Sanitizer](/swift-thread-sanitizer/)
- [Profiling Task Lifetimes and Main-Actor Contention](/swift-profiling-tasks-main-actor/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-networking/" next_title="Networking" %}
