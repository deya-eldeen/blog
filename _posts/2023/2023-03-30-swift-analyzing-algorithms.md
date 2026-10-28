---
layout: post
hidden: true
title: "Analyzing Swift Algorithms: From a Slow Screen to a Defensible Cost Model"
date: "2023-03-30"
last_modified_at: "2023-03-30"
permalink: /swift-analyzing-algorithms/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A sluggish screen is a symptom, not a complexity class. Before replacing data structures, identify the calculation being repeated, define the required output, and measure the workload that actually reaches it.

This case study enriches events with their owner's display name. The initial code is easy to read but scans the user list for every event. We will build an index without changing how unknown users and duplicate identities are handled.

<!--more-->

The examples use Swift 5.7. The goal is an analysis method that can be applied to a real feature, rather than a claim that every nested loop should become a dictionary.

## Characterize the current contract

```swift
struct User { let id: Int; let name: String }
struct Event { let id: Int; let ownerID: Int }
struct EventRow: Equatable { let id: Int; let ownerName: String }

func scannedRows(events: [Event], users: [User]) -> [EventRow] {
    events.map { event in
        let owner = users.first { $0.id == event.ownerID }
        return EventRow(id: event.id, ownerName: owner?.name ?? "Unknown")
    }
}

let users = [User(id: 1, name: "Maya"), User(id: 2, name: "Omar")]
let events = [Event(id: 10, ownerID: 2), Event(id: 11, ownerID: 9)]
assert(scannedRows(events: events, users: users) == [
    EventRow(id: 10, ownerName: "Omar"), EventRow(id: 11, ownerName: "Unknown")
])
```

Rows preserve event order and identity. Unknown owners get a placeholder. If duplicate user IDs exist, `first(where:)` selects the first user. Whether duplicates should be legal is a product question; a behavior-preserving refactor must not silently switch to the last.

Write these observations down before optimizing. A faster result in a different order or with different conflict resolution is a behavior change, not evidence of successful optimization.

## Model two independent dimensions

Let `n` be events and `m` be users. Worst-case scanning work is proportional to `nm`; every missing owner scans the entire user list. A useful approximation is:

$$
T_{\mathrm{scan}}(n,m)=a n m+b n.
$$

Do not collapse this to `O(n²)` unless a relationship between `n` and `m` is justified. A feature with ten fixed users and a million events differs from one where both collections grow together.

## Build an index with an explicit duplicate policy

```swift
func indexedRows(events: [Event], users: [User]) -> [EventRow] {
    var firstNameByID: [Int: String] = [:]
    for user in users where firstNameByID[user.id] == nil {
        firstNameByID[user.id] = user.name
    }
    return events.map { event in
        EventRow(id: event.id, ownerName: firstNameByID[event.ownerID] ?? "Unknown")
    }
}

assert(indexedRows(events: events, users: users) == scannedRows(events: events, users: users))
let duplicateUsers = users + [User(id: 2, name: "Replacement")]
assert(indexedRows(events: events, users: duplicateUsers) ==
       scannedRows(events: events, users: duplicateUsers))
assert(indexedRows(events: [], users: users).isEmpty)
```

Index construction takes expected linear work in `m`, and enrichment takes expected linear work in `n` for integer keys. Additional index storage is `O(m)` in the number of distinct IDs. Output storage remains `O(n)` in both versions.

The index is local to one coherent user snapshot. A long-lived cache needs invalidation when a name changes, a user disappears, or the active account changes. Introducing stale data would exchange one performance problem for a correctness problem.

## Find the crossover instead of assuming it

An indexed version has setup cost. For one event and three users, building a dictionary may provide no practical benefit. For repeated enrichment against the same snapshot, the setup can be reused.

$$
T_{\mathrm{index}}(n,m)=c m+d n.
$$

Constants depend on allocation, hashing, and data layout. A model predicts growth; a benchmark estimates constants for the relevant environment. Include realistic missing-owner rates because a scan's early exits change with the input distribution.

Do not build synthetic fixtures inside the timed region unless fixture construction is part of the production path. Equally, do include index construction when production rebuilds it every refresh.

## A minimal measurement needs an observable result

```swift
import Dispatch

func measured<T>(_ operation: () -> T) -> (value: T, nanoseconds: UInt64) {
    let start = DispatchTime.now().uptimeNanoseconds
    let value = operation()
    let end = DispatchTime.now().uptimeNanoseconds
    return (value, end - start)
}

let measuredRows = measured { indexedRows(events: events, users: users) }
assert(measuredRows.value.count == events.count)
```

This helper measures elapsed monotonic time. It is not a complete benchmark framework, and this tiny invocation cannot establish a speedup. Use optimized builds, several input sizes, repeated samples, and checks that the output remains observable.

Report distributions rather than one best run. Background activity, memory pressure, and warm caches can move results. Keep hardware, compiler, build flags, and fixture dimensions with measurements intended for comparison.

## Inspect allocations and lifetime as well as CPU time

The dictionary retains names until the index is released. If names or users contain larger object graphs, the retained memory may matter more than the dictionary entries.

An array slice can also keep its original backing buffer alive, and a closure can retain a service used during transformation. Peak memory is a property of the whole lifetime, not only local variable count.

Use a profiler to identify actual hot operations before introducing unsafe buffers or custom storage. A measured bottleneck in decoding would not be solved by optimizing an already cheap owner lookup.

## Test the transformation with an independent observation

Compare scanned and indexed versions over small fixtures, then add expected outputs so copied mistakes do not pass both implementations. Include missing users, duplicate IDs, repeated events, empty names, and empty collections.

A useful property is that adding an unrelated user does not change rows. Another is that permuting events permutes rows in the same way. Permuting duplicate users can change output under first-wins semantics, so do not assert order independence where the contract does not provide it.

## Case study: an index reused across several screens

If a user snapshot is shared by five reports, rebuilding the same ID-to-name dictionary five times repeats setup. A validated immutable directory value can own the index once and supply lookups to each calculation.

That boundary should include a version or lifetime: it represents one user snapshot, not an eternal cache. Replacing the account or applying a profile update constructs a new directory. Reports calculated from the earlier version remain explainable, and a coordinator decides whether their results are still acceptable to publish.

Avoid putting the index behind an opaque singleton merely to reuse it. That would hide the snapshot dependency the optimization was intended to clarify. Pass the directory or the required lookup capability explicitly.

For very large snapshots, retaining a directory can keep strings and their backing storage alive after a screen closes. Reuse and retention are opposing parts of the same design decision.

## Establish performance acceptance criteria before optimizing

Choose a representative upper workload and a measurable target, such as refresh computation within a budget on a specified device class. Record median and tail behavior if user-visible latency matters.

Then preserve an output checksum or expected row set while measuring. A refactor that accidentally skips unknown-owner events can look faster because it performs less required work.

Keep input generation deterministic and report compiler optimization settings. Test both cold construction and repeated reuse when the application has both paths. The result should explain which operation improved and which workload still dominates, rather than claiming the entire app is faster from a microbenchmark alone.

## Preserve evidence through the refactor

A reviewable optimization can include the original cost model, representative fixture dimensions, correctness observations, and before/after measurements. Record the exact change that removes repeated work rather than merely stating that dictionaries are faster.

For this example, the claim is specific: one user scan per event becomes one index construction per snapshot plus one lookup per event. Unknown-owner behavior and first-wins duplicate policy remain explicit.

If measurements show decoding now dominates, stop optimizing lookup unless another requirement justifies it. A successful optimization often moves the bottleneck; that is useful information, not a reason to keep rewriting the same component indefinitely.

Retain a regression benchmark only where the workload and threshold can be stable enough to detect meaningful change. A noisy timing assertion on every tiny unit test creates maintenance cost without trustworthy evidence.

## Exercise: make duplicate identities an error

Replace first-wins behavior with explicit rejection of duplicate user IDs. Return a structured failure and verify no partial row array escapes. Treat this as a deliberate contract change after the indexed refactor has been validated.

For the collection's behavior, see [Dictionary](https://developer.apple.com/documentation/swift/dictionary). Continue with [Hash Tables](/swift-hash-tables/).

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
