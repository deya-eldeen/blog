---
layout: post
hidden: true
title: "When Protocols Are Overkill in Swift"
date: "2025-04-10"
last_modified_at: "2025-04-10"
permalink: /swift-when-protocols-are-overkill/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Design", "API Design"]
thumbnail: assets/img/article-placeholder.svg
---
A protocol is useful when it expresses a capability a consumer needs to abstract. It is unnecessary when it adds a new name and an extra navigation step without isolating variation, effects, or a type relationship.

Protocol-oriented programming is not a requirement to put every struct behind an interface. A small concrete calculation, an enum, a function value, or an already available data snapshot can be the clearer boundary.

<!--more-->

## A pure calculation may already be easy to test

```swift
struct NameInitials {
    func initials(for words: [String]) -> String {
        words.compactMap(\.first).map { String($0).uppercased() }.joined()
    }
}

let initialsFormatter = NameInitials()
assert(initialsFormatter.initials(for: ["Maya", "Ali"]) == "MA")
assert(initialsFormatter.initials(for: ["", "Swift"]) == "S")
assert(initialsFormatter.initials(for: []) == "")
```

The calculation has explicit inputs, a small result, and no external effects. It does not need a mock to make its behavior deterministic. An `InitialsFormatting` protocol with one implementation would add value only if a consumer actually needs another formatting policy or a stable public abstraction.

The implementation makes a simple uppercase-initial policy, not a complete international name formatter. A future localization requirement may justify another policy. That is a concrete reason to introduce variation later, not a reason to predict every future interface today.

Avoid using “easy to mock” as the only argument for an abstraction around code that can already be exercised directly. The more useful test boundary may be the external effect around the calculation.

## Inject a value when the feature needs a value

```swift
struct ProfileHeading {
    let displayName: String
    let unreadCount: Int

    var text: String { "\(displayName) (\(unreadCount))" }
}

assert(ProfileHeading(displayName: "Maya", unreadCount: 3).text == "Maya (3)")
```

If the caller already has the name and count, a profile service protocol may add no useful capability. Passing a snapshot makes the feature's inputs explicit and removes lifetime, scheduling, and failure questions it does not need to own.

A live screen that must refresh data is a different use case. Its owner may need a reader capability, cancellation, and an update policy. Keep that responsibility in the owner rather than making a label formatter discover a service simply to obtain two fields.

Values are also useful for previews and diagnostics. They can represent a particular observation without implying that the reader will return the same result forever.

## A closure can express one small variation

```swift
struct FilenamePolicy {
    let transform: (String) -> String

    func filename(for title: String) -> String {
        transform(title) + ".txt"
    }
}

let simpleFilenamePolicy = FilenamePolicy { title in
    title.lowercased().replacingOccurrences(of: " ", with: "-")
}
assert(simpleFilenamePolicy.filename(for: "Swift Notes") == "swift-notes.txt")
```

This example requires Foundation for the string replacement operation; add the import to the source file:

```swift
import Foundation
```

One named function dependency can be easier to understand than a protocol plus several one-method wrappers. A protocol becomes more useful when several operations form one coherent capability, associated types preserve a relationship, or the contract deserves an independently documented public name.

Closures still capture state. A stored closure can retain a shared service or create an ownership cycle. Function syntax reduces declarations; it does not guarantee purity or safe transfer across actors.

For a real filename, the policy also needs invalid-character, collision, length, and normalization rules. A convenient closure should not be mistaken for a complete filesystem boundary.

## Prefer an enum for a genuinely closed choice

```swift
enum ExportLayout {
    case lines
    case commaSeparated

    func render(_ values: [String]) -> String {
        switch self {
        case .lines: return values.joined(separator: "\n")
        case .commaSeparated: return values.joined(separator: ", ")
        }
    }
}

assert(ExportLayout.lines.render(["A", "B"]) == "A\nB")
assert(ExportLayout.commaSeparated.render(["A", "B"]) == "A, B")
```

The enum makes supported modes discoverable and handling exhaustive. Adding another mode requires reviewing relevant switches, which can be useful when the application owns the whole set.

A protocol is attractive when independent modules or clients should supply new implementations without editing that enum. That openness is a requirement, not an automatic improvement. It trades exhaustive closed-world knowledge for a behavioral contract external conformers must honor.

Do not call every switch an Open/Closed violation. Configuration and domain choices often are intentionally finite. Evaluate the expected extension scenario instead of applying a pattern slogan mechanically.

## Avoid protocols that mirror a concrete class wholesale

A `UserManagerProtocol` containing every method of `UserManager` may merely duplicate the implementation's current shape. Consumers still see networking, cache control, mutation, account administration, and navigation together.

Start from the consumer. A preview needs a profile snapshot; a rename operation needs a specific mutation capability; an account screen may need a broader coherent interface. The useful abstraction follows those needs rather than the name of the existing class.

The same warning applies to public mutable storage requirements. Exposing a cache setter so an extension helper can operate may make the design less encapsulated. Keep machinery in a concrete owner when consumers should not control it.

## One implementation does not automatically mean no abstraction

A protocol with one production implementation can still be justified when it isolates a meaningful effect or separates modules. A clock, storage writer, or network operation often needs deterministic failures in tests even before a second production backend exists.

The distinction is evidence. What behavior becomes easier to verify? Which dependency direction changes? Which implementation detail is hidden from the consumer? If the answer is concrete, one implementation can be enough.

Conversely, many implementations do not guarantee a good protocol. A capability whose conformers disagree about whether successful save means durable storage remains misleading even if ten types conform.

## Generic relationships are another valid reason

Associated types and same-type constraints can prevent incompatible components from being connected. That is useful even when the current application has few conformers.

For example, a source and sink sharing an item type can be checked at compile time. Replacing that relationship with `Any` and casts would weaken the design merely to reduce declarations. The [Associated Types article](/swift-associated-types/) provides a complete example.

Keep the complexity proportional to the relationship needed. If the consumer only counts an already loaded array, it probably does not need a generic repository, a factory for the repository, and a type-erasing wrapper around that factory.

## Recognize abstraction costs in everyday maintenance

Each public protocol adds an implementation obligation and a compatibility surface. Defaults introduce dispatch rules. Generic constraints can spread type parameters through consumers. Existential storage hides some relationships and may require additional representation. Test doubles can drift from production semantics.

These costs can be worthwhile. They should buy a clearer boundary, a controlled effect, or meaningful extensibility. A hierarchy of forwarding wrappers that all pass the same arguments unchanged is harder to justify.

Swift's [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) chapter describes powerful tools, not a requirement to use every tool in every feature. Concrete code can participate in a protocol-oriented system without being abstracted itself.

## Simplify without losing the useful seam

Imagine a greeting feature depending on a formatter protocol, a configuration protocol, a prefix-provider protocol, and a factory protocol. If the only variation is a prefix string, replace those configuration abstractions with an immutable value while retaining a reader protocol for an actual external effect.

Test the same success and failure behavior before and after. Remove redundant forwarding layers one at a time, and keep ownership and effect timing unchanged. Fewer declarations are useful when they remove needless decisions, not when they collapse independent responsibilities into a new giant manager.

A practical review table helps identify the seam worth keeping:

| Need | Smallest useful starting point |
|---|---|
| Already known input | Value parameter |
| Pure reusable calculation | Function or concrete type |
| One configurable operation | Function value |
| Finite application-owned modes | Enum |
| Replaceable effect or shared capability | Protocol when its contract is meaningful |
| Connected input/output types | Generic constraints and associated types |

## Use the next change as evidence

Before adding a protocol, name the current consumer that needs it and the behavior it protects. After adding it, show the smaller test, independent adapter, or compile-time relationship that resulted.

As an exercise, take one protocol with a single conformer and list its consumers. Replace one consumer's dependency with the data it actually uses. If that makes the consumer simpler without losing an effect or relationship it owns, the value boundary may be stronger. If it forces the consumer to rebuild transport or persistence logic, keep the capability seam.

The goal is an application whose behavior, dependencies, and ownership can be understood locally. Protocols are one way to achieve that goal; they are not a score to maximize.

## Worked simplification: two configuration fields can remain a value

Suppose three configuration-provider protocols exist only to supply a greeting prefix and punctuation. Replace that graph with one immutable configuration and a directly testable calculation:

```swift
struct GreetingTextConfiguration {
    let prefix: String
    let punctuation: String
}

struct GreetingText {
    let configuration: GreetingTextConfiguration

    func message(to name: String) -> String {
        configuration.prefix + " " + name + configuration.punctuation
    }
}

let formalGreeting = GreetingText(configuration: GreetingTextConfiguration(
    prefix: "Welcome,", punctuation: "."
))
let casualGreeting = GreetingText(configuration: GreetingTextConfiguration(
    prefix: "Hi,", punctuation: "!"
))
assert(formalGreeting.message(to: "Maya") == "Welcome, Maya.")
assert(casualGreeting.message(to: "Maya") == "Hi, Maya!")
```

Both configurations coexist without mutable global switches or test resets. The calculation receives all the information it needs and has no effect requiring a fake.

If the application obtains the person's name from a remote profile service, keep that effect behind an appropriate reader capability in the owning workflow. Simplifying configuration does not require collapsing transport and formatting into one object.

A localization requirement might later replace these fields with a localized format operation. That would be evidence for another representation or policy boundary. Keeping today's model concrete does not prevent that change; it avoids maintaining speculative interfaces before the requirement is understood.

A useful cleanup explains what disappeared: redundant forwarding, hidden lookups, or stateful providers for facts that were already immutable. It also explains what stayed explicit: the actual input, output, and any effect seam the feature still needs.

That is the practical test for overkill. Remove abstractions that do not protect a meaningful decision, while retaining the boundaries that make behavior truthful and controllable.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
