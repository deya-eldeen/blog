---
layout: post
hidden: true
title: "Default Implementations in Swift Protocol Extensions"
date: "2023-07-13"
last_modified_at: "2023-07-13"
permalink: /swift-protocol-default-implementations/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Extensions", "Dispatch"]
thumbnail: assets/img/article-placeholder.svg
---
A default implementation lets conforming types share behavior without sharing a superclass. Its usefulness depends on a precise distinction: implementing a protocol requirement is different from adding a method that exists only in an extension.

That distinction affects calls through existential values, generic functions, and inherited class conformances. We will make the dispatch observable with small assertions, then use a default algorithm that has a meaningful contract rather than an empty fallback.

<!--more-->

## Separate a required step from a shared algorithm

```swift
protocol ReceiptText {
    var heading: String { get }
    func line(for amount: Int) -> String
}

extension ReceiptText {
    func line(for amount: Int) -> String {
        heading + ": " + String(amount)
    }

    func document(amounts: [Int]) -> String {
        amounts.map { line(for: $0) }.joined(separator: "\n")
    }
}

struct PlainReceipt: ReceiptText {
    let heading: String
}

struct BracketedReceipt: ReceiptText {
    let heading: String
    func line(for amount: Int) -> String { "[\(heading): \(amount)]" }
}

let plainReceipt: any ReceiptText = PlainReceipt(heading: "Total")
let bracketedReceipt: any ReceiptText = BracketedReceipt(heading: "Total")
assert(plainReceipt.document(amounts: [2, 4]) == "Total: 2\nTotal: 4")
assert(bracketedReceipt.document(amounts: [2, 4]) == "[Total: 2]\n[Total: 4]")
```

`line` is a requirement with a valid default. The plain conformer uses it; the bracketed conformer supplies another witness. The shared `document` algorithm calls that requirement, preserving customization through the protocol interface.

`document` is deliberately not a requirement. It defines one algorithm: preserve amount order and join lines with newlines. If whole-document behavior needs to vary polymorphically, the protocol must say so.

The language guide describes [Protocol Extensions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Protocol-Extensions). The central design question is which steps are customization points and which helpers are shared exactly as written.

## Extension-only methods are not virtual hooks

```swift
protocol BadgeProviding {
    var name: String { get }
}

extension BadgeProviding {
    func badge() -> String { "Default: " + name }
}

struct SpecialBadge: BadgeProviding {
    let name: String
    func badge() -> String { "Special: " + name }
}

let concreteBadge = SpecialBadge(name: "Swift")
let abstractBadge: any BadgeProviding = concreteBadge
assert(concreteBadge.badge() == "Special: Swift")
assert(abstractBadge.badge() == "Default: Swift")
```

Both methods have the same spelling, but the protocol has no `badge` requirement. A call through the protocol interface uses the extension helper, not a dynamically selected custom witness.

This is not a runtime failure to discover the concrete type. It follows from the operation the static interface makes available. Fix the contract if customization is intended: declare `badge` as a requirement and keep the extension implementation as its default.

Do not sprinkle casts into consumers to recover concrete methods. That moves implementation knowledge into every use site and defeats the intended abstraction.

## Inherited class conformances have a second trap

A superclass can obtain a requirement witness from an extension default. A subclass declaring a same-named method does not automatically replace that inherited conformance witness:

```swift
protocol DocumentLabeling {
    func label() -> String
}

extension DocumentLabeling {
    func label() -> String { "Default label" }
}

class DefaultLabelOwner: DocumentLabeling {}

final class SpecialLabelOwner: DefaultLabelOwner {
    func label() -> String { "Special label" }
}

let specialLabelOwner = SpecialLabelOwner()
let inheritedLabelInterface: any DocumentLabeling = specialLabelOwner
assert(specialLabelOwner.label() == "Special label")
assert(inheritedLabelInterface.label() == "Default label")
```

The base conformance selected the extension default. The subclass has not overridden a base-class method because the base did not declare that method as an overridable member.

When subclass customization is required, let the base class provide the actual method and have the subclass override it:

```swift
class OverridableLabelOwner: DocumentLabeling {
    func label() -> String { "Base label" }
}

final class CustomizedLabelOwner: OverridableLabelOwner {
    override func label() -> String { "Customized label" }
}

let customizedLabelInterface: any DocumentLabeling = CustomizedLabelOwner()
assert(customizedLabelInterface.label() == "Customized label")
```

Now the witness can reach the class's overridable method. The intended behavior is observable through the interface that matters to the consumer.

This does not mean every conforming class should remain subclassable. A final class with an explicit conformance can be simpler when substitution happens at the protocol boundary rather than through inheritance.

## A default must be correct for every conformer that inherits it

An empty `save` implementation may make conformance convenient while discarding required data. A default that calls `fatalError` recreates an abstract-method crash under another spelling. Both postpone an omitted implementation until runtime.

Use defaults for behavior that is valid under the declared requirements. The receipt formatter can build a document from line rendering because every conformer supplies that operation and its semantics support the algorithm.

If an operation is optional, model its optionality explicitly. A separate capability can distinguish objects that can persist from objects that only render. An optional result can represent legitimate absence when the contract defines it. A no-op should be a meaningful policy, not a way to silence the compiler.

## Defaults cannot add stored instance state

A protocol extension can compute values and use requirements, but it cannot attach a cache field to every conformer. Storage belongs in the concrete type or a composed owner.

Making `var cache: [String: String] { get set }` a public requirement solely so a default helper can mutate it leaks internal machinery. Consumers and conformers now acquire storage obligations unrelated to the capability they need.

A wrapper can own caching around a renderer, or a concrete renderer can hold a private helper. The choice should reflect whether the cache is shared, independent per instance, or tied to a session. Default syntax cannot answer those lifetime questions.

## Document whether shared algorithms perform effects

A method named `preview` should not accidentally send a notification because its default calls `send`. A batching helper should not silently change a transactional all-or-nothing operation into a sequence of partially committed writes.

For an algorithm built on requirements, review the composition of their effects. Does each call perform I/O? Can it throw? Does invoking it twice repeat an external action? Can a callback reenter the owner during the algorithm?

A default implementation can be generic and still be semantically wrong for a conformer whose operation has different timing or failure guarantees. Strengthen the contract or move the helper to a narrower constrained capability when that difference matters.

## Test dispatch contexts instead of only concrete calls

| Test context | What it can reveal |
|---|---|
| Concrete value | The directly available method |
| `any Protocol` value | Behavior exposed by the existential interface |
| Generic parameter constrained to the protocol | Behavior valid under the generic body's constraints |
| Subclass through inherited conformance | Whether a base witness bypasses a same-named subclass method |

One success assertion against `SpecialBadge` would miss the difference visible to `any BadgeProviding`. The paired assertions make that distinction executable.

For defaults serving a public library, also test representative clients after adding a requirement or specialized extension. New declarations can affect source resolution or conformance choices when code is recompiled. Treat extension API as part of the library's compatibility surface.

## Evolve customization deliberately

Before turning a helper into a requirement, identify the consumer that needs varying behavior. A requirement creates an implementation obligation, though a default can satisfy it for many conformers. A public protocol change may affect external conformers and deserves a compatibility review.

Before adding a specialized constrained default, ask whether the specialization should supply a new helper or change the witness for an existing requirement. Those are different mechanisms. The [constrained extension article](/swift-constrained-protocol-extensions/) explores what information the compiler has at each use site.

As an exercise, add currency formatting to `ReceiptText`. Decide whether the currency is immutable configuration on a renderer or a per-call value. Then implement two conformers and call the shared document algorithm through the protocol interface. Assert the complete output, including line order, rather than merely checking that a custom method exists.

## Worked repair: declare the customization the consumer needs

The earlier badge example can be repaired by making the operation a requirement. Keep a valid fallback for conformers that do not customize it:

```swift
protocol CustomBadgeProviding {
    var name: String { get }
    func badge() -> String
}

extension CustomBadgeProviding {
    func badge() -> String { "Default: " + name }
}

struct RepairedBadge: CustomBadgeProviding {
    let name: String
    func badge() -> String { "Special: " + name }
}

struct OrdinaryBadge: CustomBadgeProviding {
    let name: String
}

func genericBadge<B: CustomBadgeProviding>(_ badge: B) -> String {
    badge.badge()
}

let repairedBadge = RepairedBadge(name: "Swift")
let repairedBadgeInterface: any CustomBadgeProviding = repairedBadge
assert(repairedBadge.badge() == "Special: Swift")
assert(repairedBadgeInterface.badge() == "Special: Swift")
assert(genericBadge(repairedBadge) == "Special: Swift")
assert(genericBadge(OrdinaryBadge(name: "Swift")) == "Default: Swift")
```

The generic helper and existential now observe the custom witness. The ordinary conformer still uses the shared default. The change establishes an intended customization point rather than relying on a same-named concrete helper to behave like an override.

For an internal protocol, that can be a straightforward correction. For a published protocol, adding a requirement changes the conformance interface and needs the library's compatibility policy to be considered. A default can make many conformers source-compatible without making every binary-compatibility question disappear.

The repaired protocol also requests `name` because the fallback uses it. If the public consumer only needs a finished badge string and implementations do not share a meaningful naming concept, a smaller protocol requiring only `badge` may be better, with formatting machinery owned elsewhere.

This is a useful review habit: after fixing dispatch, review the abstraction again. Correct witness behavior does not prove that every supporting requirement belongs in the consumer-facing capability.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
