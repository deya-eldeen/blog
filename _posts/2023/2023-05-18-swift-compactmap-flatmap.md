---
layout: post
hidden: true
title: "compactMap and flatMap in Swift: Missing Values, Nested Values, and Lost Errors"
date: "2023-05-18"
last_modified_at: "2023-05-18"
permalink: /swift-compactmap-flatmap/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Optionals, Collections]
thumbnail: assets/img/article-placeholder.svg
---
`compactMap` and `flatMap` are often taught as two ways to clean up a collection. That description hides the important distinction. One removes missing transformation results; the other joins a layer of structure produced by a transformation.

Read the input type, the closure's result type, and the desired output type. Those three facts usually tell you which operation belongs in the code—and whether using either would discard information the application needs.

<!--more-->

The examples use Swift 5.7. `Sequence.compactMap` was introduced in Swift 4.1; older examples may use the former optional-producing `flatMap` overload. [SE-0187](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0187-introduce-filtermap.md) records that naming change.

## map keeps the shape of a fallible conversion

```swift
let fields = ["12", "bad", "0", "-3"]
let attempts = fields.map { Int($0) }
assert(attempts == [12, nil, 0, -3])

let numbers = fields.compactMap { Int($0) }
assert(numbers == [12, 0, -3])
```

`map` returns `[Int?]`: four positions for four inputs. `compactMap` returns `[Int]`: the non-nil conversion results in input order. Zero is retained because zero is a value, not absence.

This is an information choice. After compacting, the output no longer identifies which position failed. If a CSV importer needs to highlight an invalid cell, keep the original position or a structured result instead.

The conversion also accepts negative integers. If the domain is an unsigned quantity, parsing and validation are separate operations. Successfully constructing an `Int` does not establish that the value is a valid quantity.

## flatMap joins the sequences produced by each input

```swift
struct Shelf {
    let name: String
    let titles: [String]
}

let shelves = [
    Shelf(name: "Swift", titles: ["Functions", "Values"]),
    Shelf(name: "Empty", titles: []),
    Shelf(name: "Design", titles: ["Boundaries"])
]
let groups = shelves.map { $0.titles }
let titles = shelves.flatMap { $0.titles }
assert(groups == [["Functions", "Values"], [], ["Boundaries"]])
assert(titles == ["Functions", "Values", "Boundaries"])
```

The sequence `flatMap` transforms each shelf into a sequence and concatenates those sequences in traversal order. Its output size is the sum of their sizes. An empty inner sequence contributes no elements.

Flattening also removes a relationship: the resulting strings do not carry their shelf names. If the UI needs section ownership, map to a pair or a view model containing both the title and shelf identifier before flattening.

The operation joins one layer. If each transform produces a nested array, another layer remains. Repeatedly flattening until a type looks convenient can erase meaningful grouping.

## Optional has its own map and flatMap

The receiver matters. `Optional.flatMap` does not concatenate arrays; it chains an operation that can itself be absent:

```swift
let text: String? = "42"
let nested: Int?? = text.map { Int($0) }
let parsed: Int? = text.flatMap { Int($0) }
assert(nested != nil)
assert(parsed == 42)

let malformed: String? = "nope"
let presentButInvalid: Int?? = malformed.map { Int($0) }
assert(presentButInvalid != nil)
assert(presentButInvalid! == nil)
assert(malformed.flatMap { Int($0) } == nil)
```

`map` preserves two independent questions: was the string present, and did conversion succeed? `flatMap` collapses those questions into one optional result. Missing input and invalid input both become `nil`.

Nested optionals are not inherently wrong. They can express two layers of absence. They become awkward when the domain actually needs names for the cases. An enum with `.missing`, `.invalid`, and `.value(Int)` is usually clearer at a validation boundary.

## Read the types as a decision table

| Receiver and transform | Operation | Result |
| --- | --- | --- |
| `[String]`, `String -> Int` | `map` | `[Int]` |
| `[String]`, `String -> Int?` | `map` | `[Int?]` |
| `[String]`, `String -> Int?` | `compactMap` | `[Int]` |
| `[Shelf]`, `Shelf -> [String]` | `flatMap` | `[String]` |
| `String?`, `String -> Int?` | `flatMap` | `Int?` |

The shared `flatMap` idea is sequencing a transform that returns the same kind of context, then avoiding an extra nested layer. The concrete behavior comes from that context: arrays collect many values; optionals represent possible absence.

## Case study: import quantities without losing diagnostics

An order import must reject malformed or nonpositive quantities while reporting their original row. `compactMap` alone cannot carry that contract:

```swift
enum QuantityIssue: Error, Equatable {
    case notAnInteger(row: Int, text: String)
    case notPositive(row: Int, value: Int)
}

func quantity(_ text: String, row: Int) -> Result<Int, QuantityIssue> {
    guard let value = Int(text) else {
        return .failure(.notAnInteger(row: row, text: text))
    }
    guard value > 0 else {
        return .failure(.notPositive(row: row, value: value))
    }
    return .success(value)
}

let imported = fields.enumerated().map { index, text in
    quantity(text, row: index + 1)
}
assert(imported == [
    .success(12),
    .failure(.notAnInteger(row: 2, text: "bad")),
    .failure(.notPositive(row: 3, value: 0)),
    .failure(.notPositive(row: 4, value: -3))
])
```

Every input produces a result. Row numbers are deliberately one-based for a user-facing report; real file formats may have headers that change the offset.

The [standard-library Result proposal](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0235-add-result.md) identifies `Result` as available in Swift 5.0. It lets us preserve the reason for failure without throwing away the other rows' outcomes.

## Project successes and failures after preserving them

```swift
let accepted = imported.compactMap { result -> Int? in
    guard case let .success(value) = result else { return nil }
    return value
}
let issues = imported.compactMap { result -> QuantityIssue? in
    guard case let .failure(issue) = result else { return nil }
    return issue
}
assert(accepted == [12])
assert(issues.count == 3)
assert(accepted.count + issues.count == fields.count)
```

Compaction is now appropriate because the full outcomes still exist, and each projection deliberately selects one case. A large import might build both output arrays in a single pass rather than traversing twice.

An application can display all issues and commit nothing, or accept valid rows after explicit review. That is a product decision beyond the collection operation. Preserving the results keeps both choices possible.

## Avoid turning errors into invisible absence

`items.compactMap { try? parse($0) }` combines two policies: convert every thrown error to `nil`, then drop every `nil`. It is concise, but malformed content, unavailable resources, and programmer mistakes can all vanish behind a shorter array.

Use it only when the intended contract is genuinely best effort and losing those reasons is acceptable. If diagnostics matter, return `Result`, collect errors, or propagate a thrown error from a fail-fast import.

Likewise, defaulting an invalid quantity to zero changes a validation error into data. A later sum may look perfectly plausible while hiding rejected rows. The clean-looking type is not proof that the information loss was safe.

## Cost and order remain visible

These eager operations materialize arrays. `flatMap` can produce far more elements than it receives, so estimate output size for expansions such as combinations or token lists. A small input count does not bound output memory.

The examples preserve array traversal order. They do not sort or deduplicate. If identifiers repeat, flattening retains duplicates; if records need ranking, add that as a separate stage with a defined tie policy.

## Preserve context before flattening

A flattened output can keep ownership if each inner transformation attaches it explicitly:

```swift
struct ShelvedTitle: Equatable {
    let shelf: String
    let position: Int
    let title: String
}

let ownedTitles = shelves.flatMap { shelf in
    shelf.titles.enumerated().map { position, title in
        ShelvedTitle(shelf: shelf.name, position: position, title: title)
    }
}
assert(ownedTitles.first == ShelvedTitle(shelf: "Swift", position: 0, title: "Functions"))
assert(ownedTitles.last == ShelvedTitle(shelf: "Design", position: 0, title: "Boundaries"))
assert(ownedTitles.count == titles.count)
```

The position is local to its shelf, while the output array has its own global traversal order. That distinction is useful for navigation and diagnostics. A global row number alone cannot reconstruct the original grouping if shelves later change size.

Names are only demonstration identifiers. If two shelves can share a name, a real ownership model needs a stable shelf ID. Adding context is valuable only when that context actually identifies the source.

## Missing content can be a successful outcome

Sometimes an operation succeeds and legitimately returns no item. `Result<Value?, Failure>` preserves this distinction:

```swift
enum LookupFailure: Error { case unavailable }

let notFound: Result<String?, LookupFailure> = .success(nil)
let found: Result<String?, LookupFailure> = .success("Article")
let unavailable: Result<String?, LookupFailure> = .failure(.unavailable)

func lookupLabel(_ result: Result<String?, LookupFailure>) -> String {
    switch result {
    case .success(nil): return "No match"
    case let .success(.some(value)): return value
    case .failure: return "Lookup unavailable"
    }
}

assert(lookupLabel(notFound) == "No match")
assert(lookupLabel(found) == "Article")
assert(lookupLabel(unavailable) == "Lookup unavailable")
```

Flattening both “no match” and “service unavailable” to nil would prevent the UI from choosing an appropriate retry or empty state. Nested structure is justified when it records independent facts.

The same reasoning applies to an array of results. Compacting only successful values can be an intentional display projection, but the original failures should remain available if the application needs to show incomplete-data status.

## Choose all-or-nothing and partial imports explicitly

The quantity case study preserves every row outcome. A caller can reject the whole batch when `issues` is nonempty, or accept `accepted` after review. These are different workflows sharing the same parser.

If the caller chooses partial acceptance, retain a mapping from each committed quantity to its source row. The current success payload is only an integer, so extending it to include source identity would be appropriate before committing real orders.

A count equality check protects against dropping outcomes, but does not prove correspondence. A bug could duplicate one result and omit another while preserving the count. Tests should verify source identities and specific error positions as well.

For a very large import, process bounded batches and stream diagnostics to an owner with an explicit retention policy. Materializing an array of every result is useful for teaching, but may be an unnecessary memory requirement in production.

## Review a transformation by its information budget

Before accepting a collection refactor, list the information it discards: positions, groups, failure reasons, duplicates, or ordering. Each loss should correspond to a requirement that no longer needs that fact.

For example, a tag suggestion list may intentionally discard duplicate strings after flattening. An inventory ledger usually cannot discard duplicate-looking rows without transaction identity. The same collection syntax can be appropriate in one domain and destructive in another.

This habit makes the types useful design evidence. A shorter result type is a simplification only when its lost distinctions are irrelevant to every downstream decision.

## Exercise: retain shelf ownership

Flatten the shelves into entries containing a shelf name, title, and position within the shelf. Include an empty shelf and repeated titles in different shelves. Verify that the empty shelf contributes no entries and repeated titles retain their distinct ownership.

Then change the quantity importer to distinguish a missing field from an invalid integer. Keep every diagnostic through the report, and decide whether whitespace-only text counts as missing or malformed.

Continue with [Optionals as a Functional Tool](/swift-functional-optionals/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
