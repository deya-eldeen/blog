---
layout: post
hidden: true
title: "OOP vs. POP in Swift: Two Ways to Share Behavior"
date: "2023-03-09"
last_modified_at: "2023-03-09"
permalink: /swift-oop-vs-pop/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "OOP", "Design"]
thumbnail: assets/img/article-placeholder.svg
---
Object-oriented and protocol-oriented programming overlap in Swift. Both can hide implementation details, protect state, and let consumers work with interchangeable behavior. The useful comparison is how they represent shared implementation, ownership, and the relationships between types.

We will build the same small notification feature in two styles, then identify which changes each design makes easier. The examples use synchronous strings so the abstraction decisions remain visible without a networking framework.

<!--more-->

## Express the behavior before selecting the mechanism

The feature sends a message and returns a receipt describing the chosen channel. For this teaching model, sending is a local calculation. A real delivery service would need explicit asynchronous and error semantics.

The class-based version shares construction and formatting through a superclass:

```swift
class NoticeChannel {
    let prefix: String

    init(prefix: String) { self.prefix = prefix }

    func route() -> String { "local" }

    final func send(_ message: String) -> String {
        prefix + ": " + route() + ": " + message
    }
}

final class InboxChannel: NoticeChannel {
    override func route() -> String { "inbox" }
}

let objectChannel: NoticeChannel = InboxChannel(prefix: "Notice")
assert(objectChannel.send("Ready") == "Notice: inbox: Ready")
```

The superclass stores the prefix and controls the send sequence. A subclass varies one hook. That can be a compact design when every implementation belongs to this family and the hook's lifecycle is stable.

Its cost is an inheritance contract. Subclasses depend on construction, stored-state assumptions, and how the inherited workflow invokes `route`. A future change that calls the hook twice could affect an override with side effects.

## Express the capability separately from the machinery

The protocol-based version declares the operation a consumer needs, while concrete types choose their own representation:

```swift
protocol NoticeSending {
    func send(_ message: String) -> String
}

struct ValueInboxChannel: NoticeSending {
    let prefix: String

    func send(_ message: String) -> String {
        prefix + ": inbox: " + message
    }
}

struct NoticePreview: NoticeSending {
    func send(_ message: String) -> String {
        "Preview: " + message
    }
}

struct NoticeFeature {
    let channel: any NoticeSending

    func announceReady() -> String { channel.send("Ready") }
}

assert(NoticeFeature(channel: ValueInboxChannel(prefix: "Notice"))
    .announceReady() == "Notice: inbox: Ready")
assert(NoticeFeature(channel: NoticePreview())
    .announceReady() == "Preview: Ready")
```

The preview does not inherit a prefix property it does not need. A struct, enum, or class can satisfy this capability. The feature holds an existential because its chosen implementation is intentionally hidden and can differ between constructed features.

A generic `NoticeFeature<Channel: NoticeSending>` would retain the concrete relationship in the feature's type. That is another independent choice. Using a protocol does not require every consumer to erase the implementation type into `any`.

## Share an algorithm through requirements

If all channels need a common preview operation, a protocol extension can build it from the required send operation:

```swift
extension NoticeSending {
    func preview(_ message: String, limit: Int) -> String {
        precondition(limit >= 0)
        return String(send(message).prefix(limit))
    }
}

let noticeSender: any NoticeSending = ValueInboxChannel(prefix: "Notice")
assert(noticeSender.preview("Ready", limit: 6) == "Notice")
```

This helper is appropriate only because `send` in this example is explicitly a calculation. If a production `send` actually delivers a notification, calling it to generate a preview would accidentally perform an effect. Reuse follows semantic contracts, not convenient method names.

Also notice that `preview` is extension-only. A concrete conformer can declare a same-named method, but that does not create an override point for calls through the protocol. If preview behavior must vary polymorphically, make it a requirement. See [Default Implementations](/swift-protocol-default-implementations/) for a dispatch example that demonstrates this distinction.

## Compose effects without adding a superclass

Suppose the feature must record which announcements were generated. Put that evolving history in an explicit reference owner and wrap a sender:

```swift
final class NoticeHistory {
    private(set) var receipts: [String] = []
    func record(_ receipt: String) { receipts.append(receipt) }
}

struct RecordedNoticeSender<S: NoticeSending>: NoticeSending {
    let wrapped: S
    let history: NoticeHistory

    func send(_ message: String) -> String {
        let receipt = wrapped.send(message)
        history.record(receipt)
        return receipt
    }
}

let noticeHistory = NoticeHistory()
let recordedNotice = RecordedNoticeSender(
    wrapped: ValueInboxChannel(prefix: "Notice"), history: noticeHistory
)
assert(recordedNotice.send("Ready") == "Notice: inbox: Ready")
assert(noticeHistory.receipts == ["Notice: inbox: Ready"])
```

The wrapper is a struct but has an observable effect through its shared class collaborator. Copies of the wrapper still share that history object. Protocol-oriented syntax does not make the computation pure or confer complete value semantics automatically.

The history owner also needs isolation if used concurrently. The example assumes serialized calls. A `Sendable` annotation or a final class modifier cannot replace the synchronization required by mutable shared state.

## Compare actual forms of change

| Requirement | Class-family approach | Capability-and-composition approach |
|---|---|---|
| Add one route within the same lifecycle | Add a subclass override | Add a conforming implementation |
| Reuse stored mutable state | Inherit the state and its rules | Inject a state owner explicitly |
| Let an unrelated value type participate | Requires an adapter or redesign | Add a conformance |
| Combine recording and different routes | Add hooks or wrapper behavior | Assemble a recording wrapper with a sender |
| Integrate a framework lifecycle | Often use its required superclass | Conform to domain protocols alongside it |

Neither column removes the need to define results, errors, ownership, and timing. A protocol with an empty default persistence implementation is less truthful than a well-designed concrete class. A class with a narrow, tested API can be easier to use than a dozen speculative protocols.

## Keep domain values concrete when they have no variation

A notification message can be a plain struct. It does not need a `NoticeMessageProtocol` simply because the sender is abstracted. The message's fields may already form a useful immutable boundary.

Likewise, a pure formatter can remain a concrete type or free function until there is a reason to substitute its policy. Creating a protocol for every type increases navigation and conformance work without necessarily reducing coupling.

Ask which consumer requires the abstraction. Here `NoticeFeature` needs a replaceable sender so previews and production construction can differ. It does not need arbitrary access to a service container, a superclass's internal cache, or a generic environment object containing every application dependency.

## Mixing the two styles is often the practical design

A final coordinator can own tasks, cancellation, and lifecycle while depending on a protocol for data loading. A value reducer can calculate state transitions. A framework view controller can remain a subclass and implement a small delegate protocol.

These combinations are ordinary Swift. The language guide documents both [Classes and Structures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/classesandstructures/) and [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/); choosing one mechanism for a boundary does not prohibit another mechanism elsewhere.

The important boundary is whether one type extends another implementation or supplies a capability to a consumer. Those relationships can coexist in the same object graph.

## Migration should preserve effect boundaries

When replacing a base class with a protocol and helper, record what the old public operation does. How many times does it read configuration? When does it report success? What happens if storage fails? Which state is shared between instances?

Move one varying decision at a time. Tests should establish the output and meaningful effects through the consumer interface. A refactor that preserves strings while changing one request into ten requests is not behaviorally neutral.

Do not benchmark abstract mechanisms with a debug-only toy loop and declare an architectural winner. Specialization, module boundaries, allocation, and the real workload all affect runtime cost. The [performance article](/swift-protocol-performance/) shows how to compare concrete, generic, and existential boundaries without assuming one result in advance.

## A small design experiment

Extend the notification example with a channel selected at runtime. First use an enum with two fixed cases; then use an existential property with two conformers. Compare what a caller must change to add another channel.

The enum gives exhaustive handling for a closed set. The protocol permits new implementations without editing that enum, but moves behavioral guarantees into the contract and its tests. Both can be good designs. Explain which extension scenario your application actually needs before choosing the more open boundary.

That is the practical distinction between OOP and POP: different tools for expressing specific relationships, judged by the next real change and the behavior consumers can rely on.

## Worked alternative: keep a closed channel choice as an enum

If the application owns exactly two channel modes, an enum can combine exhaustive configuration with the existing sending capability:

```swift
enum ClosedNoticeChannel: NoticeSending {
    case inbox(prefix: String)
    case preview

    func send(_ message: String) -> String {
        switch self {
        case let .inbox(prefix):
            return ValueInboxChannel(prefix: prefix).send(message)
        case .preview:
            return NoticePreview().send(message)
        }
    }
}

let closedNoticeChannels: [ClosedNoticeChannel] = [.inbox(prefix: "Notice"), .preview]
assert(closedNoticeChannels.map { $0.send("Ready") }
    == ["Notice: inbox: Ready", "Preview: Ready"])
```

The enum delegates the calculations to existing implementations rather than duplicating their formatting. It also conforms to `NoticeSending`, so a consumer requiring that capability can still receive the closed representation.

This demonstrates that closed choices and protocol abstraction are not mutually exclusive. The enum describes the variants this application supports; the protocol describes the operation a consumer invokes. Another module can use a different conformer without requiring this enum to enumerate that module's implementation.

Adding a third case changes exhaustive switches in code that intentionally inspects the variants. Adding a third independent conformer changes assembly for consumers that use the open capability. The right cost depends on whether product rules should review every variant centrally or allow implementations to evolve independently.

Do not store a string such as `"inbox"` and scatter conditionals across the feature merely to avoid both an enum and a protocol. A validated enum localizes the closed choice, while a capability can localize behavior. Both are stronger than hiding an unvalidated mode string in an object that callers must interpret themselves.

As the feature grows, keep the message value, delivery lifetime, and UI rendering separate from this choice. The enum does not make delivery transactional, and the protocol does not decide who owns an active operation. Those remain explicit responsibilities in either style.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
