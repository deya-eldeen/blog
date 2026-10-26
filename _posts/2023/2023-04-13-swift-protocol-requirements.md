---
layout: post
hidden: true
title: "Property and Method Requirements in Swift Protocols"
date: "2023-04-13"
last_modified_at: "2023-04-13"
permalink: /swift-protocol-requirements/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "API Design", "Requirements"]
thumbnail: assets/img/article-placeholder.svg
---
A protocol requirement is a promise a consumer can rely on. A property requirement controls which access is available through the interface; a method requirement defines an operation conformers must supply. Neither specifies how the underlying state is represented.

The interesting design work starts after the syntax compiles. Does a setter permit invalid state? Does a mutating operation replace a value or modify a shared object? Can a nonthrowing witness satisfy a throwing requirement? A small editing model makes those questions concrete.

<!--more-->

## A getter requirement leaves storage open

```swift
protocol Titled {
    var title: String { get }
}

struct StoredTitle: Titled {
    let title: String
}

struct ComputedTitle: Titled {
    let words: [String]
    var title: String { words.joined(separator: " ") }
}

func heading(_ item: any Titled) -> String { item.title }
assert(heading(StoredTitle(title: "Protocols")) == "Protocols")
assert(heading(ComputedTitle(words: ["Swift", "Protocols"])) == "Swift Protocols")
```

The consumer receives readable access. The conformer can use an immutable stored property, a mutable stored property, or a computed getter. `{ get }` does not promise that the value is constant over time or inexpensive to calculate.

It also does not make a returned class immutable. A getter returning a mutable object exposes that object's capabilities even though the caller cannot replace the property through this protocol. Use a value snapshot when the consumer needs an independent observation rather than access to a live model.

The language rules are documented in [Property Requirements](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Property-Requirements). The semantic rules, such as whether reading can perform I/O, still need an explicit contract.

## A setter is a capability with consequences

```swift
protocol EditableTitle: Titled {
    var title: String { get set }
}

struct TitleDraft: EditableTitle {
    var title: String
}

func replaceTitle<T: EditableTitle>(_ item: inout T, with title: String) {
    item.title = title
}

var titleDraft = TitleDraft(title: "First")
replaceTitle(&titleDraft, with: "Second")
assert(titleDraft.title == "Second")
```

A get/set requirement cannot be satisfied by a `let` property. It must provide writable access compatible with the requirement. For a value conformer, writing normally requires mutable access to the value, which is why the generic function accepts `inout`.

Now suppose the domain rejects blank titles and must report a validation error. A normal property setter cannot throw. Silently ignoring the assignment would make the operation misleading, and trapping would turn user input into a programmer failure.

Expose an operation that can express the actual outcome instead:

```swift
enum TitleChangeFailure: Error, Equatable { case emptyTitle }

protocol TitleRenaming: Titled {
    mutating func rename(to proposed: String) throws
}

struct ValidatedTitle: TitleRenaming {
    private(set) var title: String

    init(title: String) {
        precondition(!title.isEmpty)
        self.title = title
    }

    mutating func rename(to proposed: String) throws {
        guard !proposed.isEmpty else { throw TitleChangeFailure.emptyTitle }
        title = proposed
    }
}

var validatedTitle = ValidatedTitle(title: "Original")
do {
    try validatedTitle.rename(to: "")
    assertionFailure("Empty input should fail")
} catch {
    assert(error as? TitleChangeFailure == .emptyTitle)
}
assert(validatedTitle.title == "Original")
try validatedTitle.rename(to: "Revised")
assert(validatedTitle.title == "Revised")
```

The rejected command leaves state unchanged. That property is part of the operation's meaning, not something `{ get set }` could communicate by itself.

## Mutating permits value semantics without requiring them

`mutating` allows a struct or enum implementation to change `self`. A class conformer implements the same requirement without writing the `mutating` keyword:

```swift
final class SharedTitle: TitleRenaming {
    private(set) var title: String

    init(title: String) {
        precondition(!title.isEmpty)
        self.title = title
    }

    func rename(to proposed: String) throws {
        guard !proposed.isEmpty else { throw TitleChangeFailure.emptyTitle }
        title = proposed
    }
}

var sharedTitle = SharedTitle(title: "Before")
let sharedTitleAlias = sharedTitle
try sharedTitle.rename(to: "After")
assert(sharedTitleAlias.title == "After")
```

The protocol does not promise independent copies. A copied `ValidatedTitle` has independent string state; an alias of `SharedTitle` observes the same object. If an algorithm relies on value semantics, describe and test that assumption rather than inferring it from a mutating requirement.

An existential storing a value conformer also needs a mutable binding to invoke a mutating requirement. Generic code must be valid for all allowed conformers, including values that actually replace themselves.

## A requirement can be more permissive than one implementation

A throwing requirement allows failure, but a conformer can supply a nonthrowing witness when it always succeeds under that contract. A consumer using the throwing interface must still handle the possibility of failure from other implementations.

```swift
protocol DraftRendering {
    func render() throws -> String
}

struct ConstantDraft: DraftRendering {
    func render() -> String { "Ready" }
}

let constantDraft = ConstantDraft()
assert(constantDraft.render() == "Ready")
let abstractDraft: any DraftRendering = constantDraft
let abstractText = try abstractDraft.render()
assert(abstractText == "Ready")
```

The direct call uses the concrete nonthrowing method. The existential call sees the protocol's throwing contract. This is compatible substitution: the concrete implementation has fewer failure possibilities, not additional ones.

The reverse does not work. A throwing method cannot satisfy a nonthrowing requirement merely because the author expects it to succeed most of the time. The signature must honestly expose the effect consumers need to handle.

## Static requirements belong to the conforming type

Protocols use `static` to spell type method and type property requirements. A requirement can return `Self` to preserve the conforming type relationship:

```swift
protocol EmptyCreating {
    static func empty() -> Self
}

struct NoteBuffer: EmptyCreating {
    var lines: [String]
    static func empty() -> NoteBuffer { NoteBuffer(lines: []) }
}

func freshBuffer<B: EmptyCreating>(of type: B.Type) -> B {
    B.empty()
}

let noteBuffer: NoteBuffer = freshBuffer(of: NoteBuffer.self)
assert(noteBuffer.lines.isEmpty)
```

The metatype argument selects the type-level capability. It does not ask for an existing instance just to construct an empty one.

`Self` is valuable when the relationship matters to the caller. If a factory intentionally chooses among unrelated implementations, a concrete `Self` requirement may be too restrictive. An existential result or a separate factory contract can describe that different operation more accurately.

## Initializers and subscripts are contracts too

An initializer requirement describes a construction path every conformer must support. A non-final class satisfying it generally needs `required` so subclasses remain constructible through that contract. A final class has no subclass obligation.

Do not add an initializer requirement simply because two implementations currently have similar constructors. The consumer may only need an already constructed capability. Configuration and resource acquisition can remain at the composition root.

A subscript requirement similarly declares indexed access, not storage. Its preconditions must be clear. A collection-style integer subscript might trap for an invalid index; a domain lookup by identifier might instead return an optional. Avoid disguising recoverable absence as an indexing precondition.

## Review signatures and semantics together

| Requirement shape | What it permits | What it does not establish |
|---|---|---|
| `{ get }` | Readable access | Immutability, purity, or cheap reads |
| `{ get set }` | Replacement through the interface | Validation failure reporting |
| `mutating func` | Value mutation or replacement | Guaranteed value semantics |
| `func ... throws` | Recoverable failure | Atomicity or a particular error vocabulary |
| `static func ... -> Self` | Type-related construction | Runtime choice among unrelated types |

A meaningful requirement is usually smaller than a concrete implementation's public API. Start with a consumer operation and include only what it needs. Exposing caches or counters merely to support an extension helper can make the protocol less encapsulated than the concrete type it replaces.

## Test the interface consumers actually use

For title renaming, verify valid input, empty input, repeated renaming, and state after rejection. Exercise both a value conformer and a class conformer if the contract supports both. For a throwing requirement with a nonthrowing witness, test through the existential or generic consumer as well as directly.

As an exercise, add a maximum title length measured in `String.count`. Name the unit explicitly: user-perceived characters differ from UTF-8 bytes. Then decide whether validation belongs in one shared pure function or a default protocol implementation. In either case, the domain type should remain responsible for committing only a valid transition.

## Worked edge case: a mutating requirement is not a transaction

A loop invoking a valid mutating requirement can still leave a partially changed batch if a later conformer rejects the input:

```swift
enum RenameLengthFailure: Error { case tooLong }

struct LengthLimitedTitle: TitleRenaming {
    private(set) var title: String
    let maximum: Int

    mutating func rename(to proposed: String) throws {
        guard !proposed.isEmpty else { throw TitleChangeFailure.emptyTitle }
        guard proposed.count <= maximum else { throw RenameLengthFailure.tooLong }
        title = proposed
    }
}

func renameSequentially(_ items: inout [any TitleRenaming], to title: String) throws {
    for index in items.indices { try items[index].rename(to: title) }
}

var renameBatch: [any TitleRenaming] = [
    ValidatedTitle(title: "A"),
    LengthLimitedTitle(title: "B", maximum: 2)
]
do {
    try renameSequentially(&renameBatch, to: "Long")
    assertionFailure("The second item should reject this title")
} catch RenameLengthFailure.tooLong {}
assert(renameBatch[0].title == "Long")
assert(renameBatch[1].title == "B")
```

Every individual implementation preserves its own invariant. The sequence does not provide all-or-nothing behavior across implementations. `throws` reports failure; it does not roll back earlier mutations.

Copying the outer array before the loop would not solve the general case because this protocol also permits class conformers. Copies could still reference the same objects. A real transactional batch needs a stronger design: validate all proposed values before committing, return independent replacement values, or use an owner with an atomic batch operation.

That is a useful limit to recognize when choosing requirements. A small interface should express the operation consumers actually need. If consumers need an atomic rename batch, making them assemble it from a single-item command may expose too weak a capability.

The example intentionally asserts the partial outcome so the limitation remains visible. Do not turn this helper into a production atomic API by adding a misleading name or an empty catch block.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
