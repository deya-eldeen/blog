---
layout: post
hidden: true
title: "Type Properties and Methods in Swift: static vs. class"
date: "2023-04-06"
last_modified_at: "2023-04-06"
permalink: /swift-static-class-members/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Methods", "Properties"]
thumbnail: assets/img/article-placeholder.svg
---
Some behavior belongs to an instance, and some belongs to the type. Formatting a particular document title uses instance state; the default document extension does not. Swift uses `static` for type members and also permits `class` on overridable class type members.

The two keywords express different inheritance contracts.

<!--more-->

## Start with a static member

```swift
struct Slug {
    static let separator = "-"
    let rawValue: String

    static func joining(_ words: [String]) -> Slug {
        Slug(rawValue: words.joined(separator: separator))
    }
}

let slug = Slug.joining(["swift", "objects"])
assert(slug.rawValue == "swift-objects")
assert(Slug.separator == "-")
```

The separator is associated with the type. The factory combines input into an instance without requiring an existing `Slug` to perform that work. Structs and enums use `static` for type members because they have no class inheritance hierarchy.

Classes can use `static` too. A static class member cannot be overridden by a subclass. For type methods, `class` permits overriding, while `static` closes that path. The [Methods chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/methods/#Type-Methods) describes those rules.

## Use class for a specialization point

```swift
class ExportFormat {
    class var fileExtension: String {
        "txt"
    }

    class func suggestedName() -> String {
        "export." + fileExtension
    }

    static let maximumNameLength = 80
}

final class CSVFormat: ExportFormat {
    override class var fileExtension: String {
        "csv"
    }
}

let format: ExportFormat.Type = CSVFormat.self
assert(format.suggestedName() == "export.csv")
assert(ExportFormat.maximumNameLength == 80)
```

The metatype value `format` refers to the subclass type. Calling the inherited type method uses that type context, including the overridden extension.

A `class` property is computed; Swift does not support an overridable stored type property declared with `class`. The stored `static let` above represents one fixed value in the declaration's inheritance context. If subclasses need different values, use a computed class property instead. See [Type Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/#Type-Properties).

## Self and self describe different things

Inside a type method, `self` refers to the type rather than an instance. Uppercase `Self` is a type-level way to refer to the conforming or dynamic type, depending on context.

This matters for factories. A factory that returns `Self` and constructs a subclass instance must have an initializer contract that makes that construction valid, often a required initializer for a non-final class. Do not replace a concrete return type with `Self` just to make an API look more generic.

## Shared state remains shared state

A mutable static property is a shared storage location, not an instance dependency. A test changing it can affect another test; concurrent access needs an appropriate concurrency design. Modern Swift concurrency checking may reject unprotected shared mutable state.

Prefer immutable constants for genuine universal facts. For configuration that varies by account, environment, or test, pass a value or dependency into the instance. Making everything static can hide those variations rather than eliminate them.

## Choose the smallest appropriate contract

Use an instance member when the result depends on one object's state. Use a static member for a type-level operation that should not vary through inheritance. Use a class method or computed class property only when subclass customization is intentional.

A free function can also be the right home for a calculation with no meaningful type owner. Namespacing is useful; an artificial utility class is not required for every helper.

## A metatype is a value that refers to a type

`ExportFormat.Type` is the type of a value representing `ExportFormat` or an eligible subclass type. `CSVFormat.self` produces such a metatype value. This lets a consumer choose a format dynamically without constructing an arbitrary format instance just to ask a type-level question.

That is different from an instance's `self`. In an instance method, `self` is the current instance. In a type method, it is the current type context. Uppercase `Self` expresses a type relationship and can preserve the dynamic subclass in factory APIs.

```swift
class NamedTemplate {
    let name: String

    required init(name: String) {
        self.name = name
    }

    class var prefix: String { "Template" }

    class func makeDefault() -> Self {
        self.init(name: prefix + " default")
    }
}

final class InvoiceTemplate: NamedTemplate {
    override class var prefix: String { "Invoice" }
}

let invoiceTemplate: InvoiceTemplate = InvoiceTemplate.makeDefault()
assert(invoiceTemplate.name == "Invoice default")
```

The return type remains `InvoiceTemplate` at that call. The required initializer makes construction valid throughout the hierarchy; without a suitable construction contract, a base implementation could not assume every subclass can be initialized that way.

This is a good use of `Self` because preserving the subclass type is part of the result's meaning. It is less helpful when a factory intentionally chooses among unrelated implementations and should return a protocol or another common abstraction.

## A stored static member is not per-subclass storage

An inherited stored type property remains the storage associated with its declaration. Merely spelling the subclass name does not create a separate slot for that subclass.

```swift
class SharedMetrics {
    static var requestCount = 0

    class func record() {
        requestCount += 1
    }
}

final class ImageMetrics: SharedMetrics {}
final class TextMetrics: SharedMetrics {}

SharedMetrics.requestCount = 0
ImageMetrics.record()
TextMetrics.record()
assert(SharedMetrics.requestCount == 2)
assert(ImageMetrics.requestCount == 2)
```

This example intentionally demonstrates synchronous shared mutable state. Do not copy this counter into concurrent production code without an appropriate isolation design. Modern strict concurrency checking can diagnose this kind of unprotected storage.

If each subclass needs a different constant, an overridden computed `class var` can express it. If each service instance needs independent mutable metrics, use an instance property and decide whether instances should share a metrics collaborator. A type-level counter silently imposes a lifetime and sharing policy on every consumer.

## Prefer a namespace only when it helps discovery

An enum with no cases can group related type-level functions and constants without permitting instances. A struct with static functions can serve a similar organizational role. Neither is required for a free function that already has a clear name and belongs naturally in its module.

Ask where callers will look for the operation. `Slug.joining` is discoverable alongside `Slug` because it creates that value. A global collection of unrelated `Utilities` functions gives weaker guidance. Namespacing should explain ownership of a concept rather than simply move everything behind a dot.

Also avoid creating a class only because a calculation needs a home. Inheritance and reference identity add nothing to a stateless operation that depends solely on its arguments.

## Static initialization does not make later mutation safe

Stored type properties are initialized lazily, and Swift ensures their initialization occurs once under the language's type-property rules. That guarantee concerns establishing the initial value. It does not serialize every later write to a mutable static property.

Likewise, `static let` prevents replacing its value. If that value is a mutable class instance, callers may still mutate the referenced object. A constant reference to a shared cache is not an immutable cache.

The distinction is covered by the language guide's [Type Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/#Type-Properties). Treat construction, binding immutability, and mutation isolation as three separate questions.

## Protocol type requirements describe a capability

Protocols spell type property and method requirements with `static`. A conforming class can satisfy eligible requirements with type members, including an overridable class member when appropriate. The requirement describes what the type must provide; it does not prescribe a stored variable.

```swift
protocol FileKind {
    static var suffix: String { get }
}

struct MarkdownKind: FileKind {
    static let suffix = "md"
}

func filename<K: FileKind>(stem: String, kind: K.Type) -> String {
    stem + "." + K.suffix
}

assert(filename(stem: "notes", kind: MarkdownKind.self) == "notes.md")
```

The metatype argument tells the generic function which type's capability to use without needing an instance. The resulting API preserves useful type information instead of passing an arbitrary string suffix through every layer.

Do not assume that every type requirement is conveniently callable on every existential metatype representation. Generic constraints and existential values answer different questions about which concrete type information is retained. Keep the public API as simple as the consumer's actual operation permits.

## Exercise: choose the scope of configuration

A test suite changes a static API host to point at a local server, then another test unexpectedly uses that host. Decide whether the host is a universal constant, per-environment configuration, or per-request input.

For environment configuration, construct a client with an immutable configuration value. For per-request variation, pass the value to the request operation. Leaving it static because “there is normally one host” hides a variation that tests and multi-account features have already shown to be real.

## Case study: count requests per runtime type without global storage

Suppose a diagnostic tool groups instances by their concrete class. A stored static counter inherited from a base class cannot provide one independent counter per subclass. The grouping key must represent the runtime type explicitly, and the storage must have a chosen owner.

`ObjectIdentifier` can identify a metatype within a process. That makes it useful as a dictionary key for this in-memory registry:

```swift
class DiagnosticTask {}
final class ImageDiagnosticTask: DiagnosticTask {}
final class TextDiagnosticTask: DiagnosticTask {}

final class TaskTypeCounts {
    private var counts: [ObjectIdentifier: Int] = [:]

    func record(_ task: DiagnosticTask) {
        let key = ObjectIdentifier(type(of: task))
        counts[key, default: 0] += 1
    }

    func count(for taskType: DiagnosticTask.Type) -> Int {
        counts[ObjectIdentifier(taskType), default: 0]
    }
}

let taskCounts = TaskTypeCounts()
let firstTask: DiagnosticTask = ImageDiagnosticTask()
taskCounts.record(firstTask)
taskCounts.record(ImageDiagnosticTask())
taskCounts.record(TextDiagnosticTask())
assert(taskCounts.count(for: ImageDiagnosticTask.self) == 2)
assert(taskCounts.count(for: TextDiagnosticTask.self) == 1)
assert(taskCounts.count(for: DiagnosticTask.self) == 0)

let independentCounts = TaskTypeCounts()
assert(independentCounts.count(for: ImageDiagnosticTask.self) == 0)
```

The base-typed `firstTask` still contributes to the image class's bucket because `type(of:)` obtains its dynamic type. Counting the base class does not include all subclasses automatically. This registry groups exact runtime types; an inclusive hierarchy count would be a different operation with a different implementation.

Two registry instances remain independent. A screen can own one registry for its current diagnostic session, while a test constructs a fresh registry without resetting a process-wide variable. If several components should share counts, inject the same instance explicitly.

### A type identity is not a persistent identifier

`ObjectIdentifier` is suitable for identity comparisons within a running process. Do not write it into a database as a permanent class identifier or use it as a cross-launch analytics schema. A later process has its own identities, and implementation types can change during refactoring.

For persisted grouping, define stable domain keys such as an enum or a documented string code. A type can expose that code through a static protocol requirement, but the code's stability comes from the API contract, not from the runtime address of the type.

This distinction also matters for instances. A class identity tells you which allocation you have; a database identifier tells you which entity it represents. A metatype identity tells you which runtime type you have; a product category identifies a concept that may span several implementation types.

### Factories do not have to own the instances they create

A static factory can be pure even when its result holds per-instance configuration. It does not require mutable static configuration:

```swift
struct UploadClientConfiguration: Equatable {
    let host: String
    let account: String
}

final class ConfiguredUploadClient {
    let configuration: UploadClientConfiguration

    init(configuration: UploadClientConfiguration) {
        self.configuration = configuration
    }

    static func preview(account: String) -> ConfiguredUploadClient {
        ConfiguredUploadClient(configuration: UploadClientConfiguration(
            host: "preview.invalid",
            account: account
        ))
    }
}

let previewAlice = ConfiguredUploadClient.preview(account: "alice")
let previewBob = ConfiguredUploadClient.preview(account: "bob")
assert(previewAlice.configuration.account == "alice")
assert(previewBob.configuration.account == "bob")
assert(previewAlice !== previewBob)
```

Each call creates an independent client. The word `static` describes how the factory is accessed; it does not mean the factory returns a singleton. Conversely, an instance method can return a shared object. Read the construction and ownership policy instead of inferring lifetime from the presence of a dot after a type name.

This factory returns the concrete final class intentionally. There is no subclass contract to preserve with `Self`, and no reason to introduce a required initializer. A public initializer can remain the general construction path, while a named factory expresses one useful configuration.

### Choose a scope by asking who should observe a change

| State | Likely owner | Why |
|---|---|---|
| Universal immutable suffix | Type constant | Every instance uses the same fact |
| Exact-type diagnostic counts | Explicit registry instance | Session lifetime and sharing are controllable |
| Account credentials | Account-scoped client | Another account must not observe a replacement |
| One request's retry count | Request operation | A later request starts independently |

These choices are about semantics. Moving a property from an instance to the type changes who shares it and how long it lives. That can alter behavior even when every caller still compiles.

### Initialization safety and operational safety need separate tests

A test confirming that a static factory returns the expected configuration says nothing about concurrent mutation of a shared registry. This registry, like the earlier counter, is meant for serialized access. If it becomes shared across tasks, add isolation at its actual ownership boundary and test the resulting asynchronous API.

Likewise, a lazy singleton can initialize correctly once and still retain stale account information forever. Verify switching accounts, ending a session, and constructing two environments in the same process. Those scenarios expose hidden type-level assumptions more effectively than a test that asks for the singleton twice and checks reference equality.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
