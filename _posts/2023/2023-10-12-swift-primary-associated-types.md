---
layout: post
hidden: true
title: "Primary Associated Types in Swift: Keep the Useful Type Information"
date: "2023-10-12"
last_modified_at: "2023-10-12"
permalink: /swift-primary-associated-types/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Generics", "Swift 5.7"]
thumbnail: assets/img/article-placeholder.svg
---
Primary associated types make an associated type convenient to constrain at a protocol's use site. They let an API say `any ItemLoading<String>` instead of hiding the output type completely, while still permitting several concrete loader implementations.

This syntax arrived in Swift 5.7. It does not turn protocols into ordinary generic concrete types or let one type acquire unlimited conformances for different output choices. Its value is preserving the relationship consumers actually need.

<!--more-->

## Declare the association and identify its primary role

```swift
protocol ItemLoading<Item> {
    associatedtype Item
    func load() -> Item
}

struct FixedTextLoader: ItemLoading {
    let text: String
    func load() -> String { text }
}

struct JoinedTextLoader: ItemLoading {
    let words: [String]
    func load() -> String { words.joined(separator: " ") }
}

struct IntegerLoader: ItemLoading {
    let value: Int
    func load() -> Int { value }
}
```

`Item` is still declared using `associatedtype`. Listing it in the protocol's angle brackets identifies it as a primary associated type that callers can constrain using lightweight syntax.

The conforming declarations do not say `ItemLoading<String>` in their inheritance clauses. Each type declares conformance to `ItemLoading`, and its witnesses determine the associated item. The first two loaders produce strings; the third produces an integer.

[SE-0346](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0346-light-weight-same-type-syntax.md) introduced the primary-associated-type syntax. [SE-0353](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0353-constrained-existential-types.md) supplies the constrained existential use that makes heterogeneous storage especially convenient.

## Constrain an existential without fixing its implementation

```swift
struct TextLoadingFeature {
    let loader: any ItemLoading<String>

    func heading() -> String { loader.load() }
}

let fixedTextFeature = TextLoadingFeature(loader: FixedTextLoader(text: "Swift"))
let joinedTextFeature = TextLoadingFeature(loader: JoinedTextLoader(words: ["Swift", "Protocols"]))
assert(fixedTextFeature.heading() == "Swift")
assert(joinedTextFeature.heading() == "Swift Protocols")
```

The feature hides which loader implementation it receives, while retaining that loading produces a `String`. It needs no cast and cannot accidentally accept an integer loader.

This is a stronger interface than `any ItemLoading` when the consumer needs string operations. It is less specific than storing `FixedTextLoader`, because another conformer with the same output relationship is valid.

A constrained existential does not guarantee the operation is pure, inexpensive, synchronous in a broader system, or thread-safe. Those properties belong to the capability's declared semantics. These examples intentionally perform local calculations.

## Generic code can express the same relationship explicitly

```swift
func textFrom<L: ItemLoading>(_ loader: L) -> String where L.Item == String {
    loader.load()
}

func textFromOpaqueParameter(_ loader: some ItemLoading<String>) -> String {
    loader.load()
}

assert(textFrom(FixedTextLoader(text: "Generic")) == "Generic")
assert(textFromOpaqueParameter(JoinedTextLoader(words: ["Opaque", "parameter"]))
    == "Opaque parameter")
```

The named generic form is useful when several parameters must refer to the same `L` or its associated types. The opaque parameter form is a concise anonymous generic parameter when no such name is needed.

These are not existential storage declarations. A caller selects a concrete conforming argument for a generic invocation, while a property declared `any ItemLoading<String>` stores a hidden conformer behind a fixed existential type.

Choose based on the relationship needed by the surrounding API, not a universal rule that one keyword is always faster. Optimization depends on visibility and workload; the [performance article](/swift-protocol-performance/) examines that separately.

## Heterogeneous collections can retain one common output type

```swift
let stringLoaders: [any ItemLoading<String>] = [
    FixedTextLoader(text: "One"),
    JoinedTextLoader(words: ["Two", "words"])
]
assert(stringLoaders.map { $0.load() } == ["One", "Two words"])
```

Different implementations coexist while the collection retains a useful result type. This often removes the need for a custom closure-backed `AnyStringLoader` wrapper.

A wrapper can still add value if it introduces policy, captures a specific isolation boundary, adapts another interface, or supports older toolchains. Do not write one solely because older Swift guidance said associated-type protocols could not be stored as values.

The array's value semantics do not clone referenced loader state. If one loader is a class holding a mutable cache, copies of the array can still point at that same cache owner.

## Opaque results preserve one implementation choice

```swift
func makePreviewTextLoader() -> some ItemLoading<String> {
    FixedTextLoader(text: "Preview")
}

let previewTextLoader = makePreviewTextLoader()
assert(previewTextLoader.load() == "Preview")
```

The function hides its concrete result type while preserving one underlying type for that opaque declaration. Different calls can return different string values, but ordinary return branches cannot choose unrelated underlying loader types.

When runtime configuration really chooses among unrelated implementations, an existential result expresses that variation:

```swift
func makeConfiguredTextLoader(joinWords: Bool) -> any ItemLoading<String> {
    if joinWords {
        return JoinedTextLoader(words: ["Configured", "text"])
    }
    return FixedTextLoader(text: "Fixed text")
}

assert(makeConfiguredTextLoader(joinWords: true).load() == "Configured text")
assert(makeConfiguredTextLoader(joinWords: false).load() == "Fixed text")
```

Both branches keep `Item == String`. The hidden implementation can vary at runtime because the return value is an existential, not an opaque result declaration with one underlying type.

An enum wrapper is another option for a fixed, exhaustive set of choices. The protocol boundary is useful when adding implementations independently is part of the design.

## Primary does not mean every associated type must be listed

A protocol can have several associated types while designating only the ones most useful to callers as primary. A collection-like capability might expose an element as primary while keeping index and iterator relationships in ordinary requirements.

Do not expose every internal representation type simply to make angle brackets look complete. Primary associated types are part of the protocol's public vocabulary and ordering, so select them according to common use cases.

Constraints on other associations can remain in `where` clauses on generic functions or refining protocols. The lightweight syntax complements those tools; it does not replace every possible relationship with positional arguments.

## Preserve a semantic unit at the boundary

A `String` output is a language-level fact. It does not distinguish a localized title from a server identifier. If mixing those values is dangerous, use a domain wrapper as the associated type.

For example, `ItemLoading<DocumentID>` communicates more than `ItemLoading<String>` when downstream operations must only accept identifiers. The compiler can then preserve both the producer relationship and the domain distinction.

Likewise, make failure and asynchronous work explicit in the requirements if loading crosses an external boundary. Primary associated types are not a reason to hide network effects behind a nonthrowing synchronous method. The [protocol error-design article](/swift-protocol-error-design/) develops an adapter boundary with truthful failures.

## Compare the choices at a use site

| Declaration | Fact retained | Implementation choice |
|---|---|---|
| Concrete loader | Its complete concrete type | Fixed by the declaration |
| Generic `L` with `L.Item == String` | Concrete type relationship and string output | Selected per generic invocation |
| `some ItemLoading<String>` result | One hidden underlying type and string output | Selected by the implementation |
| `any ItemLoading<String>` property | String output | May hold different conformers |

A useful review asks which facts the consumer uses and which facts it should be free to ignore. Too much erasure forces casts or runtime checks. Too much concrete exposure couples the consumer to implementation details.

## Test both branches and the retained output contract

For the configured factory, test every configuration branch and verify the returned loader's behavior through the constrained interface. For generic helpers, compile and run representative concrete conformers. An integer-producing conformance should remain useful elsewhere without being accepted by a string-only feature.

As an exercise, introduce `ItemLoading<[String]>` and a feature that sorts those strings. Keep sorting policy outside the loader if it is presentation-specific. Then compare passing an existential loader with passing the loaded array itself: if the feature needs only one already available snapshot, injecting a loading capability may be unnecessary.

## Worked boundary: preserve a domain type instead of a raw string

Knowing that a loader returns a string does not establish what the string means. Wrap a domain result when it should not be interchangeable with identifiers or configuration values:

```swift
struct LoadedTitle: Equatable {
    let text: String
}

struct DomainTitleLoader: ItemLoading {
    let title: LoadedTitle
    func load() -> LoadedTitle { title }
}

func displayedTitle(from loader: any ItemLoading<LoadedTitle>) -> String {
    "Title: " + loader.load().text
}

let domainTitleLoader = DomainTitleLoader(title: LoadedTitle(text: "Protocols"))
assert(displayedTitle(from: domainTitleLoader) == "Title: Protocols")
```

The consumer retains a semantic distinction as well as the associated-type relationship. A loader returning a raw `String` no longer fits this boundary merely because its content happens to look like a title.

The wrapper here communicates meaning; it does not validate the text. If a title must be nonblank or normalized, add validated construction to `LoadedTitle` or obtain it from a domain operation that guarantees that property. Avoid implying that a named struct automatically enforces rules its initializer does not check.

The same design applies to a document ID, a revision token, or a monetary amount with an explicit currency. Primary associated types let a capability preserve that domain value through generic or existential boundaries.

If the caller already has a `LoadedTitle` and needs only to display it once, pass the value directly. A loading protocol becomes useful when the consumer owns obtaining a new observation or substituting an effect. Retaining more type information is helpful; inventing an unnecessary operation around an already available value is a separate cost.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
