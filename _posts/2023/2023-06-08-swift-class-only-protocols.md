---
layout: post
hidden: true
title: "Class-Only Protocols in Swift: AnyObject and Ownership"
date: "2023-06-08"
last_modified_at: "2023-06-08"
permalink: /swift-class-only-protocols/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "ARC", "Ownership"]
thumbnail: assets/img/article-placeholder.svg
---
Adding `AnyObject` to a protocol restricts its conformers to class instances. That restriction is useful when reference identity, weak relationships, or shared mutable state are part of the contract. It is unnecessary when an operation merely happens to be implemented by a class today.

A weak delegate is the familiar example, but class-only requirements also change generic mutation rules. Understanding both sides helps keep ownership decisions deliberate.

<!--more-->

## Define an event receiver with a non-owning relationship

```swift
protocol SelectionReceiving: AnyObject {
    func receiveSelection(_ name: String)
}

final class SelectionProducer {
    weak var receiver: (any SelectionReceiving)?

    func select(_ name: String) {
        receiver?.receiveSelection(name)
    }
}

final class SelectionOwner: SelectionReceiving {
    let producer: SelectionProducer
    private(set) var selected: [String] = []

    init(producer: SelectionProducer) {
        self.producer = producer
        producer.receiver = self
    }

    func receiveSelection(_ name: String) {
        selected.append(name)
    }
}

let selectionProducer = SelectionProducer()
var selectionOwner: SelectionOwner? = SelectionOwner(producer: selectionProducer)
selectionProducer.select("Protocols")
assert(selectionOwner?.selected == ["Protocols"])
selectionOwner = nil
assert(selectionProducer.receiver == nil)
selectionProducer.select("No receiver remains")
```

The owner strongly retains the producer. The producer's receiver link is weak, so it does not keep the owner alive. Releasing the last strong owner clears that weak reference automatically.

A struct receiver would not provide an independently weakly referenced object identity, so the class-only restriction reflects the actual relationship. See Swift's [Class-Only Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Class-Only-Protocols) and [Automatic Reference Counting](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/) for the underlying language rules.

The optional receiver means notification is optional. If correct operation required the receiver to persist a selection, silently skipping the callback would be inappropriate. A required service usually belongs in a strongly retained dependency under a different contract.

## Weak does not provide a lifetime

A newly created receiver assigned only to a weak property can disappear immediately. Some other owner must retain it for as long as callbacks are required. Tests should therefore keep a strong local receiver binding rather than assigning an unowned temporary and wondering why no events arrive.

Weak ownership also does not unregister an observer, cancel a task, or stop a producer. It prevents that one reference from prolonging a lifetime. External work still needs an explicit lifecycle when its cost or behavior matters.

The example's final `select` is harmless because notification is optional. A real upload producer may continue transferring bytes even after its UI receiver disappears. Its owner should decide whether that work belongs to the screen or to a longer-lived feature.

## A class constraint changes writable access

An unconstrained get/set requirement may mutate a value conformer, so generic code commonly needs `inout` access. A class-bound requirement can express mutation of a shared object through an unchanged reference:

```swift
protocol SharedProgress: AnyObject {
    var completed: Int { get set }
}

final class ProgressCounter: SharedProgress {
    var completed = 0
}

func advance(_ progress: any SharedProgress) {
    progress.completed += 1
}

let progressCounter = ProgressCounter()
advance(progressCounter)
advance(progressCounter)
assert(progressCounter.completed == 2)
```

The binding does not need to be replaced; the object changes. That does not make the operation atomic. `completed += 1` still performs a read-modify-write sequence, and simultaneous unsynchronized access is unsafe.

If the domain must reject certain increments or maintain several counters consistently, prefer an operation such as `recordCompletion()` over a public writable counter. Class-only access controls representation and ownership possibilities, not the quality of the state API.

## Identity can be meaningful without becoming equality

Two class-bound protocol values can refer to the same allocation. That can matter when removing a particular registered receiver or comparing the sender of a callback. It is different from comparing logical account identifiers.

```swift
let firstProgressReference: any SharedProgress = progressCounter
let secondProgressReference: any SharedProgress = progressCounter
let separateProgressReference: any SharedProgress = ProgressCounter()
assert(firstProgressReference === secondProgressReference)
assert(firstProgressReference !== separateProgressReference)
```

A second instance with the same numeric count is not the same object. If equality should mean “the same persisted progress record,” model a stable identifier explicitly instead of deriving it from reference identity.

`ObjectIdentifier` is useful for temporary instance tracking. It is not a persistent identifier across process lifetimes. Using a class-bound protocol does not change that distinction.

## Weak storage can support a narrow registry

When several weak recipients are needed, each stored slot can carry a weak existential reference:

```swift
struct WeakSelectionReceiver {
    weak var value: (any SelectionReceiving)?
}

final class SelectionRegistry {
    private var receivers: [WeakSelectionReceiver] = []

    var liveCount: Int { receivers.compactMap { $0.value }.count }

    func add(_ receiver: any SelectionReceiving) {
        receivers.removeAll { $0.value == nil }
        guard !receivers.contains(where: { $0.value === receiver }) else { return }
        receivers.append(WeakSelectionReceiver(value: receiver))
    }
}

let selectionRegistry = SelectionRegistry()
var registeredOwner: SelectionOwner? = SelectionOwner(producer: SelectionProducer())
selectionRegistry.add(registeredOwner!)
selectionRegistry.add(registeredOwner!)
assert(selectionRegistry.liveCount == 1)
registeredOwner = nil
assert(selectionRegistry.liveCount == 0)
```

This registry only demonstrates storage and identity-based deduplication. It does not yet define delivery ordering, mutation during delivery, cancellation tokens, or thread safety. The [Observer article](/swift-protocol-observer-pattern/) supplies a more complete event contract.

Notice that the wrapper is a struct but contains a weak reference. Its value representation is just the storage slot; it does not turn the referenced receiver into a copied value.

## Do not add AnyObject solely to make a test easier

A formatting protocol may support pure struct implementations even if the production formatter currently happens to be a final class. Restricting it to classes to use identity assertions in a mock makes the production abstraction narrower for a test convenience.

Instead, test the behavior the consumer relies on. A recording collaborator can be a class when shared observation is useful, while the protocol remains unconstrained if its ownership semantics permit that.

Likewise, `AnyObject` does not require Objective-C interoperability. An ordinary Swift protocol can be class-only without `@objc`. Add Objective-C requirements only when interoperability or a specific runtime feature is actually needed.

## A superclass constraint is a stronger choice

An API can require both a particular superclass and protocol conformance. That is useful at framework boundaries where the consumer genuinely needs the framework lifecycle and an additional capability.

It also excludes unrelated classes that could implement the protocol's methods. Keep that requirement near the boundary that needs it rather than adding it to a general domain contract used by previews and pure calculations.

For example, an application adapter can work with a framework view controller plus a loading capability, while the data loader protocol remains independent of view controllers. That keeps transport, state, and presentation lifetimes from becoming one inherited bundle.

## Specify isolation independently

A UI-facing receiver may need main-actor isolation on its contract and conforming types. A worker-facing registry might instead be actor-owned. `AnyObject` and `weak` do not select an actor or move callbacks onto the main thread.

When adopting asynchronous work, decide where an event is delivered and whether a callback may arrive after cancellation. A weak receiver can prevent retaining an owner while still permitting a stale callback to reach a newer feature state through another retained path.

Test lifetime, delivery, and isolation as separate properties. Releasing the receiver should clear the weak link. A valid selection should produce the expected event. An asynchronous implementation should deliver on its documented execution context.

## A practical ownership review

Draw the strong edges first: who owns the producer, who owns the receiver, and which callbacks capture either object? Then add weak edges where the referenced object should not be retained. Avoid choosing weak merely because two properties point at each other; sometimes one collaborator really is required and should be strongly owned.

As an exercise, replace the optional receiver with a required result processor and a separate optional UI delegate. Decide which owner keeps each alive and which operation persists the result. That separates an essential business effect from observation, which is often the more important design decision than the `AnyObject` syntax itself.

## Worked split: persist a selection even when nobody observes it

A required effect and optional observation should have different ownership contracts:

```swift
protocol SelectionSaving {
    func saveSelection(_ name: String) throws
}

enum SelectionSaveFailure: Error { case unavailable }

final class SavedSelections: SelectionSaving {
    private(set) var values: [String] = []
    var rejectsWrites = false

    func saveSelection(_ name: String) throws {
        guard !rejectsWrites else { throw SelectionSaveFailure.unavailable }
        values.append(name)
    }
}

struct SelectionWorkflow {
    let storage: any SelectionSaving
    weak var observer: (any SelectionReceiving)?

    func select(_ name: String) throws {
        try storage.saveSelection(name)
        observer?.receiveSelection(name)
    }
}

let savedSelections = SavedSelections()
let unobservedSelection = SelectionWorkflow(storage: savedSelections, observer: nil)
try unobservedSelection.select("Stored without a screen")
assert(savedSelections.values == ["Stored without a screen"])
let observingOwner = SelectionOwner(producer: SelectionProducer())
let observedSelection = SelectionWorkflow(storage: savedSelections, observer: observingOwner)
try observedSelection.select("Visible")
assert(observingOwner.selected == ["Visible"])
savedSelections.rejectsWrites = true
do {
    try observedSelection.select("Rejected")
    assertionFailure("A rejected write must fail")
} catch SelectionSaveFailure.unavailable {}
assert(observingOwner.selected == ["Visible"])
assert(savedSelections.values == ["Stored without a screen", "Visible"])
```

Storage is retained as a required collaborator. The observer is weak and optional. Notification happens only after persistence reports success, and removing the observer does not change whether the required write occurs.

The storage protocol is not class-only merely because this recorder is a class. Its operation does not require weak storage or instance identity at the consumer boundary. A different conformer can use another appropriate representation while preserving the promised effect.

This is also a sequencing contract, not a distributed transaction. If storage completes and notification then causes another operation to fail elsewhere, the saved selection remains saved. Required durable event delivery would need a stronger mechanism than this optional synchronous callback.

The ownership graph now explains the modifiers: strong for an essential service, weak for a non-owning observer. Choosing `AnyObject` and weak references follows that graph rather than a blanket rule that every injected dependency should be weak.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
