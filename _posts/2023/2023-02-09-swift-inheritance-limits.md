---
layout: post
hidden: true
title: "The Limits of Class Inheritance in Swift"
date: "2023-02-09"
last_modified_at: "2023-02-09"
permalink: /swift-inheritance-limits/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Inheritance", "Composition"]
thumbnail: assets/img/article-placeholder.svg
---
Inheritance is useful when a subclass is a behavioral specialization of its superclass. It becomes restrictive when the hierarchy is used to collect unrelated capabilities, share a helper, or represent several independent configuration choices at once.

Swift permits one superclass per class. Protocols and composition provide other forms of reuse, but the deeper question is which relationships the application actually needs to support.

<!--more-->

## A superclass creates obligations, not just convenience

Consider a mutable text collection. Its contract allows clients to append a line and then read the resulting content:

```swift
class MutableTextCollection {
    private var lines: [String] = []

    func append(_ line: String) { lines.append(line) }
    func allLines() -> [String] { lines }
}

final class TimestampedTextCollection: MutableTextCollection {
    private(set) var additions = 0

    override func append(_ line: String) {
        super.append(line)
        additions += 1
    }
}

let logCollection: MutableTextCollection = TimestampedTextCollection()
logCollection.append("Started")
assert(logCollection.allLines() == ["Started"])
```

This subclass preserves the base behavior and adds an observation. A client using the base interface still gets the expected append-and-read semantics.

A read-only subclass that traps inside `append` would be different. The superclass permits an operation that the subclass rejects. The problem is a stronger precondition, not a missing keyword. Making the method compile does not establish substitutability.

Swift's [Inheritance chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/inheritance/) defines overriding and superclass rules. Those rules cannot prove that an override continues to satisfy every caller's behavioral expectations.

## Represent read-only capability directly

A read-only collection can satisfy a smaller contract without pretending to be a mutable collection:

```swift
protocol TextReading {
    func allLines() -> [String]
}

protocol TextAppending: TextReading {
    func append(_ line: String)
}

extension MutableTextCollection: TextAppending {}

struct FrozenText: TextReading {
    let lines: [String]
    func allLines() -> [String] { lines }
}

func heading(from source: any TextReading) -> String {
    source.allLines().first ?? "Empty"
}

assert(heading(from: FrozenText(lines: ["Snapshot"])) == "Snapshot")
assert(heading(from: logCollection) == "Started")
```

The frozen value has no unsupported mutation method. The consumer expresses the capability it needs and accepts either implementation.

This also makes temporal semantics visible. `FrozenText` returns a stable value captured at construction. The mutable collection returns its latest lines. Both satisfy this deliberately weak reading contract; a consumer needing a transactionally stable snapshot would need a stronger promise or an explicit snapshot operation.

## Independent choices multiply subclasses

A search feature can vary matching policy, caching, instrumentation, and data source. Encoding each combination in a subclass name creates a product of choices: cached exact search, cached fuzzy search, logged cached fuzzy search, and so on.

The choices are not necessarily subtypes of one another. Logging is a behavior around a search, not a special kind of fuzzy matching. A cache has a freshness policy; a matcher has comparison semantics. Their reasons to change differ.

Composition keeps those choices separate:

```swift
struct LineSearch {
    let read: () -> [String]
    let matches: (String, String) -> Bool

    func results(query: String) -> [String] {
        read().filter { matches($0, query) }
    }
}

let exactLineSearch = LineSearch(
    read: { ["Swift", "swift", "Kotlin"] },
    matches: { $0 == $1 }
)
let prefixLineSearch = LineSearch(
    read: { ["Swift", "SwiftUI", "Kotlin"] },
    matches: { $0.hasPrefix($1) }
)
assert(exactLineSearch.results(query: "Swift") == ["Swift"])
assert(prefixLineSearch.results(query: "Swift") == ["Swift", "SwiftUI"])
```

Two named closures are sufficient for this small example. A protocol is useful when a capability needs a richer contract, related operations, or associated type relationships. Solving a hierarchy problem does not require introducing the maximum number of protocols.

## The fragile base class problem is about hidden dependencies

A base implementation may call an overridable hook before mutation. A subclass can rely on that order. A later refactor moves the hook after mutation while preserving the base method's return value. Ordinary clients see the same result; the subclass sees a different state.

This is why a subclassable API includes more than public method signatures. Hook timing, whether `super` must be called, reentrancy, failure behavior, and inherited state access all become part of its extension contract.

A final workflow can protect its sequence while exposing selected hooks, but those hooks remain dependencies. A final class with an injected collaborator often narrows the variation to one declared operation. Neither option automatically makes arbitrary callbacks safe.

## One superclass does not mean one capability

A view controller can inherit from a framework superclass and conform to several domain protocols. That is a legitimate combination. The framework owns its lifecycle contract, while the protocols describe capabilities such as loading a model or receiving an event.

Protocols do not add stored fields through extensions. A shared cache still needs an owner. Two conformances using credentials still need a decision about whether they share a credential source or each receive a separate one.

| Reuse pressure | Inheritance consequence | Alternative to evaluate |
|---|---|---|
| Share one pure calculation | Adds a family relationship | Function or concrete value helper |
| Combine independent policies | Many combinations of subclasses | Injected collaborators |
| Expose read-only behavior | Can inherit unsupported mutations | Narrow reading protocol |
| Share resource identity and lifecycle | Can be a coherent base contract | Carefully documented superclass |

The last row matters. Some abstractions really do have one common identity-bearing lifecycle. Replacing a clear framework base class with forwarding wrappers may make it harder to use correctly.

## Construction can expose another limit

A non-final class with a factory returning `Self` needs a construction contract valid for its subclasses, commonly a required initializer. A subclass with additional required dependencies may then struggle to satisfy the inherited factory's assumptions.

Do not add dummy dependencies just to satisfy that initializer. Reconsider whether the factory should construct a specific concrete type, receive a factory collaborator, or return a protocol capability. Construction is part of the abstraction's promises too.

Likewise, an initializer should not call a customization hook that expects a fully activated subclass unless the language rules and lifecycle contract support that sequence. Construction, activation, and external work are easier to reason about when their boundaries are explicit.

## Inheritance does not determine ownership

A subclass instance contains inherited state. It does not contain a separate parent instance merely because code calls `super`. In contrast, a composed object really does hold a collaborator reference or value.

That collaborator needs a lifetime policy. Sharing one mutable service across several feature objects differs from constructing one service per feature. Changing from inheritance to composition can accidentally change this sharing even when method names remain identical.

For example, moving a cache from an instance field in a base class to a singleton helper makes previously independent searches share state. Moving it into a fresh helper created for every call destroys reuse. Test lifetime and reuse as part of the migration.

## Preserve behavior before changing architecture

Choose a consumer-facing operation and write characterization cases for its results, errors, and required effects. Extract one varying decision and supply it as a collaborator. Compare the old and new behavior on empty input, ordinary input, and failure.

Be careful about effect frequency. A base method might normalize a query once before filtering. Moving normalization into a matcher can perform the same work once per candidate. If normalization is pure, the output may match while the workload changes; if it reads mutable state, behavior may change too.

The replacement should preserve intended semantics, not merely produce the same class diagram with interface boxes.

## Evaluate a proposed subclass with three questions

Can it support every operation a base-typed caller is entitled to use? Can its required construction and lifecycle fit the parent's contract? Are the differences truly specialization, or are they independent capabilities that need to vary separately?

If the answers are clear, inheritance can remain a useful tool. If they require exceptions such as “never call that inherited method” or “construct it this way only in tests,” the model deserves another look.

As an exercise, add an in-memory cache to `LineSearch`. Specify whether the key includes the query and dataset, and whether the matching policy can change. Those rules belong to the cache boundary. A subclass named `CachedLineSearch` would not answer them automatically.

For a worked migration with failure tests, continue with [Refactoring Class Hierarchies into Protocols](/swift-refactoring-inheritance-to-protocols/).

## Worked counterexample: a conformance can still discard writes

Splitting a class hierarchy into reading and writing protocols prevents a read-only type from inheriting a mutation it cannot support. It does not prove every writer honors its operation. Use a negative control to make that limitation explicit:

```swift
struct DiscardingTextCollection: TextAppending {
    func allLines() -> [String] { [] }
    func append(_ line: String) {}
}

func honorsAppend(_ store: any TextAppending) -> Bool {
    let before = store.allLines()
    store.append("Contract probe")
    return store.allLines() == before + ["Contract probe"]
}

assert(honorsAppend(MutableTextCollection()))
assert(!honorsAppend(DiscardingTextCollection()))
```

The negative implementation compiles and fails the behavioral check. An interface change cannot repair a missing semantic promise. Its operation must be documented and exercised through the same boundary consumers use.

The probe itself performs a write, so it belongs in an isolated test store. Do not run it against a customer's real collection as a harmless health check. A contract test has effects according to the capability it exercises.

Also consider whether append order is genuinely part of the abstraction. This model promises that the new line appears after the existing snapshot. A distributed append service might accept work for later processing instead. If so, give it an acceptance or operation-receipt contract rather than claiming immediate local append behavior.

A subclass can violate the same rule by omitting `super.append`, and a protocol conformer can violate it by doing nothing. The advantage of the capability split is narrower, more truthful interfaces; the implementation still bears responsibility for fulfilling them.

When reviewing a proposed migration, keep one deliberate failing implementation in the test suite when it helps establish that the shared contract test actually detects the forbidden behavior. Otherwise a test returning `true` unconditionally can make every design look substitutable.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
