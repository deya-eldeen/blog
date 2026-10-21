---
layout: post
hidden: true
title: "Protocols Instead of Multiple Inheritance in Swift"
date: "2023-06-01"
last_modified_at: "2023-06-01"
permalink: /swift-protocols-instead-of-multiple-inheritance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Protocols", "Composition"]
thumbnail: "images/covers/swift_protocols_instead_of_multiple_inheritance_thumbnail.webp"
thumbnail_ready: true
---
A downloadable report may be identifiable, serializable, and shareable. Those capabilities do not require three parent classes. Swift classes have at most one superclass, while a type can conform to several protocols.

This lets you combine contracts without combining several competing sets of inherited storage and lifecycle rules.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_protocols_instead_of_multiple_inheritance_thumbnail.webp"
 alt_text="One concrete object combines three independent protocol capabilities"
 caption="Protocols Instead of Multiple Inheritance in Swift"
 width="640"
 height="400"
%}

## Model capabilities independently

```swift
protocol Named {
    var name: String { get }
}

protocol LinkProviding {
    var shareLink: String { get }
}

struct Report: Named, LinkProviding {
    let name: String
    let shareLink: String
}

func shareMessage(for item: any Named & LinkProviding) -> String {
    item.name + ": " + item.shareLink
}

let report = Report(name: "Monthly report", shareLink: "https://example.com/r/42")
assert(shareMessage(for: report) == "Monthly report: https://example.com/r/42")
```

The protocol composition `Named & LinkProviding` requires both capabilities. It does not create a new stored model or merge two class instances. The report supplies the storage; the protocols describe what the consumer may request.

A generic function can express the same constraints with `T: Named & LinkProviding` when preserving the concrete type relationship is useful. See [Protocol Composition](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Protocol-Composition).

## Combine behavior without a diamond hierarchy

Multiple class inheritance in languages that support it can raise questions about which parent implementation or state is inherited through different paths. Swift avoids multiple superclass storage inheritance. Protocols can still introduce overlapping APIs, so naming and requirements deserve care.

```swift
protocol LocalDescribing {
    func localDescription() -> String
}

protocol RemoteDescribing {
    func remoteDescription() -> String
}

struct Resource: LocalDescribing, RemoteDescribing {
    func localDescription() -> String { "Cached resource" }
    func remoteDescription() -> String { "Server resource" }
}
```

If two capabilities mean different things, use different operation names. If they intentionally mean the same thing and their signatures are compatible, one implementation can satisfy both requirements.

When several extensions provide competing defaults, an explicit implementation on the conforming type is often the clearest resolution. Do not rely on a reader knowing subtle overload and constraint selection rules to understand a core domain operation.

## Protocol inheritance refines a contract

```swift
protocol ShareableReport: Named, LinkProviding {
    var pageCount: Int { get }
}
```

A conformer to `ShareableReport` must satisfy all the inherited requirements as well as `pageCount`. The protocol inherits requirements, not a superclass's stored properties. Use refinement when the combined concept has an independent meaning, not merely to save a few characters in one function signature.

A class may still inherit from a framework class and conform to these protocols. The superclass goes first in the declaration, followed by the protocol names.

## Put stateful reuse in collaborators

Suppose two capabilities both need a credential store. Protocol composition does not decide whether there should be one store, two stores, or shared mutable access. That ownership choice belongs in the concrete design.

Pass a helper to the conforming object or store it as a property. This makes the sharing decision visible and avoids exposing storage requirements solely to support a default implementation.

Protocols replace the need for multiple inheritance of interfaces and some shared behavior. They do not reproduce multiple inheritance of stored instance state, and that limitation is often useful: it forces ownership to be explicit.

## Multiple conformance does not automatically combine semantics

Two protocols can require the same signature. One implementation may satisfy both, but that only works if their behavioral promises are compatible.

Suppose a local cache protocol says `read` returns immediately and never performs I/O, while a remote store protocol uses the same spelling for an operation that may contact a server. A type can satisfy the method shape while failing one of those timing contracts. Shared names do not establish shared meaning.

Use separate operations when consumers must distinguish capabilities. If the behavior really is common, write the common contract once and refine it where needed. The objective is reusable meaning, not merely fewer declarations.

## Resolve competing defaults deliberately

Protocol extensions can introduce similarly named default operations. An explicit implementation on the conforming type makes the intended behavior visible rather than leaving readers to reconstruct an overload-resolution story.

```swift
protocol LocalNamed {
    func displayName() -> String
}

protocol RemoteNamed {
    func displayName() -> String
}

extension LocalNamed {
    func displayName() -> String { "Local default" }
}

extension RemoteNamed {
    func displayName() -> String { "Remote default" }
}

struct SyncedItem: LocalNamed, RemoteNamed {
    let name: String

    func displayName() -> String {
        name
    }
}

let syncedItem = SyncedItem(name: "Shared document")
let localName: any LocalNamed = syncedItem
let remoteName: any RemoteNamed = syncedItem
assert(localName.displayName() == "Shared document")
assert(remoteName.displayName() == "Shared document")
```

The explicit member supplies the coherent answer for both contracts. If local and remote naming should differ, one shared requirement implementation is the wrong model. Prefer distinct names or adapters that expose different views of the object.

This is not multiple inheritance of implementation state. No pair of parent constructors ran, and no superclass storage was merged. It is one concrete type satisfying two sets of requirements.

## Preserve relationships between capabilities with constraints

Sometimes “supports both protocols” is insufficient. A producer and a consumer may each declare an associated item type, and your operation is valid only if those types match.

```swift
protocol ValueProducing {
    associatedtype Output
    func produce() -> Output
}

protocol ValueConsuming {
    associatedtype Input
    func consume(_ value: Input) -> String
}

func connect<P: ValueProducing, C: ValueConsuming>(
    _ producer: P,
    to consumer: C
) -> String where P.Output == C.Input {
    consumer.consume(producer.produce())
}

struct NumberProducer: ValueProducing {
    func produce() -> Int { 12 }
}

struct NumberConsumer: ValueConsuming {
    func consume(_ value: Int) -> String {
        "Consumed " + String(value)
    }
}

assert(connect(NumberProducer(), to: NumberConsumer()) == "Consumed 12")
```

The same-type constraint expresses the missing relationship. Merely storing arbitrary existential producer and consumer values would hide the information needed to guarantee compatibility.

Swift's [Generics chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/) explains these relationships. Use constraints to retain facts the consumer genuinely needs, and avoid adding generic complexity where a simple concrete value would do.

## Separate capability selection from ownership

A class can inherit from one superclass and conform to several protocols. That combination is common when framework identity or lifecycle comes from the superclass while domain capabilities come from protocols.

The superclass remains responsible for its initialized storage. Protocol conformance does not decide how a logger, cache, or credential source is owned. If two capabilities use one shared collaborator, store or inject that collaborator explicitly.

Ask whether each capability should be stateless, instance-local, or shared across several objects. A default implementation that reads a process-wide singleton makes the ownership decision invisibly, even if the protocol itself contains no properties.

## Do not build a protocol that means everything

It is tempting to create `ApplicationFeature: Logging, Networking, Persisting, Navigating, AnalyticsReporting` so that one dependency “has everything.” Every consumer of that combined contract can then reach every capability, and every implementation may need to supply unrelated functionality.

Prefer constraints at the narrow point where two capabilities are actually required together. The earlier `shareMessage` needs a name and a link, so its composition is meaningful. A text formatter should not inherit networking capability merely because another operation in the application needs it.

A named refining protocol is useful when the combination has its own stable domain meaning. If the combination exists only for one helper, a local generic constraint or protocol composition can avoid inventing another public concept.

## Compare the design alternatives

| Need | Useful approach | Cost to consider |
|---|---|---|
| Several independent interfaces | Multiple protocol conformances | Potential naming and semantic overlap |
| Shared stateful machinery | Composed helper object | Explicit forwarding and ownership |
| One framework lifecycle | Single superclass plus protocols | Inherited lifecycle obligations |
| One reusable algorithm | Extension built on requirements | Customization and dispatch rules |
| Connected associated types | Generic same-type constraints | More visible type relationships |

The language restriction against multiple superclasses removes one category of complexity. It does not remove the need to design coherent capabilities or decide where state lives.

## Exercise: split an accidental capability bundle

Imagine a report type conforming to one protocol with `name`, `shareLink`, `save`, `delete`, and `upload`. A preview screen uses only the first two. Define the smallest preview-facing contract and identify which other consumers truly need mutation or transport.

Then construct a preview implementation with no database and no network client. If doing so still requires dummy `delete` and `upload` methods, the boundary remains broader than that consumer's needs. The benefit of protocol composition is being able to require exactly the capabilities needed at a particular use site.

## Case study: one store, two capabilities, two security boundaries

A settings screen needs to read preferences. An account-management screen needs to change them. Both work with the same store, but requiring every consumer to accept a broad read/write interface makes mutation available where it serves no purpose.

Define the capabilities independently, then let a concrete class supply both:

```swift
protocol PreferenceReading {
    func value(for key: String) -> String?
}

protocol PreferenceWriting {
    func setValue(_ value: String, for key: String)
}

final class PreferenceStore: PreferenceReading, PreferenceWriting {
    private var values: [String: String] = [:]

    func value(for key: String) -> String? { values[key] }

    func setValue(_ value: String, for key: String) {
        values[key] = value
    }
}

struct PreferenceHeading {
    let preferences: any PreferenceReading

    func text() -> String {
        preferences.value(for: "displayName") ?? "Guest"
    }
}

func changeDisplayName<S: PreferenceReading & PreferenceWriting>(
    to name: String,
    in store: S
) -> String? {
    let previous = store.value(for: "displayName")
    store.setValue(name, for: "displayName")
    return previous
}

let preferenceStore = PreferenceStore()
let preferenceHeading = PreferenceHeading(preferences: preferenceStore)
assert(preferenceHeading.text() == "Guest")
let previousDisplayName = changeDisplayName(to: "Mina", in: preferenceStore)
assert(previousDisplayName == nil)
assert(preferenceHeading.text() == "Mina")
```

There is one dictionary, not one dictionary inherited from a reading parent and another inherited from a writing parent. Multiple conformance supplies several views of one object. The heading observes subsequent updates because it holds a reference to that same store through the reading contract.

This narrower type limits ordinary operations available to the consumer; it is not a security sandbox. Code that knows the concrete store could attempt a cast. Authorization for protected changes must be enforced by the relevant domain or service boundary regardless of the static interface offered to a screen.

### Use an adapter when identical signatures have different meanings

Now imagine an external API that exposes `value(for:)` too, but it should read a frozen set of defaults rather than the live account preferences. Making one class satisfy two same-shaped reading contracts cannot give a single method two different meanings just because callers view it through different names.

Represent each view as a distinct adapter instead:

```swift
struct DefaultPreferenceView: PreferenceReading {
    let defaults: [String: String]

    func value(for key: String) -> String? { defaults[key] }
}

struct EffectivePreferenceView: PreferenceReading {
    let account: any PreferenceReading
    let defaults: any PreferenceReading

    func value(for key: String) -> String? {
        account.value(for: key) ?? defaults.value(for: key)
    }
}

let defaultPreferences = DefaultPreferenceView(defaults: [
    "displayName": "Visitor",
    "language": "en"
])
let effectivePreferences = EffectivePreferenceView(
    account: preferenceStore,
    defaults: defaultPreferences
)
assert(effectivePreferences.value(for: "displayName") == "Mina")
assert(effectivePreferences.value(for: "language") == "en")
assert(defaultPreferences.value(for: "displayName") == "Visitor")
```

The adapters make source selection explicit. An effective view has a documented precedence rule: the account value wins when present. An empty string is still present and therefore wins; `nil` means absent. If the domain wants an empty string to mean “use the default,” encode that as a deliberate policy rather than relying on a truthiness rule Swift does not have.

### Shared state and snapshot state are different capabilities

The effective view holds a live account reader and a value containing defaults. Updates to the account are visible on the next call. The defaults struct contains a copied dictionary value; constructing another defaults value does not edit this one.

A preview or audit record may need a frozen result instead. Build a snapshot with the exact keys required and document when it is captured. Do not call a wrapper a snapshot if it simply forwards each read to a mutable store. Protocol composition decides which operations are available, not whether their results remain stable over time.

This matters for caching as well. A cache around `EffectivePreferenceView` needs an invalidation rule when account preferences change. Conformance to `PreferenceReading` alone makes no promise that reads are pure, immutable, or free from external effects.

### Keep combined requirements local until they have a domain meaning

`changeDisplayName` needs both reading and writing because it returns the previous value. A generic composition documents that actual requirement. The heading needs only reading. Neither requires a new umbrella protocol containing every preference-related operation.

A named refining protocol becomes useful if “editable preferences” is a stable abstraction shared by several consumers. Even then, avoid including unrelated synchronization or account deletion methods simply because the concrete store happens to have them.

| Consumer | Capability needed | State observed |
|---|---|---|
| Heading | Reading | Live account value |
| Rename action returning the old name | Reading and writing | One shared store |
| Defaults inspector | Reading | Fixed defaults value |
| Effective settings view | Reading | Account value with explicit fallback |

### Test the views and their relationships

Test account precedence, fallback on absence, empty values, and updates visible through a previously constructed live view. Also construct two independent stores and verify their mutations remain independent. These tests establish the ownership and semantic rules that multiple protocol declarations alone cannot express.

If these reads and writes can race, the read-then-write rename helper is not atomic. Introduce an isolated transactional operation when returning the previous value must correspond to the exact change. Combining two protocols is a type-level statement; it is not a concurrency transaction.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
