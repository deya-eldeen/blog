---
layout: post
hidden: true
title: "Factories in Protocol-Oriented Swift: Construct the Right Capability"
date: "2024-12-12"
last_modified_at: "2024-12-12"
permalink: /swift-protocol-factory-pattern/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Factory", "Dependency Injection"]
thumbnail: assets/img/article-placeholder.svg
---
A factory decides how to construct a useful object or value. In protocol-oriented Swift, it can return a capability rather than expose the concrete implementation chosen by configuration.

That does not require a factory class hierarchy. A function, enum switch, or injected creation closure is often enough. The important decisions are what varies, when construction can fail, and whether each call produces a fresh resource or returns shared state.

<!--more-->

## Begin with the consumer's operation

```swift
protocol LineExporting {
    func export(_ lines: [String]) -> String
}

struct PlainLineExporter: LineExporting {
    func export(_ lines: [String]) -> String {
        lines.joined(separator: "\n")
    }
}

struct BulletLineExporter: LineExporting {
    func export(_ lines: [String]) -> String {
        lines.map { "• " + $0 }.joined(separator: "\n")
    }
}

enum LineExportFormat: String {
    case plain
    case bullets
}

func makeLineExporter(format: LineExportFormat) -> any LineExporting {
    switch format {
    case .plain: return PlainLineExporter()
    case .bullets: return BulletLineExporter()
    }
}

let plainLineExporter = makeLineExporter(format: .plain)
let bulletLineExporter = makeLineExporter(format: .bullets)
assert(plainLineExporter.export(["A", "B"]) == "A\nB")
assert(bulletLineExporter.export(["A", "B"]) == "• A\n• B")
```

The enum represents a closed configuration choice. The factory returns an existential because runtime configuration can choose unrelated conforming types. The consumer uses only exporting behavior.

There is no need for `PlainExporterFactory`, `BulletExporterFactory`, and an abstract factory superclass just to move this small switch into three files. Add more structure when construction itself has meaningful independent variation.

## Validate external configuration before constructing

```swift
enum ExportConfigurationFailure: Error, Equatable {
    case unsupportedFormat(String)
}

func configuredLineExporter(name: String) throws -> any LineExporting {
    guard let format = LineExportFormat(rawValue: name) else {
        throw ExportConfigurationFailure.unsupportedFormat(name)
    }
    return makeLineExporter(format: format)
}

let configuredBulletExporter = try configuredLineExporter(name: "bullets")
assert(configuredBulletExporter.export(["Ready"]) == "• Ready")
do {
    _ = try configuredLineExporter(name: "unknown")
    assertionFailure("Unknown configuration must be reported")
} catch {
    assert(error as? ExportConfigurationFailure == .unsupportedFormat("unknown"))
}
```

Silently choosing plain output for every unknown string would hide a configuration mistake. A fallback is valid only if the product explicitly defines that behavior and callers can rely on it.

The configuration parser belongs at the boundary receiving the string. Inside the feature, the enum carries the validated choice. This avoids spreading string comparisons and default branches through every consumer.

The Swift guide's [Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/) explains why an existential can represent runtime variation that an ordinary opaque return cannot express across unrelated underlying types.

## A factory and its product have different lifetimes

An editing feature needs a fresh session for each opened document. Reusing a singleton session would let one editor overwrite another editor's draft.

```swift
final class DraftEditSession {
    let id: Int
    var text: String

    init(id: Int, text: String) {
        self.id = id
        self.text = text
    }
}

protocol DraftSessionMaking {
    func makeSession(text: String) -> DraftEditSession
}

final class DraftSessionFactory: DraftSessionMaking {
    private var nextID = 0

    func makeSession(text: String) -> DraftEditSession {
        nextID += 1
        return DraftEditSession(id: nextID, text: text)
    }
}

struct DraftOpening {
    let factory: any DraftSessionMaking

    func open(_ text: String) -> DraftEditSession {
        factory.makeSession(text: text)
    }
}

let draftSessionFactory = DraftSessionFactory()
let draftOpening = DraftOpening(factory: draftSessionFactory)
let firstDraftSession = draftOpening.open("First")
let secondDraftSession = draftOpening.open("Second")
firstDraftSession.text = "Edited first"
assert(firstDraftSession !== secondDraftSession)
assert(firstDraftSession.id != secondDraftSession.id)
assert(secondDraftSession.text == "Second")
```

The application can retain one factory while consumers own separate products. The factory's counter is an intentionally local identifier source for this serialized example, not a durable cross-launch document identifier.

A production resource factory may need to throw while opening a file or transaction. The product owner then needs an explicit close, cancel, or commit lifecycle. Returning a protocol capability does not make resource acquisition or cleanup disappear.

## Inject a factory when creation is the variation

Injecting an already created session would force the feature to reuse that session. Injecting a factory lets the feature request fresh state when an operation begins. These dependencies express different lifetime policies.

For one simple creation operation, a closure such as `(String) -> DraftEditSession` can be sufficient. A named protocol becomes useful when it documents an important capability, groups related creation operations, or carries associated type relationships.

Avoid replacing specific factory dependencies with a generic service locator. A feature that receives `resolve(Type.self)` can discover arbitrary dependencies at runtime, hiding what construction and execution actually require. `makeSession(text:)` is a clear operation with a clear product.

## Choose concrete, generic, opaque, or existential results deliberately

A factory returning `DraftEditSession` is honest when every supported product is that concrete session type. It still supplies a fresh instance and centralizes construction; factories do not require existential returns.

A generic factory parameter is useful when the caller chooses a product family and the type relationship must remain visible. An opaque result hides one underlying implementation chosen by a declaration. An existential result can choose among conformers at runtime.

Do not return `Self` merely to make a factory look flexible. In a non-final class hierarchy, constructing dynamic `Self` can impose a required initializer contract on every subclass. A separate factory often avoids forcing unrelated construction needs into one inherited initializer.

## Keep assembly near the application boundary

```mermaid
flowchart LR
    accTitle: Factory selection stays in assembly
    accDescr: Configuration selects a factory result, which is supplied as an exporting capability to the feature. The feature does not inspect concrete exporter types.
    Config[Validated configuration] --> Factory[makeLineExporter]
    Factory --> Exporter[LineExporting implementation]
    Exporter --> Feature[Export feature]
```

The feature should not repeatedly inspect configuration and rebuild its dependencies during every operation unless runtime replacement is an actual requirement. Stable constructor injection gives it a valid collaborator for its intended lifetime.

A composition root can assemble an application-wide transport, an account-scoped repository, and a fresh edit session. Those scopes are decisions about reuse and ownership. Factory syntax makes the decisions visible; it does not choose them automatically.

## Test the products through their promised interfaces

For exporter selection, assert complete output for each configuration choice and a meaningful error for an unsupported external value. A test that checks only the product's concrete type can pass while its behavior is wrong.

For session construction, assert distinct instance identity and independent mutation. Also test whether required collaborators are intentionally shared between sessions. Two sessions can have independent draft text while reporting to the same audit service; that is a valid graph if documented.

For failing resource acquisition, verify that the factory returns no half-valid product and releases any resources acquired before the failure. A factory's main benefit is delivering a usable product under a clear construction contract.

## Avoid speculative registration systems

A dictionary of string names to arbitrary creation closures may be justified for plugins loaded independently. For two known export formats, an enum switch is easier to discover, validate, and exhaustively handle.

Registration introduces duplicate-name rules, missing registrations, initialization order, and a lifetime for the registry. Those are real costs. Do not add them simply because a pattern catalog calls factories extensible.

As an exercise, add a third exporter with an immutable separator configuration. Decide whether the configuration is part of the format enum's associated data, a separate validated value, or a construction argument. Keep the consumer-facing exporting operation unchanged and test the configured output. The factory has earned its role when construction choices remain clear while the feature continues to depend on the capability it actually uses.

## Worked extension: add a configured product without a factory hierarchy

The third format can carry immutable separator configuration while reusing the existing choices:

```swift
struct JoinedLineExporter: LineExporting {
    let separator: String
    func export(_ lines: [String]) -> String {
        lines.joined(separator: separator)
    }
}

enum ConfiguredExportChoice {
    case standard(LineExportFormat)
    case joined(separator: String)
}

func makeConfiguredExporter(_ choice: ConfiguredExportChoice) -> any LineExporting {
    switch choice {
    case let .standard(format): return makeLineExporter(format: format)
    case let .joined(separator): return JoinedLineExporter(separator: separator)
    }
}

let slashExporter = makeConfiguredExporter(.joined(separator: " / "))
let pipeExporter = makeConfiguredExporter(.joined(separator: " | "))
assert(slashExporter.export(["One", "Two"]) == "One / Two")
assert(pipeExporter.export(["One", "Two"]) == "One | Two")
assert(slashExporter.export([]) == "")
assert(makeConfiguredExporter(.standard(.plain)).export(["One", "Two"]) == "One\nTwo")
```

Each product retains its own configuration. Constructing the pipe exporter does not modify the slash exporter's behavior. A mutable static separator would create hidden sharing and make these two simultaneous configurations harder to support.

The factory still has a small exhaustive switch. No registry or abstract factory family is necessary because the application owns these finite choices. Independent plugins could justify a different extension mechanism when they become a real requirement.

The separator is unrestricted in this rendering contract, including the empty string. If a target file format restricts separators or requires escaping, add those domain rules to a validated format value or a dedicated exporter. Joining strings is not automatically a compliant CSV encoder merely because the separator happens to be a comma.

The stable consumer operation remains `export`. Construction and format-specific policy changed locally, which is the concrete benefit the factory boundary was intended to provide.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
