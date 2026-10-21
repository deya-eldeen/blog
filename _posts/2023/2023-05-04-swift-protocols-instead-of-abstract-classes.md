---
layout: post
hidden: true
title: "Protocols Instead of Abstract Classes in Swift"
date: "2023-05-04"
last_modified_at: "2023-05-04"
permalink: /swift-protocols-instead-of-abstract-classes/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Protocols", "Abstraction"]
thumbnail: assets/img/article-placeholder.svg
---
In some languages, an abstract class defines operations that subclasses must implement and also provides shared behavior. Swift does not have an `abstract` class keyword. A base method that calls `fatalError` imitates the shape, but a missing implementation becomes a runtime failure.

A protocol can express the required behavior directly, with an extension supplying useful shared operations.

<!--more-->

## Express a requirement the compiler can check

```swift
protocol TextExporting {
    func render(lines: [String]) -> String
}

extension TextExporting {
    func preview(lines: [String]) -> String {
        String(render(lines: lines).prefix(40))
    }
}

struct PlainTextExporter: TextExporting {
    func render(lines: [String]) -> String {
        lines.joined(separator: "\n")
    }
}

struct BulletExporter: TextExporting {
    func render(lines: [String]) -> String {
        lines.map { "• " + $0 }.joined(separator: "\n")
    }
}

let exporter: any TextExporting = BulletExporter()
assert(exporter.preview(lines: ["One", "Two"]) == "• One\n• Two")
```

`render` is a requirement, so a conforming type must provide it or receive a valid default implementation. The helper uses that requirement and works with either exporter. Forgetting `render` causes a conformance error rather than waiting for a user to reach a crash path.

Protocols and extensions support this division between required operations and shared behavior; see the language guide's [Protocol Extensions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Protocol-Extensions).

## Shared storage needs another home

A protocol describes requirements. A protocol extension cannot add stored instance properties. If each exporter needs a mutable cache, decide who owns that cache rather than trying to put storage into an extension.

One option is a stored helper on each conforming class. Another is a wrapper that owns an exporter and the cache. A base class can also be reasonable when a real shared identity, lifecycle, and storage contract justify inheritance.

Avoid making a `cache` requirement publicly settable merely so that a default implementation can reach it. That can expose internal policy to every consumer of the protocol. A smaller helper object may preserve the boundary better.

## Keep customization points explicit

If conformers need to customize a method invoked through the protocol, declare that method as a requirement. An extension-only helper is useful for behavior that should be shared as written, but it is not a virtual method waiting for an override.

In the example, `preview` is deliberately a shared operation and `render` is the customization point. A conformer declaring its own `preview` does not replace the extension-only method for calls made through `any TextExporting`.

Naming and documentation should make that distinction understandable to the person implementing the next conformer.

## Avoid empty default implementations

A default that silently does nothing can conceal an omission just as a crash can postpone it. If exporting must produce text, an empty default `render` weakens the contract rather than improving convenience.

Defaults are most useful when they are meaningful for every conformer that inherits them. Otherwise, require an implementation and let the compiler remind the author what remains to be done.

## Decide whether inheritance is actually needed

Use protocols when unrelated types should satisfy the same contract, including value types. Use composition for reusable stateful machinery. Use a class hierarchy when the subclass genuinely participates in the parent's behavioral and ownership contract.

These approaches can coexist. A final exporter class can conform to the protocol and own a cache helper. It does not need an abstract superclass merely to share a few lines of formatting code.

## Translate the roles of an abstract base separately

An abstract base class often combines several jobs: declaring required operations, supplying reusable algorithms, storing shared state, and defining a lifecycle. A protocol is excellent for the first job and can support the second through extensions. It does not automatically replace the storage or lifecycle design.

| Role in the old base class | Possible Swift representation | Important constraint |
|---|---|---|
| Operation every implementation must provide | Protocol requirement | State meaningful semantics |
| Algorithm built from those operations | Protocol extension helper | Make varying steps requirements |
| Cache or mutable bookkeeping | Composed helper or concrete owner | Decide lifetime and sharing |
| Resource identity and cleanup | Class where appropriate | Specify ownership and activation |
| Construction rule | Initializer requirement or factory | Avoid promising impossible defaults |

This decomposition avoids a common migration mistake: copying every base-class member into one protocol and exposing all its mutable storage as requirements. The code becomes protocol-shaped without becoming better encapsulated.

## Express a reusable algorithm through required steps

A template-style algorithm does not necessarily need a superclass. An associated type can retain the relationship between a renderer and the data it accepts.

```swift
protocol RowRendering {
    associatedtype Row
    func text(for row: Row) -> String
}

extension RowRendering {
    func document(rows: [Row]) -> String {
        rows.map { text(for: $0) }.joined(separator: "\n")
    }
}

struct InventoryRow {
    let name: String
    let quantity: Int
}

struct InventoryRenderer: RowRendering {
    func text(for row: InventoryRow) -> String {
        row.name + ": " + String(row.quantity)
    }
}

let inventoryRenderer = InventoryRenderer()
let inventoryDocument = inventoryRenderer.document(rows: [
    InventoryRow(name: "Notebook", quantity: 2),
    InventoryRow(name: "Pen", quantity: 4)
])
assert(inventoryDocument == "Notebook: 2\nPen: 4")
```

`text(for:)` is the required step. `document(rows:)` is the shared algorithm. `Row` prevents accidentally passing an unrelated model while still allowing another renderer to use a completely different input type.

The algorithm has an explicit behavior: preserve row order and join with newlines. If a conformer must customize document-level behavior too, decide whether that operation should also become a requirement. Adding a same-named method on the concrete type does not turn an extension-only helper into an override point.

## Compose mutable implementation machinery

Suppose document generation needs a record of successful exports. That bookkeeping can live in a concrete helper instead of becoming mutable protocol API.

```swift
final class ExportAudit {
    private(set) var entries: [String] = []

    func record(_ entry: String) {
        entries.append(entry)
    }
}

struct AuditedExporter<E: TextExporting>: TextExporting {
    let wrapped: E
    let audit: ExportAudit

    func render(lines: [String]) -> String {
        let result = wrapped.render(lines: lines)
        audit.record("Rendered " + String(lines.count) + " lines")
        return result
    }
}

let exportAudit = ExportAudit()
let auditedExporter = AuditedExporter(wrapped: PlainTextExporter(), audit: exportAudit)
assert(auditedExporter.render(lines: ["A", "B"]) == "A\nB")
assert(exportAudit.entries == ["Rendered 2 lines"])
```

The wrapper supplies behavior around an existing exporter without modifying its type or requiring it to inherit from a logging base. The audit is intentionally a shared reference: copies of the wrapper will report to the same audit object.

That choice also shows why protocol-oriented code is not automatically pure or free of shared state. The wrapper is a struct, but rendering has an observable effect through its collaborator. Document and synchronize that effect if the object can be used concurrently.

## Beware of defaults that weaken the contract

A default implementation is inherited by conformers that do not provide another witness. That is convenient when the default is semantically valid. It is dangerous when the default merely hides missing work.

For a required persistence operation, an empty default `save` can make a conformer look complete while discarding data. A default that calls `fatalError` keeps the runtime failure of an abstract-method imitation. Both choices undermine the reason for expressing a requirement.

Prefer requiring an implementation when there is no generally correct behavior. If an operation is genuinely optional, model that capability separately or make its optional semantics explicit. Consumers should not discover which implementations work by calling methods and seeing whether they crash.

## Keep protocol size aligned with a consumer

An abstract base may have protected helpers intended only for subclasses. Turning those helpers into public protocol requirements exposes implementation machinery to all clients. Swift does not provide a direct protected-access protocol member that means “implementors can see this but ordinary clients cannot” in the same way some class-based languages do.

A practical response is separating the public consumer contract from internal helpers. Another is composing an internal implementation object. Avoid widening visibility merely so that a large default implementation can reach more state.

This is also where package and module boundaries matter. A design that is convenient inside one source file may become awkward as a public library API because conformers need access to requirements and associated types at compatible access levels.

## When a base class remains the clearer option

A framework can legitimately define one identity-bearing resource with a carefully documented lifecycle and several subclass hooks. Recreating that design as a protocol plus a state holder plus forwarding wrappers may make the ownership story harder to follow.

Choose a base class when shared state and substitutable lifecycle are central to the model. Choose a protocol when interchangeable behavior is central. Combine them when a concrete class should participate in a broader contract. Swift's [Protocols chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) supports that combination; it does not require one paradigm to eliminate the other.

## Exercise: migrate one responsibility at a time

Take a base exporter that stores an audit, defines a crashing `render`, and provides `preview`. Move only the required rendering contract and shared preview algorithm first. Then decide where the audit belongs and whether it is shared across exporter instances.

The migration is successful when a missing renderer fails at compile time, the audit lifetime remains explicit, and consumers see only the operations they need. Counting the number of protocols created is not a useful success criterion.

## Case study: replace an abstract import engine with a typed policy

A legacy import base class often has a sequence like “parse, validate, save,” with a crashing `parse` method that every subclass is supposed to override. It may also store an imported-row count. The reusable part is the sequence and bookkeeping; the variable part is how input becomes domain values.

Move parsing into a protocol and put the mutable progress in a concrete owner. An associated type preserves the relationship between a parser's result and the storage closure that accepts it:

```swift
protocol BatchParsing {
    associatedtype Record
    func parse(_ source: String) throws -> [Record]
}

enum QuantityImportFailure: Error, Equatable {
    case invalidQuantity(String)
    case storageUnavailable
}

struct QuantityParser: BatchParsing {
    func parse(_ source: String) throws -> [Int] {
        try source.split(separator: ",", omittingEmptySubsequences: false).map {
            let field = String($0)
            guard let quantity = Int(field), quantity >= 0 else {
                throw QuantityImportFailure.invalidQuantity(field)
            }
            return quantity
        }
    }
}

final class BatchImportEngine<P: BatchParsing> {
    private let parser: P
    private let commit: ([P.Record]) throws -> Void
    private(set) var successfulBatches = 0

    init(parser: P, commit: @escaping ([P.Record]) throws -> Void) {
        self.parser = parser
        self.commit = commit
    }

    func run(_ source: String) throws -> Int {
        let records = try parser.parse(source)
        try commit(records)
        successfulBatches += 1
        return records.count
    }
}

var storedQuantities: [[Int]] = []
let quantityEngine = BatchImportEngine(parser: QuantityParser()) {
    storedQuantities.append($0)
}
let importedQuantityCount = try quantityEngine.run("2,5,0")
assert(importedQuantityCount == 3)
assert(storedQuantities == [[2, 5, 0]])
assert(quantityEngine.successfulBatches == 1)
```

There is no subclass obligation to call `super`, no abstract method to forget, and no public setter for the success count. The compiler checks that the commit closure accepts the parser's `Record` type. An unrelated parser can produce domain records rather than integers without changing the engine's sequence.

The parser's grammar is intentionally strict: an empty field, whitespace not accepted by `Int`, a negative value, or a non-number is invalid. If the product later wants trimming or a forgiving blank-line policy, change that grammar explicitly and test it. “Reusable import” is not a reason to leave parsing semantics unspecified.

### Define what success means at each boundary

A failure on the second field must not commit the first field accidentally. Parsing builds a complete value array before the engine calls storage:

```swift
do {
    _ = try quantityEngine.run("4,broken,8")
    assertionFailure("Malformed input should fail")
} catch {
    assert(error as? QuantityImportFailure == .invalidQuantity("broken"))
}
assert(storedQuantities == [[2, 5, 0]])
assert(quantityEngine.successfulBatches == 1)

let unavailableEngine = BatchImportEngine(parser: QuantityParser()) { _ in
    throw QuantityImportFailure.storageUnavailable
}
do {
    _ = try unavailableEngine.run("7")
    assertionFailure("Storage should fail")
} catch {
    assert(error as? QuantityImportFailure == .storageUnavailable)
}
assert(unavailableEngine.successfulBatches == 0)
```

The engine records success only after `commit` returns. That does not by itself guarantee that a failing storage implementation performed no partial writes. If atomic persistence is required, the commit contract must promise an all-or-nothing operation and the implementation must use a suitable transaction or replacement strategy.

This is the same semantic issue a base class would have. Replacing inheritance with a protocol does not manufacture atomicity. It makes the relevant boundary easier to name and test.

### Why the state does not belong in the protocol

It might seem convenient to add `var successfulBatches: Int { get set }` to `BatchParsing` and implement the workflow in an extension. That would require every parser to own mutable bookkeeping, expose a writable counter, and participate in an import lifecycle even when used only to preview input.

The parser instead describes one capability. The engine owns the lifecycle of repeated imports. A pure parser can be a small struct; the engine can be a reference when several consumers should observe one progress count. The state and behavior are colocated according to responsibility rather than inherited together because a template method needs access to both.

### Where this design should stop

Do not add associated types for every conceivable dependency preemptively. Here, `Record` prevents an actual mismatch between parsing and committing. The storage closure is sufficient because the engine invokes one operation. If storage later needs transactions, cancellation, or a receipt, introduce a named contract around those requirements then.

For very large inputs, collecting every record before commit may consume too much memory. A streaming import needs a different success model: a transaction spanning chunks, an explicit partial-import receipt, or resumable checkpoints. Changing `parse` into a sequence without revisiting failure behavior would silently change the contract.

### Migrate without confusing cleanup and behavior changes

First run characterization tests against the existing importer: valid input, malformed input midway, storage failure, and repeated calls after failure. Preserve those intended outcomes while replacing the abstract hook. Then remove the old base-class state once no consumer relies on it.

A missing parser implementation should now fail at compile time. A malformed document should still produce a domain error at runtime. Those are different failures, and a successful migration puts each one at the boundary where it can be handled meaningfully.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
