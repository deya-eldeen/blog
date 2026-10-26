---
layout: post
hidden: true
title: "Constrained Protocol Extensions in Swift: Make the Requirement Visible"
date: "2023-08-10"
last_modified_at: "2023-08-10"
permalink: /swift-constrained-protocol-extensions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Extensions", "Generics"]
thumbnail: assets/img/article-placeholder.svg
---
A constrained extension makes an operation available only when the compiler can establish the extra facts that operation needs. It can add equality-based helpers, exploit collection capabilities, or provide a default implementation for a narrower family of conformers.

The constraint is checked from static type information. It is not a runtime test that searches for a more specialized helper whenever a value passes through generic code.

<!--more-->

## Start with a capability that leaves one type open

```swift
protocol RecordSource {
    associatedtype Record
    func records() -> [Record]
}

struct ArrayRecords<Element>: RecordSource {
    let values: [Element]
    func records() -> [Element] { values }
}

extension RecordSource {
    var recordCount: Int { records().count }
}

let cityRecords = ArrayRecords(values: ["Amman", "Irbid", "Amman"])
assert(cityRecords.recordCount == 3)
```

Every source can count the array it returns. Equality or ordering is unnecessary for that operation, so the general protocol should not require records to be equatable or comparable merely because another helper will need those capabilities.

The call to `records` produces an array value. This teaching contract assumes a local snapshot, not an implicit network request. If reading can perform expensive work or fail, expose that in the operation's name and signature rather than hiding it behind a seemingly cheap computed property.

## Require equality only where the algorithm uses it

```swift
extension RecordSource where Record: Equatable {
    func containsRecord(_ candidate: Record) -> Bool {
        records().contains(candidate)
    }
}

assert(cityRecords.containsRecord("Irbid"))
assert(!cityRecords.containsRecord("Aqaba"))
```

The extension can call equality-based collection operations because its constraint establishes the needed conformance. A source of non-equatable records still conforms to `RecordSource`; it simply does not gain this helper.

This keeps the base capability usable for records containing closures, resources, or other data without a sensible equality definition. Do not invent equality solely to satisfy an algorithm the consumer does not actually need.

Swift's [Generic Where Clauses](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/#Generic-Where-Clauses) and [Adding Constraints to Protocol Extensions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Adding-Constraints-to-Protocol-Extensions) describe the relevant language mechanisms.

## Add a stronger algorithm under a stronger constraint

Deduplication can use hashing while preserving first-occurrence order:

```swift
extension RecordSource where Record: Hashable {
    func uniqueRecords() -> [Record] {
        var seen: Set<Record> = []
        return records().filter { seen.insert($0).inserted }
    }
}

assert(cityRecords.uniqueRecords() == ["Amman", "Irbid"])
```

Returning `Array(Set(records()))` would not express this ordering contract. The explicit seen set makes the intended result clear: keep the first occurrence of each equal value in the original order.

The hashable constraint does not promise that hash values are unique or stable across launches. Equality determines duplicates; hashing supports lookup. A custom record conformance must keep those operations consistent.

The algorithm uses additional storage proportional to the number of distinct records. Whether that is appropriate depends on the actual dataset and how expensive equality and hashing are. A constrained extension makes an algorithm available, not universally optimal.

## Same-type constraints express domain relationships

Sometimes the needed fact is an exact associated type, not another conformance:

```swift
extension RecordSource where Record == String {
    func nonemptyRecords() -> [String] {
        records().filter { !$0.isEmpty }
    }
}

let textRecords = ArrayRecords(values: ["", "Swift", " "])
assert(textRecords.nonemptyRecords() == ["Swift", " "])
```

This helper defines empty as `String.isEmpty`; whitespace remains a nonempty string. If the product wants trimming, make that a separate named normalization rule and test it explicitly.

The equality constraint gives the body access to string operations. An unconstrained `Record` does not support `isEmpty` just because the particular caller happens to provide strings later.

For relationships between two collaborators, constraints such as `Source.Record == Sink.Record` can prevent connecting incompatible pipelines. The [Associated Types article](/swift-associated-types/) develops that design with a source and destination.

## Generic bodies use the constraints they declare

Extension-only overloads make static selection easy to observe:

```swift
protocol SourceNaming {}

extension SourceNaming {
    func sourceKind() -> String { "source" }
}

extension SourceNaming where Self: Collection {
    func sourceKind() -> String { "collection" }
}

extension Array: SourceNaming {}

func generalKind<S: SourceNaming>(_ source: S) -> String {
    source.sourceKind()
}

func collectionKind<S: SourceNaming & Collection>(_ source: S) -> String {
    source.sourceKind()
}

assert([1, 2].sourceKind() == "collection")
assert(generalKind([1, 2]) == "source")
assert(collectionKind([1, 2]) == "collection")
```

The body of `generalKind` only knows `SourceNaming`. It cannot assume `Collection`, so it selects the helper valid under its declared information. Passing an array later does not re-type-check that body as if its parameter had originally been declared `[Int]`.

The more constrained wrapper can use the collection helper. Optimization must preserve these observable choices even if the compiler specializes the generated machine code.

This example intentionally uses extension-only methods. Requirement witness selection is a related but distinct mechanism; see [Default Implementations](/swift-protocol-default-implementations/) before treating every same-named extension method as an override.

## Overlapping constraints can make an API hard to read

Two constrained helpers may both apply without one clearly expressing a stronger requirement than the other. A type can be both a collection and a custom logging source, for example. Competing same-named defaults can then require disambiguation or an explicit implementation.

Prefer names describing different semantics when the operations actually differ. `sortedRecords` and `uniqueRecords` explain separate algorithms. Reusing one vague name for several unrelated behaviors forces callers to reconstruct overload rules.

When two constraints intentionally describe the same operation, test the call shapes your public API invites: concrete values, generic wrappers, and protocol values. A method that behaves one way in a demo can behave differently after a consumer adds another abstraction layer.

## Distinguish extension availability from conformance

An extension on `Wrapper where Element: Equatable` can add a method. That does not automatically declare `Wrapper: Equatable`. Conditional conformance requires its own declaration and must satisfy the protocol's requirements.

Similarly, a specialized default implementation does not add stored state. If deduplication should cache results across calls, a concrete wrapper or owner must hold the cache and define invalidation. The extension can express an algorithm from available operations, not attach hidden mutable storage to every conformer.

Keeping these mechanisms separate prevents a common design mistake: assuming an available method creates every conformance that method resembles.

## Review whether the added constraint is justified

A generic API requiring `Hashable` can exclude callers that only need a count. Put the stronger constraint at the smallest boundary using it. Conversely, a helper that repeatedly casts records to `String` is likely hiding a constraint it should declare.

A useful review proceeds from the body: list the operations it performs, identify which capabilities make them valid, and put those facts in the signature. Then read the signature from the caller's perspective. Does it request a coherent capability or a collection of implementation accidents?

## Test availability and behavior separately

A compile check establishes that a supported call has enough type information. Runtime assertions establish ordering, duplication, and edge cases. Neither replaces the other.

For `uniqueRecords`, test empty input, all duplicates, and distinct values with equal-looking display fields but different domain identity. For `nonemptyRecords`, include whitespace to make the chosen rule visible. For the overload example, keep the paired generic wrappers because they protect a specific static-selection expectation.

As an exercise, add `maximumRecord` where `Record: Comparable`, returning an optional for an empty source. Decide whether returning the first of equal maxima matters and whether comparison is appropriate for the domain. A valid `where` clause proves the operation is available; the result contract still needs design.

## Worked extension: select a maximum under an explicit ordering

Complete the maximum exercise with a domain record whose tie-breaker is visible:

```swift
struct RankedRecord: Comparable {
    let score: Int
    let id: Int

    static func < (lhs: RankedRecord, rhs: RankedRecord) -> Bool {
        if lhs.score != rhs.score { return lhs.score < rhs.score }
        return lhs.id < rhs.id
    }
}

extension RecordSource where Record: Comparable {
    func maximumRecord() -> Record? { records().max() }
}

let rankedRecords = ArrayRecords(values: [
    RankedRecord(score: 8, id: 1),
    RankedRecord(score: 3, id: 9),
    RankedRecord(score: 8, id: 2)
])
assert(rankedRecords.maximumRecord() == RankedRecord(score: 8, id: 2))
let noRankedRecords = ArrayRecords<RankedRecord>(values: [])
assert(noRankedRecords.maximumRecord() == nil)
```

Both score and identifier participate in this ordering. Two records with the same score remain ordered by identifier, and synthesized equality uses those same stored fields. A score-only comparison paired with full-record equality would need careful review against `Comparable`'s ordering laws.

The helper needs only the maximum, so sorting the whole array first would do unnecessary work. The constraint makes comparison available, while the algorithm still determines how much work occurs.

If different screens need different ranking policies, a universal `Comparable` conformance may be the wrong home for that policy. Accepting a comparison closure can make the choice local without changing what equality means for the record everywhere else.

That is another distinction worth preserving: constraints express facts about types, while parameters can express varying policy for one operation. Use a type-wide ordering only when it is genuinely part of the type's meaning.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
