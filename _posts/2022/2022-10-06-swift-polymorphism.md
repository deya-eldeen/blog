---
layout: post
hidden: true
title: "Polymorphism in Swift: One Interface, Different Behavior"
date: "2022-10-06"
last_modified_at: "2022-10-06"
permalink: /swift-polymorphism/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Polymorphism", "Protocols"]
thumbnail: assets/img/article-placeholder.svg
---
A notification can be written to a console, recorded in a test, or sent to another service. Code that requests a notification should not have to switch on every concrete notifier type. Polymorphism lets the same operation select behavior supplied by different implementations.

Swift supports this through class hierarchies, protocols, and generic code, with different rules for each.

<!--more-->

## Subclass polymorphism

```swift
class MessageFormatter {
    func format(_ message: String) -> String {
        message
    }
}

final class WarningFormatter: MessageFormatter {
    override func format(_ message: String) -> String {
        "Warning: " + message
    }
}

let formatter: MessageFormatter = WarningFormatter()
assert(formatter.format("Low battery") == "Warning: Low battery")
```

The reference is statically typed as `MessageFormatter`, but its instance is a `WarningFormatter`. Calling an overridable method uses the appropriate override. That behavior is the reason you can work through a superclass interface without losing specialization.

A good override still respects the parent's behavioral promise. If callers expect formatting to be safe for any string, a subclass that crashes on an empty string breaks that expectation even though its signature matches.

## Protocol polymorphism

```swift
protocol MessageSending {
    func send(_ message: String) -> String
}

struct ConsoleSender: MessageSending {
    func send(_ message: String) -> String {
        "Console: " + message
    }
}

struct PreviewSender: MessageSending {
    func send(_ message: String) -> String {
        "Preview: " + message
    }
}

let senders: [any MessageSending] = [ConsoleSender(), PreviewSender()]
let results = senders.map { $0.send("Hello") }
assert(results == ["Console: Hello", "Preview: Hello"])
```

An existential such as `any MessageSending` can hold a value of any conforming type. The array can therefore contain different implementations. Structs can participate without inheriting from a common class.

The operation is a protocol requirement, which matters. A method introduced only by a protocol extension is not an overridable requirement. Calling such an extension-only method through a generic constraint or existential uses the extension's implementation rather than selecting a same-named member from a conformer.

For the language rules, see [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/); for implementation details, see [Static vs. Dynamic Dispatch](/swift-static-vs-dynamic-dispatch/).

## Generic code expresses a different relationship

```swift
func announcement<S: MessageSending>(using sender: S) -> String {
    sender.send("The build is ready")
}

assert(announcement(using: PreviewSender()) == "Preview: The build is ready")
```

Here the function works with a particular conforming type `S` for each invocation. This is useful when relationships between types must be preserved, or when the implementation benefits from knowing the concrete type. The compiler may specialize generic code; that optimization is not a guarantee attached to every generic call.

Use an existential when you need to store or pass an interchangeable value behind one interface. Use a generic constraint when retaining the type relationship helps the API. Neither spelling is a universal performance rule.

## Avoid replacing every branch

A switch over a closed enum can be clearer than creating one class per case. If your model has exactly three known states and every operation must handle all three, exhaustiveness checking is useful.

Polymorphism pays off when implementations vary independently and a consumer can rely on one stable contract. The goal is to put variation behind an appropriate boundary, not to eliminate every `switch` in the program.

## Predict a dispatch surprise before running it

A protocol extension can provide a default for a requirement or add a new method that is not a requirement. Those declarations look similar but create different customization contracts.

```swift
protocol DeliveryChannel {
    func deliver() -> String
}

extension DeliveryChannel {
    func deliver() -> String { "Default delivery" }
    func debugLabel() -> String { "Extension label" }
}

struct PushChannel: DeliveryChannel {
    func deliver() -> String { "Push delivery" }
    func debugLabel() -> String { "Push label" }
}

let pushChannel = PushChannel()
let erasedChannel: any DeliveryChannel = pushChannel
assert(pushChannel.debugLabel() == "Push label")
assert(erasedChannel.debugLabel() == "Extension label")
assert(erasedChannel.deliver() == "Push delivery")
```

`deliver` is a protocol requirement. The conformance supplies the implementation that a protocol-based call uses. `debugLabel` exists only in the extension, so a call resolved through the protocol abstraction selects that extension operation. A concrete call can instead find the concrete member with the same name.

If logging must vary with the conformer, declare it as a requirement. If logging is intentionally one shared helper, keep it extension-only and avoid giving a conformer a same-named method that suggests overriding. A compiler accepting both declarations does not make the API easy to understand.

## A subclass does not rebuild an inherited conformance

An even subtler case appears when a superclass adopts a protocol by using an extension default. Its subclass can introduce a same-named method, yet a call through the inherited conformance can still use the default.

```swift
protocol StatusReporting {
    func status() -> String
}

extension StatusReporting {
    func status() -> String { "Protocol default" }
}

class BaseReporter: StatusReporting {}

final class SpecializedReporter: BaseReporter {
    func status() -> String { "Specialized member" }
}

let specializedReporter = SpecializedReporter()
let reportingReference: any StatusReporting = specializedReporter
assert(specializedReporter.status() == "Specialized member")
assert(reportingReference.status() == "Protocol default")
```

The superclass's conformance already chose the default. The subclass member is not an override of a superclass method, because no such method was declared on the superclass.

If subclass customization is intended, give the superclass a real implementation of the requirement, then override that method:

```swift
class OverridableReporter: StatusReporting {
    func status() -> String { "Base member" }
}

final class CustomizedReporter: OverridableReporter {
    override func status() -> String { "Customized member" }
}

let customized: any StatusReporting = CustomizedReporter()
assert(customized.status() == "Customized member")
```

This distinction matters when refactoring a base class to “remove boilerplate” by moving implementations into a protocol extension. The source becomes shorter while the dispatch contract may change. Include tests through the actual abstraction used by consumers.

## Generics preserve relationships that an existential may hide

Suppose a source produces values of an associated type. A generic function can express that its result has exactly that type:

```swift
protocol ItemSource {
    associatedtype Item
    func firstItem() -> Item
}

struct NumberSource: ItemSource {
    func firstItem() -> Int { 42 }
}

func first<S: ItemSource>(from source: S) -> S.Item {
    source.firstItem()
}

let firstNumber: Int = first(from: NumberSource())
assert(firstNumber == 42)
```

The relationship `S.Item` remains visible to the caller and compiler. Existentials are useful for hiding which concrete type is stored, but hiding a type can also hide relationships a later operation needs. Modern Swift supports more operations on existentials than older language versions; that does not erase the conceptual difference between retaining a type relationship and erasing it.

Choose an interface based on what the consumer must express. Do not introduce a hand-written type eraser simply because a protocol has an associated type, and do not assume an existential is always interchangeable with a generic parameter in every API.

## Compare the mechanisms explicitly

| Mechanism | What can vary? | What a caller relies on |
|---|---|---|
| Overridable class method | Implementation in a subclass | Superclass behavior contract |
| Protocol requirement | Implementation chosen by conformance | Requirement semantics |
| Extension-only method | Helper selected from available static context | Extension's operation |
| Generic function | Concrete type satisfying constraints | Type relationships and requirements |
| Enum switch | Behavior for a closed set of cases | Exhaustive case handling |

These are API semantics, not a promise that one runtime instruction is always used. Optimizers can devirtualize calls or specialize generics when sufficient information is available. The observable result must still respect the language contract. Measure performance separately from choosing the right abstraction.

## Test replacement behavior, not only output examples

For a sender, write a small contract: one request produces one accepted message or an explicit failure; successful results preserve the message content; implementations do not silently introduce unrelated side effects. Then run representative checks against each implementation.

Also test through the storage shape consumers actually use: a superclass variable, an existential property, or a generic function. Testing only direct calls on the concrete type can completely miss the dispatch differences above.

As an exercise, add `debugLabel` to `DeliveryChannel`'s requirements and predict which assertions change. Then explain why adding a superclass implementation fixes the inherited-conformance example. If you can predict both, you understand the customization boundary more deeply than “Swift supports polymorphism.”

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
