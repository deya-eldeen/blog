---
layout: post
hidden: true
title: "Associated Types in Swift: Preserve Relationships Between Capabilities"
date: "2023-09-14"
last_modified_at: "2023-09-14"
permalink: /swift-associated-types/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Generics", "Associated Types"]
thumbnail: assets/img/article-placeholder.svg
---
An associated type lets each protocol conformance choose a related concrete type. It is useful when the capability's operations must agree about their input or output without forcing every conformer to use one global model.

The important idea is the relationship. A source produces its item type, a sink accepts its item type, and a pipeline is valid only when those types match. Replacing everything with `Any` would discard exactly the fact the compiler should preserve.

<!--more-->

## Let the conformance choose its item

```swift
protocol PageSource {
    associatedtype Item
    func page() -> [Item]
}

struct ArticlePage: PageSource {
    let titles: [String]
    func page() -> [String] { titles }
}

struct ScorePage: PageSource {
    let scores: [Int]
    func page() -> [Int] { scores }
}

func itemCount<S: PageSource>(_ source: S) -> Int {
    source.page().count
}

assert(itemCount(ArticlePage(titles: ["Protocols", "Generics"])) == 2)
assert(itemCount(ScorePage(scores: [8, 10, 12])) == 3)
```

The compiler infers `ArticlePage.Item` as `String` and `ScorePage.Item` as `Int` from their witnesses. An explicit `typealias Item = String` can document the choice when inference would be harder to follow, but it is unnecessary here.

`associatedtype` does not make `PageSource` a generic concrete type that you instantiate. It declares a type relationship within each conformance. A generic consumer names a conforming `S` and can refer to `S.Item`.

The language guide's [Associated Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/#Associated-Types) section explains the syntax. The examples here focus on what preserving that type relationship buys the consumer.

## Connect a producer and consumer safely

```swift
protocol PageSink {
    associatedtype Item
    mutating func accept(_ items: [Item])
}

struct PageCollector<Element>: PageSink {
    private(set) var items: [Element] = []
    mutating func accept(_ items: [Element]) {
        self.items.append(contentsOf: items)
    }
}

func transfer<S: PageSource, D: PageSink>(
    from source: S,
    into destination: inout D
) where S.Item == D.Item {
    destination.accept(source.page())
}

var titleCollector = PageCollector<String>()
transfer(from: ArticlePage(titles: ["Protocols"]), into: &titleCollector)
assert(titleCollector.items == ["Protocols"])

var scoreCollector = PageCollector<Int>()
transfer(from: ScorePage(scores: [8, 10]), into: &scoreCollector)
assert(scoreCollector.items == [8, 10])
```

The same-type constraint establishes compatibility before any work runs. Passing a score page to the title collector would be rejected at compile time, so no cast or runtime failure branch is needed.

The destination is `inout` because value sinks may change their own state. A class sink could also satisfy the mutating requirement without the keyword, but generic code must remain valid for the value case.

For a real asynchronous pipeline, input/output compatibility is only one contract. Backpressure, cancellation, retries, ordering, and errors require their own design. Associated types prevent one family of mistakes without claiming to solve the whole workflow.

## Requirements retain the associated type inside an algorithm

An extension can build a helper using the relationship without knowing the concrete item:

```swift
extension PageSource {
    func firstItem() -> Item? { page().first }
}

let firstTitle: String? = ArticlePage(titles: ["Swift"]).firstItem()
let firstScore: Int? = ScorePage(scores: []).firstItem()
assert(firstTitle == "Swift")
assert(firstScore == nil)
```

The return type remains meaningful at the call site. A method returning `Any?` would require callers to cast even though the source already knows the item type.

The helper calls `page` once. If a source's page changes across calls, reading `page().isEmpty` and then separately indexing another `page()` could observe different snapshots. Preserving an associated type does not guarantee temporal consistency; the algorithm still needs to use the capability carefully.

## Add capabilities to the associated type when necessary

```swift
extension PageSource where Item: Equatable {
    func contains(_ candidate: Item) -> Bool {
        page().contains(candidate)
    }
}

assert(ArticlePage(titles: ["Swift", "Protocols"]).contains("Protocols"))
assert(!ScorePage(scores: [8, 10]).contains(12))
```

Only this helper needs equality. A source of a non-equatable item can still support counting and reading the first item. Requiring `Item: Equatable` on the whole protocol would narrow every conformance for a convenience operation.

The same reasoning applies to `Codable`, `Hashable`, or `Sendable`. Add a constraint where the algorithm actually uses it, or on the protocol when the capability's definition genuinely requires it for every conformer.

## Erasing the implementation can preserve the item type

Sometimes a property or array must store different source implementations that all produce strings. A small type eraser can hide the implementation while keeping the output relationship:

```swift
struct AnyPageSource<Element>: PageSource {
    private let read: () -> [Element]

    init<S: PageSource>(_ source: S) where S.Item == Element {
        read = { source.page() }
    }

    func page() -> [Element] { read() }
}

struct FixedTitles: PageSource {
    func page() -> [String] { ["Fixed"] }
}

let titleSources: [AnyPageSource<String>] = [
    AnyPageSource(ArticlePage(titles: ["Swift"])),
    AnyPageSource(FixedTitles())
]
assert(titleSources.flatMap { $0.page() } == ["Swift", "Fixed"])
```

The wrapper erases which source implementation it contains, not what its item type is. That is more informative than storing arbitrary `Any` values.

The closure captures the supplied source. A struct source is captured as a value; a class source remains a reference to the same object. The wrapper does not clone live state or make a non-thread-safe source safe to share. Document the retained lifetime and access isolation if the wrapper is used beyond this serial example.

Modern Swift can express many such boundaries with constrained existentials and [Primary Associated Types](/swift-primary-associated-types/), avoiding a custom wrapper when the simpler language feature already fits.

## An existential does not preserve every relationship automatically

A value of `any PageSource` can hold a conformer whose item type is hidden. Modern Swift can open existentials for many generic calls, and some outputs can be represented using erased upper bounds. That does not give two arbitrary sources a known identical item type.

For example, a consumer cannot assume the hidden item type in one existential matches the hidden item type in another. A generic parameter or a constrained existential can retain that fact when the operation needs it.

Avoid old blanket advice that protocols with associated types can never be used as values. Swift's existential support evolved significantly in Swift 5.7. The practical question is which operations remain expressible with the type information retained at this boundary.

## Associated types differ from generic method parameters

An associated type is fixed by a particular conformance. A generic method parameter can vary for each invocation. A source that produces strings cannot choose to produce integers on its next call under the same conformance.

If a decoder method accepts a requested output type for each call, a generic method may fit. If a source always produces one model type, an associated type usually describes the relationship more directly.

Swift does not let one concrete type acquire arbitrary separate conformances to the same protocol for different associated type choices. Use distinct wrapper types when the same underlying object needs several semantic views. This also helps avoid combining unrelated capabilities under one ambiguous method name.

## Test data relationships and effect semantics together

The compiler rejects a string/int pipeline mismatch. Runtime tests should then establish what happens on empty pages, repeated transfers, and source changes. The collector here appends; it does not replace previous items or deduplicate them.

A sink with transactional persistence would need a stronger operation than `accept` if partial writes can fail. A source with pagination tokens would need to preserve the relationship between items and page state, perhaps in a concrete page value.

As an exercise, add a source decorator that filters items using `(Item) -> Bool`. Preserve the associated item type and test that the decorator returns a subset in the original order. Then decide whether the predicate is allowed to perform effects. Keeping the type relationship correct is necessary; a truthful behavioral contract completes the abstraction.

## Worked pipeline: map the item type deliberately

A decorator can preserve a source's item type while filtering, or intentionally change it while mapping. The resulting associated type should describe that difference:

```swift
struct FilteredPageSource<Base: PageSource>: PageSource {
    let base: Base
    let includes: (Base.Item) -> Bool
    func page() -> [Base.Item] { base.page().filter(includes) }
}

struct MappedPageSource<Base: PageSource, Output>: PageSource {
    let base: Base
    let transform: (Base.Item) -> Output
    func page() -> [Output] { base.page().map(transform) }
}

let filteredScores = FilteredPageSource(
    base: ScorePage(scores: [8, 2, 10]), includes: { $0 >= 8 }
)
assert(filteredScores.page() == [8, 10])
let scoreLabels = MappedPageSource(base: filteredScores) { "Score: \($0)" }
var mappedTitleCollector = PageCollector<String>()
transfer(from: scoreLabels, into: &mappedTitleCollector)
assert(mappedTitleCollector.items == ["Score: 8", "Score: 10"])
```

The filter's output remains `Base.Item`. The mapper's output becomes `Output`, inferred as `String` in this call. The existing transfer function then connects the mapped source to a string collector without casts or knowledge of the intermediate score representation.

Order is preserved by both transformations. The source is read once per `page` call. If the underlying source changes between calls, the decorator produces a new observation rather than caching the first one.

The predicates and transformations are function values, so the compiler does not prove they are pure. A closure that logs or increments shared state changes the pipeline's effect behavior even though the associated types remain correct. Document that policy when a reusable algorithm depends on repeatable calculations.

For a real paginated service, mapping only item arrays may lose a continuation token or revision. Put those related facts into a page value and preserve them through the transformation. Associated types are most useful when they keep the entire relationship the consumer needs, not just one convenient element type.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
