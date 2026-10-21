---
layout: post
hidden: true
title: "Initializers and Deinitializers: The Lifetime of a Swift Object"
date: "2022-11-03"
last_modified_at: "2022-11-03"
permalink: /swift-initializers-and-deinitializers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Initialization", "ARC"]
thumbnail: assets/img/article-placeholder.svg
---
An initializer establishes the state an object needs to be usable. A deinitializer performs cleanup when that object's lifetime ends. They are related, but they do not form a reliable “screen opened, screen closed” pair: an object can outlive the feature that created it.

Understanding that distinction helps avoid both invalid initial state and cleanup that happens too late.

<!--more-->

## Establish a valid instance

```swift
enum SessionError: Error {
    case emptyName
}

final class EditingSession {
    let documentName: String
    private(set) var isClosed = false

    init(documentName: String) throws {
        guard !documentName.isEmpty else {
            throw SessionError.emptyName
        }
        self.documentName = documentName
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        print("Closed:", documentName)
    }

    deinit {
        print("Released:", documentName)
    }
}

func editDocument() throws {
    let session = try EditingSession(documentName: "Notes")
    defer { session.close() }
    assert(!session.isClosed)
    // Work that requires the session would go here.
}

try editDocument()
```

The initializer rejects an unusable name. `close` represents a deliberate application event and is safe to call more than once. `deinit` reports memory lifetime; it does not decide when editing should stop.

Swift requires stored properties to be initialized before an instance is ready for use. The language guide's [Initialization chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/initialization/) describes that guarantee and the additional rules for class hierarchies.

## Understand what ends a lifetime

A class instance stays alive while strong ownership requires it. Assigning one local variable to `nil` removes one reference, not every reference. A stored closure, collection, or another object can still retain the instance.

```swift
var firstOwner: EditingSession? = try EditingSession(documentName: "Draft")
var secondOwner = firstOwner
firstOwner = nil
assert(secondOwner != nil)
secondOwner?.close()
secondOwner = nil
```

This simple example releases both owners explicitly. In optimized code, do not rely on a print happening at a particular lexical brace to coordinate behavior. If exact resource lifetime matters, design an explicit operation or use a scoped resource API.

## Use deinit as a cleanup boundary

Class deinitializers take no arguments and cannot be called directly. Subclass cleanup runs before superclass cleanup; Swift invokes the superclass deinitializer automatically. These rules are covered in [Deinitialization](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/deinitialization/).

A deinitializer can release a resource that the object still owns. It should not be the only mechanism for an action that must happen at a user-visible moment, such as committing a transaction, saving edits, or stopping an expensive task when a screen disappears.

If an object participates in a strong reference cycle, ARC cannot reclaim it simply because its original local variable is gone. The deinitializer will not break a cycle that prevents the deinitializer from running. Fix the ownership relationship; see [ARC](/swift-automatic-reference-counting/).

## Choose failure semantics deliberately

Use `init?` when absence adequately describes failure, such as a tiny parser that either recognizes a value or does not. Use a throwing initializer when the caller benefits from a reason. Avoid creating a half-valid object with flags that every method must remember to inspect.

Also avoid starting work that assumes subclass initialization is complete from a base initializer. Keep construction focused on establishing state, and start externally visible work after construction when the API requires it.

A useful lifecycle design makes creation, explicit completion, and memory cleanup separate, understandable events.

## Choose between failable and throwing construction

A failed initializer should leave no usable half-constructed instance for callers to repair. Which failure mechanism to use depends on what the consumer must know.

```swift
struct DocumentKey: Equatable {
    let rawValue: String

    init?(_ candidate: String) {
        guard !candidate.isEmpty, !candidate.contains("/") else {
            return nil
        }
        rawValue = candidate
    }
}

enum DraftCreationFailure: Error, Equatable {
    case invalidKey
    case emptyContents
}

final class ValidatedDraft {
    let key: DocumentKey
    let contents: String

    init(key: String, contents: String) throws {
        guard let parsedKey = DocumentKey(key) else {
            throw DraftCreationFailure.invalidKey
        }
        guard !contents.isEmpty else {
            throw DraftCreationFailure.emptyContents
        }
        self.key = parsedKey
        self.contents = contents
    }
}

assert(DocumentKey("folder/file") == nil)
let validatedDraft = try ValidatedDraft(key: "notes", contents: "First paragraph")
assert(validatedDraft.key.rawValue == "notes")
```

The small parser returns absence because its consumer only needs to know whether a key is valid. The draft initializer distinguishes failures because a UI may highlight a different field for each one. A throwing initializer can also forward an underlying failure, but decide whether callers should depend on that lower-level error vocabulary.

Avoid performing irreversible effects during validation. If construction opens a resource and then a later check fails, the code needs an explicit cleanup path. Validating cheap input before acquiring resources makes that path easier to reason about.

## Observe lifetime without assuming a closing brace is a signal

A weak reference lets a test observe whether an object still exists without keeping it alive. It is more informative than inferring lifetime from the order of unrelated print statements.

```swift
final class LifetimeProbe {
    let name: String

    init(name: String) {
        self.name = name
    }
}

weak var observedProbe: LifetimeProbe?
var retainedProbe: LifetimeProbe?

do {
    let temporaryProbe = LifetimeProbe(name: "draft")
    observedProbe = temporaryProbe
    retainedProbe = temporaryProbe
}

assert(observedProbe != nil)
retainedProbe = nil
assert(observedProbe == nil)
```

The object survives the inner scope because `retainedProbe` still owns it. After that explicit owner is cleared, the weak reference observes its release in this controlled example. In real code, hidden owners can include asynchronous tasks, callback registrations, and stored closures.

If an operation must keep an object alive through a particular call, `withExtendedLifetime` can express that need. It does not force release immediately afterward and is not a substitute for an explicit `close` operation. See Apple's [`withExtendedLifetime` documentation](https://developer.apple.com/documentation/swift/withextendedlifetime(_:_:)).

## A closure can keep its owner alive

An object can retain a closure that captures the same object. Neither a local variable going away nor a perfectly written deinitializer breaks that ownership cycle.

```swift
final class SessionCallbacks {
    var onRefresh: (() -> String)?
    let label: String

    init(label: String) {
        self.label = label
        onRefresh = { [weak self] in
            self?.label ?? "Session ended"
        }
    }
}

var callbackOwner: SessionCallbacks? = SessionCallbacks(label: "Editing")
let survivingCallback = callbackOwner!.onRefresh!
assert(survivingCallback() == "Editing")
callbackOwner = nil
assert(survivingCallback() == "Session ended")
```

The closure can outlive the object because its capture does not own the object. That is a deliberate semantic choice: after the session ends, it returns a fallback. If a callback must complete with a live owner, a strong capture may be appropriate instead, provided something else eventually releases the callback.

Do not add `[weak self]` mechanically. Ask whether the callback should keep work alive, whether losing the owner should cancel it, and who unregisters the callback. The ownership relationship, not the spelling, determines whether cleanup can happen.

## Construction and activation are separate events

Publishing `self` from an initializer can expose an instance before the surrounding system is ready to use it. Registering as an observer, starting a task, or invoking an overridable method can all call back into code earlier than expected.

A useful design is a small initializer that establishes valid stored state, followed by an explicit `start` or registration operation. The caller can finish connecting collaborators before activation. If the type uses this lifecycle, represent it clearly and reject duplicate starts rather than relying on undocumented call order.

Not every class needs two-phase application setup. Many values and simple objects should be fully ready as soon as construction returns. Separate activation when it makes external effects and ownership clearer, not as a default ceremony for every type.

## Do not turn deinit into a business transaction

Saving a document in `deinit` makes correctness depend on when memory ownership happens to end. The process can terminate before expected cleanup, another object can retain the document indefinitely, and the cleanup cannot conveniently report an asynchronous save failure to the screen that is already gone.

Provide explicit operations for save, cancel, commit, and close. Define whether they are idempotent and what callers should do on failure. Use `deinit` for appropriate final cleanup of resources still owned by the instance, within the language and isolation rules of the application.

## Exercise the lifecycle as a sequence

Test invalid construction, successful construction, explicit close twice, use after close, and an owner surviving its original scope. If the type registers a callback, also test that registration is removed or does not retain an unwanted cycle.

The expected result for “use after close” must come from the contract: it may throw, return no result, or be forbidden by a programmer precondition. Leaving it unspecified produces APIs that look valid in one isolated call and fail when used across a real screen lifecycle.

## Case study: observation as an explicitly owned resource

An observer registration has a lifecycle even if it does not own a file handle or database connection. Registering adds work that another object may invoke later; cancellation removes that work. A token can make ownership of the registration explicit.

The token below cancels at most once. It also performs final cleanup if its owner releases it without calling `cancel`, while application code remains free to cancel earlier.

```swift
final class ObservationLease {
    private var cancellation: (() -> Void)?

    init(cancellation: @escaping () -> Void) {
        self.cancellation = cancellation
    }

    func cancel() {
        let action = cancellation
        cancellation = nil
        action?()
    }

    deinit { cancel() }
}

final class ChangeRegistry {
    private var nextID = 0
    private var callbacks: [Int: () -> Void] = [:]

    var count: Int { callbacks.count }

    func observe(_ callback: @escaping () -> Void) -> ObservationLease {
        nextID += 1
        let id = nextID
        callbacks[id] = callback
        return ObservationLease { [weak self] in
            self?.callbacks.removeValue(forKey: id)
        }
    }

    func emit() {
        let currentCallbacks = Array(callbacks.values)
        currentCallbacks.forEach { $0() }
    }
}

final class ChangeConsumer {
    private let registry: ChangeRegistry
    private var lease: ObservationLease?
    private(set) var received = 0

    init(registry: ChangeRegistry) { self.registry = registry }

    func start() {
        guard lease == nil else { return }
        lease = registry.observe { [weak self] in self?.received += 1 }
    }

    func stop() {
        lease?.cancel()
        lease = nil
    }
}

let changes = ChangeRegistry()
var consumer: ChangeConsumer? = ChangeConsumer(registry: changes)
consumer?.start()
consumer?.start()
assert(changes.count == 1)
changes.emit()
assert(consumer?.received == 1)
consumer?.stop()
assert(changes.count == 0)
consumer?.start()
assert(changes.count == 1)
consumer = nil
assert(changes.count == 0)
```

The consumer strongly owns its lease and registry. The registry's callback weakly references the consumer. The lease's cancellation closure weakly references the registry. This graph lets releasing the consumer release the lease, whose cleanup removes the callback.

Calling `start` twice does not register twice. Calling `stop` releases the registration at an application-defined moment. Releasing the consumer provides a final cleanup path if explicit stopping was omitted.

### Clear ownership before invoking cleanup code

`cancel` stores the action locally and clears the stored closure before invoking it. If cancellation reenters the token, there is no second action left to invoke. The token is already in its cancelled state before external code runs.

That ordering is a small example of making a lifecycle operation safe under reentrancy. It does not make the token thread-safe. Concurrent calls to `cancel` would require synchronization or isolation, and a production observer system needs an explicit execution contract.

A deinitializer should also avoid work that depends on a screen still existing or on an asynchronous UI interaction. Here cleanup only removes a registration from a synchronously owned registry. More complicated resources may require an explicit asynchronous close operation before release.

### Cancellation cannot retract an event already captured for delivery

The registry copies its current callbacks before emitting. That avoids mutating a dictionary while iterating it, but it means a callback removed during this emission may still exist in the delivery snapshot.

The contract therefore distinguishes removal from future emissions and suppression of already captured work. A UI can use a request generation or active-state check to ignore a late event. A stronger registry might mark individual registrations inactive and check that state before delivery.

Do not promise “no callback after stop returns” unless the implementation and execution model really provide that guarantee. A weak reference prevents retaining an owner; it does not establish event ordering or cancellation acknowledgment.

### Construction should not lose the lease

If the result of `observe` is discarded immediately, its lease is released and the callback is removed. That can look like a registration that never worked. Keep the lease in the object whose lifetime should govern observation.

Conversely, storing the lease in a global collection can keep observation active long after a screen closes. The token makes ownership visible, but the application still has to choose the correct owner.

This is a useful way to read unfamiliar APIs: ask what object or value represents the resource, whether creating it starts work, and which owner retains the thing that stops it.

### Test lifetime through public effects

The example checks registration count and received events rather than relying on deinitialization print statements. Add a test that calls `cancel` twice and verifies the cleanup action ran only once. Also keep a copy of a callback outside the registry and verify its documented behavior after the consumer disappears.

For an asynchronous implementation, test cancellation racing with completion and shutdown while work is pending. Those tests need a controllable scheduler or service, not long sleeps that merely hope a race occurs.

### Keep initialization failure separate from resource shutdown

A throwing initializer establishes whether an instance can exist. An observation lease controls work performed after a valid instance exists. Combining both into an initializer that registers, starts tasks, and can later throw produces a much harder cleanup story.

Validate cheap configuration first, establish stored state, then activate externally visible work at a deliberate boundary. Use scoped cleanup for resources acquired during construction if failure remains possible. The lifecycle becomes easier to reason about because “not constructed,” “active,” “stopped,” and “released” have distinct meanings.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
