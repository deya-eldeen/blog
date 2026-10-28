---
layout: post
hidden: true
title: "Refactoring a Swift Class Hierarchy into Protocols"
date: "2025-02-13"
last_modified_at: "2025-02-13"
permalink: /swift-refactoring-inheritance-to-protocols/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Refactoring", "Testing"]
thumbnail: assets/img/article-placeholder.svg
---
A useful refactor changes where behavior lives while preserving what callers can observe. Replacing `class` with `protocol` is not enough: initialization, shared state, effect ordering, and error behavior can all change accidentally during the move.

We will migrate a small exporter with a formatting subclass into a composed design. The safety net checks actual exported text and forbidden writes after validation failure, rather than freezing the old private call graph.

<!--more-->

## Establish a behavior worth preserving

The exporter accepts one or more nonempty lines. It formats them, then writes the complete result once. Invalid input must never reach storage. Storage errors must propagate without reporting success.

```swift
enum ExportFailure: Error, Equatable {
    case invalidInput
    case destinationUnavailable
}

protocol ExportWriting {
    func write(_ text: String) throws
}

final class ExportRecorder: ExportWriting {
    private(set) var texts: [String] = []
    var rejectsWrites = false

    func write(_ text: String) throws {
        guard !rejectsWrites else { throw ExportFailure.destinationUnavailable }
        texts.append(text)
    }
}

class LegacyLineExporter {
    private let destination: any ExportWriting

    init(destination: any ExportWriting) { self.destination = destination }

    func format(_ lines: [String]) -> String {
        lines.joined(separator: "\n")
    }

    final func export(_ lines: [String]) throws {
        guard !lines.isEmpty, lines.allSatisfy({ !$0.isEmpty }) else {
            throw ExportFailure.invalidInput
        }
        let text = format(lines)
        try destination.write(text)
    }
}

final class LegacyBulletExporter: LegacyLineExporter {
    override func format(_ lines: [String]) -> String {
        lines.map { "- " + $0 }.joined(separator: "\n")
    }
}
```

The base class is not inherently broken. It provides a clear workflow and one customization hook. The refactoring pressure appears when formatting should be reused by previews and unrelated exporters without inheriting the storage lifecycle.

Use that actual requirement to select the boundary. A protocol for the mutable recorder itself is unnecessary; the consumer needs the existing writing capability, not every method of the concrete test helper.

## Characterize the existing public operation

```swift
let legacyDestination = ExportRecorder()
let legacyExporter: LegacyLineExporter = LegacyBulletExporter(destination: legacyDestination)
try legacyExporter.export(["One", "Two"])
assert(legacyDestination.texts == ["- One\n- Two"])
do {
    try legacyExporter.export(["One", ""])
    assertionFailure("An empty line must be rejected")
} catch {
    assert(error as? ExportFailure == .invalidInput)
}
assert(legacyDestination.texts == ["- One\n- Two"])
```

The second case matters because failure happens after inspecting at least one valid line. The assertion establishes that rejected input does not produce a partial export.

The test uses a base-typed reference, which exercises the substitution path existing callers use. A test calling only the subclass's `format` method would miss sequencing and validation behavior in `export`.

If the old behavior is itself a bug, record the intended change separately. A structural refactor and a product-rule change are easier to review when their effects are distinguishable.

## Extract the varying calculation

```swift
protocol ExportFormatting {
    func format(_ lines: [String]) -> String
}

struct PlainExportFormat: ExportFormatting {
    func format(_ lines: [String]) -> String {
        lines.joined(separator: "\n")
    }
}

struct BulletExportFormat: ExportFormatting {
    func format(_ lines: [String]) -> String {
        lines.map { "- " + $0 }.joined(separator: "\n")
    }
}

struct ComposedLineExporter<F: ExportFormatting> {
    let formatter: F
    let destination: any ExportWriting

    func export(_ lines: [String]) throws {
        guard !lines.isEmpty, lines.allSatisfy({ !$0.isEmpty }) else {
            throw ExportFailure.invalidInput
        }
        let text = formatter.format(lines)
        try destination.write(text)
    }
}
```

Formatting is now a capability with value implementations. The exporter still reads as one workflow. The destination remains a separately owned effect, and formatting does not gain a storage dependency.

The exporter is generic because its configured formatter type remains stable for that constructed value. An existential property would also be reasonable if runtime replacement or simpler non-generic storage were important. That representation decision is separate from extracting the capability.

Swift's [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) and [Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/) chapters describe the mechanics. The tests here establish whether the migration preserved the behavior that matters.

## Run the same observations against the new design

```swift
let composedDestination = ExportRecorder()
let composedExporter = ComposedLineExporter(
    formatter: BulletExportFormat(), destination: composedDestination
)
try composedExporter.export(["One", "Two"])
assert(composedDestination.texts == legacyDestination.texts)
do {
    try composedExporter.export(["One", ""])
    assertionFailure("An empty line must still be rejected")
} catch {
    assert(error as? ExportFailure == .invalidInput)
}
assert(composedDestination.texts == ["- One\n- Two"])

legacyDestination.rejectsWrites = true
composedDestination.rejectsWrites = true
do {
    try legacyExporter.export(["Three"])
    assertionFailure("The legacy write should fail")
} catch {
    assert(error as? ExportFailure == .destinationUnavailable)
}
do {
    try composedExporter.export(["Three"])
    assertionFailure("The composed write should fail")
} catch {
    assert(error as? ExportFailure == .destinationUnavailable)
}
assert(composedDestination.texts == legacyDestination.texts)
```

These assertions compare observable outcomes across both designs. They do not require the new exporter to call an inherited hook, preserve a private method name, or construct the same object graph.

The recorder fails before appending. A real destination might have more complicated partial-failure semantics. If the contract requires atomic replacement, name that requirement and test the infrastructure implementation rather than assuming this fake proves it.

## Migrate consumers incrementally

A preview can now use `BulletExportFormat` directly without constructing a storage collaborator. The existing export use case can move to `ComposedLineExporter` at its composition root.

For a large codebase, the old base API can temporarily forward to the extracted formatter, preserving callers while migration proceeds. Keep that adapter behaviorally narrow; avoid turning it into another permanent abstraction layer without a consumer need.

Remove the old hierarchy only when references and tests show that no caller depends on it. Renaming files and deleting a superclass before understanding external subclass clients can create a source compatibility break even when local tests pass.

## Preserve ownership, not just strings

In this example, both exporters retain their destinations. If several exporters should share one audit or store, assembly can pass the same instance. If they need independent state, construct separate owners.

Moving inherited instance storage into a global singleton changes sharing. Constructing a new helper inside every call changes lifetime in the opposite direction. Either can alter caching, metrics, or resource cleanup without changing one line of formatted output.

Document which collaborators are shared across features, scoped to an account, or fresh per operation. A protocol makes those objects replaceable; it does not choose their ownership graph.

## Watch the frequency and order of effects

The old exporter validates, formats once, and writes once. A migration that moves formatting into a per-line storage loop can preserve simple output while changing effect count and partial-failure behavior.

If a hook reads time or random values, extracting it into a repeatedly invoked policy can change results too. Take one observation where the use case requires one observation, then pass that value into the calculation.

An algorithm's meaningful ordering should remain visible in tests. Here the forbidden-write assertion protects validation-before-storage. If success notification were added, test that it happens only after a successful write.

## Decide when the protocol is no longer needed

The new formatting boundary is justified by several implementations and independent preview use. If the final product has only one small pure format, a concrete formatter may be enough. Composition can remain useful without existential dispatch or a public protocol.

Conversely, a plugin API allowing implementations from another module may need a carefully documented public protocol and compatibility plan. The same source-level pattern serves different responsibilities depending on its consumers.

## Finish with a change scenario

Add a numbered format. It should require a new formatting implementation and an assembly choice, while the stable export sequence remains unchanged. Then add a new validation rule, such as a maximum number of lines. That should change the workflow's input policy and its tests rather than every formatter.

These changes provide evidence that responsibilities became more local. Counting the number of protocols or celebrating the absence of inheritance would not establish that benefit.

As a final exercise, add a shared contract test function that runs valid input and invalid input against both the old and new public entry points. Keep the negative control of a destination that throws. The migration is complete when intended behavior, errors, and lifetime are preserved and the new boundary makes a real consumer simpler.

## Worked shared safety net: one contract, two constructions

Turn the migration observations into a reusable check whose negative control proves it can detect changed output:

```swift
func followsExportContract(
    make: (ExportRecorder) -> (([String]) throws -> Void)
) -> Bool {
    let destination = ExportRecorder()
    let export = make(destination)
    let expected = ["- One\n- Two"]
    do { try export(["One", "Two"]) } catch { return false }
    guard destination.texts == expected else { return false }
    do {
        try export([""])
        return false
    } catch ExportFailure.invalidInput {} catch { return false }
    guard destination.texts == expected else { return false }
    destination.rejectsWrites = true
    do {
        try export(["Three"])
        return false
    } catch ExportFailure.destinationUnavailable {} catch { return false }
    return destination.texts == expected
}

assert(followsExportContract { destination in
    LegacyBulletExporter(destination: destination).export
})
assert(followsExportContract { destination in
    ComposedLineExporter(formatter: BulletExportFormat(), destination: destination).export
})
assert(!followsExportContract { destination in
    { _ in try destination.write("Wrong output") }
})
```

The injected factory returns the operation under test, so the contract check is independent of the old and new concrete exporter types. Each run gets a fresh recorder and does not inherit state from another implementation's test.

The check protects text, validation-before-write, and failure propagation. It intentionally does not assert that the implementation contains a protocol or avoids a superclass. Architecture is being judged by preserved behavior and a useful new boundary, not by a syntax test.

For a large migration, keep this contract while moving one construction site at a time. A compatibility adapter can delegate to the new implementation and run through the same check. Once all consumers have moved, remove the obsolete class hierarchy and adapter together if neither serves a remaining external client.

The negative control is small but important: a test suite that never demonstrates failure can give false confidence during a broad refactor. Here a wrong result is rejected immediately, before the failure-path checks even begin.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
