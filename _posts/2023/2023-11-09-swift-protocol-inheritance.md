---
layout: post
hidden: true
title: "Protocol Inheritance in Swift: Refine Capabilities Without Sharing Storage"
date: "2023-11-09"
last_modified_at: "2023-11-09"
permalink: /swift-protocol-inheritance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Composition", "API Design"]
thumbnail: assets/img/article-placeholder.svg
---
Protocol inheritance combines requirements. A refined protocol can demand everything its parent demands and add another capability or a stronger associated-type constraint. It does not inherit stored fields, run a parent initializer, or turn conforming values into subclasses.

A text store illustrates both the benefit and the risk. A preview needs to read. An editor needs to read and write. A transactional importer needs stronger batch-write semantics. Those consumers should not all receive the same administrative interface.

<!--more-->

## Refine a read capability into an editing capability

```swift
protocol StoredTextReading {
    func text(for key: String) -> String?
}

protocol StoredTextEditing: StoredTextReading {
    func write(_ text: String, for key: String)
}

final class MemoryTextStore: StoredTextEditing {
    private var values: [String: String] = [:]

    func text(for key: String) -> String? { values[key] }
    func write(_ text: String, for key: String) { values[key] = text }
}

struct TextSnapshot: StoredTextReading {
    let values: [String: String]
    func text(for key: String) -> String? { values[key] }
}

func previewText(from store: any StoredTextReading, key: String) -> String {
    store.text(for: key) ?? "Missing"
}

let memoryTextStore = MemoryTextStore()
memoryTextStore.write("Draft", for: "note")
assert(previewText(from: memoryTextStore, key: "note") == "Draft")
assert(previewText(from: TextSnapshot(values: ["note": "Frozen"]), key: "note") == "Frozen")
```

The editing conformance must satisfy both requirements. The snapshot satisfies reading without manufacturing a write method that ignores changes or crashes.

A consumer accepting `any StoredTextReading` can also receive an editing store, but the interface it sees exposes only reading. This limits ordinary available operations; it is not an authorization system preventing determined code from accessing another reference or attempting a concrete cast.

## A refinement can add a stronger operation

Suppose import requires replacing several keys together. Add a distinct capability whose semantics state that failure leaves all previous values intact:

```swift
enum BatchStoreFailure: Error, Equatable { case invalidKey }

protocol BatchTextReplacing: StoredTextEditing {
    func replaceBatch(_ values: [String: String]) throws
}

final class AtomicMemoryTextStore: BatchTextReplacing {
    private var values: [String: String] = [:]

    func text(for key: String) -> String? { values[key] }
    func write(_ text: String, for key: String) { values[key] = text }

    func replaceBatch(_ proposed: [String: String]) throws {
        guard proposed.keys.allSatisfy({ !$0.isEmpty }) else {
            throw BatchStoreFailure.invalidKey
        }
        var replacement = values
        for (key, value) in proposed { replacement[key] = value }
        values = replacement
    }
}

let atomicTextStore = AtomicMemoryTextStore()
atomicTextStore.write("Before", for: "note")
do {
    try atomicTextStore.replaceBatch(["note": "After", "": "Invalid"])
    assertionFailure("An empty key must reject the entire batch")
} catch {
    assert(error as? BatchStoreFailure == .invalidKey)
}
assert(atomicTextStore.text(for: "note") == "Before")
try atomicTextStore.replaceBatch(["note": "After", "other": "Added"])
assert(atomicTextStore.text(for: "note") == "After")
assert(atomicTextStore.text(for: "other") == "Added")
```

The name “replace batch” here means replacing the supplied keys while preserving unrelated keys. If the intended operation replaced the entire store, use a different contract and implementation. Small naming ambiguities can hide large differences in persistence behavior.

The example validates first and commits a complete replacement dictionary under serialized access. A database implementation needs a real transaction or equivalent isolation. Protocol inheritance itself supplies no atomicity.

## Refinement is a semantic promise

A `BatchTextReplacing` implementation must still behave as a valid reader and editor. Refinement cannot excuse violating the inherited contract.

For example, if the base promises that a successful write is immediately visible to a subsequent read on the same store, an eventually consistent remote backend needs an adapter or a different abstraction. Correct signatures do not erase that mismatch.

Similarly, a stronger capability should not add an undocumented precondition to an inherited method. It can add a new operation with its own documented conditions, but existing parent-typed consumers remain entitled to the original behavior.

Swift describes the syntactic rule in [Protocol Inheritance](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Protocol-Inheritance). Contract tests establish the semantic expectations that syntax cannot check.

## Inherited associated types can gain stronger constraints

```swift
protocol KeySource {
    associatedtype Key: Hashable
    var keys: [Key] { get }
}

protocol OrderedKeySource: KeySource where Key: Comparable {}

extension OrderedKeySource {
    func sortedKeys() -> [Key] { keys.sorted() }
}

struct NumberKeys: OrderedKeySource {
    let keys: [Int]
}

assert(NumberKeys(keys: [8, 2, 4]).sortedKeys() == [2, 4, 8])
```

The refinement inherits `Key` and requires it to support ordering. The helper can sort without imposing that requirement on every general key source.

This is useful when the refined capability has a stable meaning for several consumers. If only one algorithm needs comparable keys, a constrained extension or generic function may be sufficient without another named protocol.

A public refinement also inherits access-level obligations. Types exposed through public requirements need compatible visibility. Do not expose an infrastructure-only key type merely because it is convenient in the current module.

## Composition and inheritance express related but different choices

A one-off function can require `Reading & Logging` locally without introducing a new named protocol. A refining protocol is helpful when that combination is a reusable concept with additional semantics or operations.

```swift
protocol StoreIdentifying {
    var storeName: String { get }
}

func previewHeading<S: StoredTextReading & StoreIdentifying>(
    from store: S,
    key: String
) -> String {
    store.storeName + ": " + (store.text(for: key) ?? "Missing")
}

struct NamedTextSnapshot: StoredTextReading, StoreIdentifying {
    let storeName: String
    let values: [String: String]
    func text(for key: String) -> String? { values[key] }
}

assert(previewHeading(from: NamedTextSnapshot(storeName: "Preview", values: [:]), key: "note")
    == "Preview: Missing")
```

The generic constraint records what this consumer needs. There is no shared stored object created by composing the protocols, and no parent constructor runs for either capability.

Avoid a giant umbrella protocol that combines networking, navigation, persistence, and analytics solely to shorten an initializer. That hides independent dependencies behind one name while requiring every implementation to provide unrelated operations.

## Default helpers follow inherited requirements

A helper declared on a parent protocol remains available to refined conformers when its requirements are satisfied. Calls to parent requirements can use the conformer's witnesses.

However, a same-named extension-only helper on a refined protocol is not a class override. Selection still depends on the static constraints visible at the use site. If behavior must vary through the parent interface, declare the customization as a parent requirement.

The [default implementations article](/swift-protocol-default-implementations/) demonstrates this with executable concrete and existential calls. Adding another level of protocol inheritance does not turn extension-only methods into virtual hooks.

## Keep ownership out of an accidental hierarchy

If two capabilities need a cache, refinement does not decide whether they share one cache. Store or inject the collaborator explicitly in the concrete implementation.

The text snapshot owns value state. The memory store owns shared evolving state. Both can satisfy reading. A consumer that needs a stable snapshot should request or receive one explicitly rather than assuming every reader returns the same result forever.

This distinction becomes important during account switching. A long-lived reader can retain an old account-scoped store even after the application changes its current account reference. Protocol inheritance cannot revoke that retained capability; lifecycle belongs to the owner and its API.

## Test inherited behavior through parent-facing consumers

Run read and write contract tests against an editing store, then run batch tests against a batch-capable store. Verify missing keys, overwrites, rejected batches, and unchanged values after failure.

A test that calls only `replaceBatch` can miss a broken inherited `write` implementation. Substitutability is about all operations permitted by the relevant interface.

As an exercise, add deletion. Decide whether every editor must delete, or whether deletion is an independent capability required only by an administrative consumer. Keeping the hierarchy shallow and consumer-driven is usually easier to maintain than arranging every imaginable storage operation into one large protocol family.

## Worked distinction: a read-only view can remain live

A reader interface removes writing capability from a use site. It does not freeze the underlying store:

```swift
struct ReadOnlyTextView: StoredTextReading {
    let base: any StoredTextReading
    func text(for key: String) -> String? { base.text(for: key) }
}

let liveTextStore = MemoryTextStore()
liveTextStore.write("Before", for: "note")
let liveTextView = ReadOnlyTextView(base: liveTextStore)
let frozenTextView = TextSnapshot(values: ["note": "Before"])
liveTextStore.write("After", for: "note")
assert(liveTextView.text(for: "note") == "After")
assert(frozenTextView.text(for: "note") == "Before")
```

Both values satisfy reading. One forwards to shared evolving state, and the other owns a captured dictionary value. A consumer choosing between them is choosing temporal semantics, not simply an access modifier.

This matters for previews, audit records, and multi-step calculations. A summary built by repeatedly asking a live store for different keys can combine observations from different moments if the store changes between reads. A consistent snapshot operation can be a more appropriate capability for that use case.

The adapter also retains its base reader. If the base is an account-scoped class, the view can prolong that object's lifetime even though the exposed operations are read-only. Revoking access on sign-out needs an explicit owner or scope policy; narrowing a protocol does not invalidate existing references.

Test the distinction that the consumer needs. A live-view test should mutate the original store and observe the change. A snapshot test should establish the opposite. Calling both objects “read-only” without specifying freshness can let two incompatible expectations hide behind the same word.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
