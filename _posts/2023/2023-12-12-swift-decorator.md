---
layout: post
hidden: true
title: "Decorator in Swift: Add Behavior While Preserving the Capability Contract"
date: "2023-12-12"
last_modified_at: "2023-12-12"
permalink: /swift-decorator/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Design Patterns, Architecture]
thumbnail: assets/img/article-placeholder.svg
---
Decorator adds behavior around an existing capability while presenting the same interface. A reader can be counted, cached, or traced without making its consumers depend on every combination of those policies.

The wrapper order is observable. Counting outside a cache measures consumer requests; counting inside measures calls that actually reach the underlying reader. Both can be useful, but they answer different questions.

<!--more-->

These Swift 5.7 examples use an immutable snapshot reader and serial decorators. The snapshot contract makes success caching valid for the reader's lifetime; adapting the same cache to live data would require an invalidation or version policy.

## Start with the capability and a working implementation

```swift
enum ReadFailure: Error, Equatable { case missing(Int) }
protocol ValueReading {
    func value(for key: Int) throws -> String
}

struct SnapshotReader: ValueReading {
    let values: [Int: String]
    func value(for key: Int) throws -> String {
        guard let value = values[key] else { throw ReadFailure.missing(key) }
        return value
    }
}

final class CountingReader: ValueReading {
    private let wrapped: any ValueReading
    private(set) var calls = 0
    init(_ wrapped: any ValueReading) { self.wrapped = wrapped }
    func value(for key: Int) throws -> String {
        calls += 1
        return try wrapped.value(for: key)
    }
}

final class MemoizingReader: ValueReading {
    private let wrapped: any ValueReading
    private var cache: [Int: String] = [:]
    init(_ wrapped: any ValueReading) { self.wrapped = wrapped }
    func value(for key: Int) throws -> String {
        if let cached = cache[key] { return cached }
        let value = try wrapped.value(for: key)
        cache[key] = value
        return value
    }
}
```

Each decorator implements the same protocol and forwards to another implementation. The consumer can receive any composed `ValueReading` without knowing its wrapper count.

The counter counts attempted calls, including failures, because it increments before forwarding. A success counter would increment only after return. Give metrics names that match their placement and meaning.

## Wrapper order changes the observation

```swift
let source = SnapshotReader(values: [1: "Values", 2: "Objects"])
let outside = CountingReader(MemoizingReader(source))
let first = try outside.value(for: 1)
let second = try outside.value(for: 1)
assert(first == second && outside.calls == 2)

let inside = CountingReader(source)
let cached = MemoizingReader(inside)
_ = try cached.value(for: 1)
_ = try cached.value(for: 1)
assert(inside.calls == 1)
```

Both readers return the same stable value. The first count measures two public requests; the second measures one cache miss reaching the source.

A logging decorator has the same ordering distinction. An audit requirement for every attempted read belongs outside a cache. A diagnostic log for physical source reads belongs inside it.

```mermaid
flowchart LR
    accTitle: Decorator order determines what a counter observes
    Client[Consumer] --> Outer[Counter outside cache]
    Outer --> Cache[Memoizing reader]
    Cache --> Inner[Counter inside cache]
    Inner --> Source[Snapshot reader]
```

The diagram illustrates two possible observation points; the code constructs each case separately so their counts are easy to compare.

## Failure policy is part of the decorator contract

```swift
for _ in 0..<2 {
    do {
        _ = try cached.value(for: 99)
        assertionFailure("Missing data must remain a failure")
    } catch ReadFailure.missing(99) {}
}
assert(inside.calls == 3)
```

Only successful values are memoized. A failed read leaves no cache entry, so a later request reaches the source again. Caching failures could be valid for an immutable absent key, but it should be explicit, especially when a different source can recover from transient failure.

Do not make a decorator silently substitute an empty string for all failures. That changes the capability's meaning from “a value or an error” to “apparently successful output,” and callers lose information needed to respond correctly.

## Preserve the contract, not every implementation detail

A cache changes timing and physical call counts. It preserves this capability only because the contract concerns stable values and failures, not a required I/O action on every call.

If reading is itself a command, such as charging an account or consuming a stream element, memoization can suppress required work. The same wrapper structure would then be inappropriate.

Likewise, a decorator that transforms returned text is valid only if the capability allows that transformation. Adding behavior is not permission to violate units, ownership, freshness, or ordering promised to consumers.

## Retry layers can multiply effects

A retry decorator around a higher-level workflow may repeat several lower-level effects, while retrying one safe read may repeat only that read. Nested retry layers can multiply attempts unexpectedly.

Use explicit attempt budgets and classify failures. A timeout does not prove a remote effect failed; idempotency or reconciliation belongs to the external protocol.

For a small reusable retry function, see [Higher-Order Functions](/swift-higher-order-functions/). Decorators and function combinators can implement similar policies; choose the representation that fits the interface consumers already use.

## Ownership and isolation do not come for free

The decorators strongly retain their wrapped reader because it is required for their lifetime. A tracing closure that captures its owner can create an independent retain cycle.

Both cache and counter mutate state. This sample requires serialized access. Protecting the cache dictionary while leaving a mutable wrapped source unprotected would not establish safety for the whole chain.

An actor-based decorator may also coalesce in-flight requests, which changes cancellation and failure sharing. Document whether one caller can cancel work awaited by another and how stale completions interact with invalidation.

## Keep wrappers coherent and observable

A tiny decorator can be a useful boundary when it represents a real policy such as timing, caching, or access control. A chain of wrappers that merely forwards calls with different names adds indirection without a benefit.

Provide a way to understand the assembled chain in diagnostics or configuration. A consumer should not need to know every layer, but an application owner needs to explain why a call was retried, cached, or recorded.

## Substitutability includes observable effects

A decorator can conform to the same Swift protocol and still violate its meaning. Consider adding a cache around a reader whose documented behavior is “fetch the latest remote value on every call.” Returning an old value preserves the return type while breaking freshness.

The example instead uses a snapshot reader: repeated reads represent one stable snapshot. That contract makes memoization compatible. If callers need both stable snapshots and refreshed remote reads, expose different operations or policies instead of letting a wrapper silently redefine one operation.

Other effects matter too. A retrying decorator can cause duplicate writes, a logging decorator can expose sensitive fields, and a timing decorator can retain expensive payloads while recording them. Review what becomes observable through each layer, not just which protocol it implements.

## Work out wrapper order with a trace

For a metrics decorator outside a retry decorator, one public call increments the outer metric once even if the retry layer makes three underlying attempts. Reversing the wrappers records three attempts. Both measurements are useful, but they answer different questions.

Write the call chain as a short trace before wiring it: public request, logical-operation metric, retry loop, attempt metric, transport. Name the counters according to that trace. A dashboard labeled only “requests” becomes ambiguous once wrappers add retries or caching.

The counter and memoizer assertions above use the same technique on a smaller chain. They distinguish requests reaching the decorated interface from reads reaching the underlying source. Tests that merely compare returned strings would miss this order-sensitive behavior.

## Cancellation and cache invalidation expand the contract

An async decorator should preserve cancellation unless its documented policy says otherwise. Catching every error and retrying can turn cancellation into unexpected continued work. A timeout wrapper also needs to specify whether it stops the underlying operation or only stops waiting for its result.

For a refreshable cache, clearing the stored result is insufficient when a previous read is still in flight. Associate loads with a generation and reject publication from older generations. The [repository article](/swift-repository/) develops that issue at a domain boundary.

As the wrapper stack grows, inspect it at the composition root. If callers have to know the concrete layer order to use the capability correctly, some of those policies may belong in an explicit higher-level service instead. Decorators work best when they add bounded behavior and preserve a comprehensible public contract.

## Exercise: add a bounded cache

Limit the memoizing reader to a fixed number of entries with an explicit eviction policy. Test that eviction changes source call counts but not stable returned values. Put a counter outside and inside the cache, then explain which count should drive a user-request metric and which should drive a source-load metric.

Return to the [Design Patterns roadmap](/swift-design-patterns/).
