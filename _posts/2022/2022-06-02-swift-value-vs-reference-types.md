---
layout: post
hidden: true
title: "Value Types vs. Reference Types in Swift: Choosing Ownership"
date: "2022-06-02"
last_modified_at: "2022-06-02"
permalink: /swift-value-vs-reference-types/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Value Types", "Memory"]
thumbnail: "images/covers/swift_value_vs_reference_types_thumbnail.webp"
thumbnail_ready: true
---
Choosing between a struct and a class is often a question about ownership: should two parts of the program share one changing thing, or should each receive its own value? Syntax is the easy part. The surprising bugs begin when a copy does not mean what the caller expects.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_value_vs_reference_types_thumbnail.webp"
 alt_text="Independent document snapshots beside two handles connected to one shared document"
 caption="Value Types vs. Reference Types in Swift: Choosing Ownership"
 width="640"
 height="400"
%}

## Observe the difference at the call site

```swift
struct Draft {
    var title: String
}

final class SharedDraft {
    var title: String

    init(title: String) {
        self.title = title
    }
}

var first = Draft(title: "Original")
var second = first
second.title = "Edited"
assert(first.title == "Original")

let shared = SharedDraft(title: "Original")
let alias = shared
alias.title = "Edited"
assert(shared.title == "Edited")
assert(shared === alias)
```

The second value can change independently of the first. The two class references lead to the same instance. A `let` binding prevents replacing the reference in `alias`; it does not freeze that instance's mutable properties.

This makes values useful for edit forms. The form can work on a draft and commit a result when the user saves. Shared objects are useful when multiple collaborators must observe one continuing session or resource.

## A struct can still contain shared state

Putting a reference inside a struct does not recursively copy the referenced object:

```swift
final class Counter {
    var value = 0
}

struct Snapshot {
    let counter: Counter
}

let original = Snapshot(counter: Counter())
let copied = original
copied.counter.value += 1
assert(original.counter.value == 1)
```

The struct copies its stored reference. Both snapshots still reach the same counter. Its name promises a snapshot, but its behavior does not deliver one.

To create an independent snapshot here, store an `Int` rather than a mutable counter. If sharing is intentional, give the type a name that communicates it and document who may mutate the object.

## Copying is a semantic promise

Swift collections such as `Array` use copy-on-write to preserve independent value behavior while sharing storage until mutation requires separation. That optimization does not make array elements deep copies when the elements are class references.

```swift
let counters = [Counter()]
let otherCounters = counters
otherCounters[0].value = 12
assert(counters[0].value == 12)
```

No array element was replaced. The code mutated an object both arrays reference. Copy-on-write protects the collection's value semantics, not every object reachable from its elements.

Apple discusses these distinctions in [Choosing Between Structures and Classes](https://developer.apple.com/documentation/swift/choosing-between-structures-and-classes). Think about the meaning of a change before deciding how the data should be represented.

## Do not infer performance from the keyword

A struct is not guaranteed to live on the stack, and a class is not automatically too expensive. Capture, escaping, collection storage, and compiler optimization affect allocation. Large copied values and frequently retained objects can both cost time.

Choose semantics first, then measure the workload that matters. Replacing a clear value model with shared mutable objects to avoid hypothetical copying can trade a small cost for difficult ownership bugs.

## Ask three design questions

When selecting a representation, ask whether a caller should be able to edit independently, whether the model has a continuing identity, and whether sharing mutation is part of the contract. If shared state is necessary across concurrent work, also choose an isolation strategy; a class alone provides no synchronization.

For the mechanics of initialization, properties, and equality, continue with [Structures and Classes](/swift-structures-and-classes/). For independent object graphs, see [Deep Copy vs. Shallow Copy](/swift-deep-vs-shallow-copy/).

## A function call copies a value, not necessarily its reachable world

Passing a struct to a function follows value semantics for the struct's stored values. Passing a class reference copies the reference. `inout` adds another distinction: it grants temporary mutable access to a caller's variable, rather than making the argument into a class.

```swift
func renamed(_ draft: Draft, to title: String) -> Draft {
    var updated = draft
    updated.title = title
    return updated
}

func renameInPlace(_ draft: inout Draft, to title: String) {
    draft.title = title
}

var workingDraft = Draft(title: "Before")
let renamedDraft = renamed(workingDraft, to: "Returned value")
assert(workingDraft.title == "Before")
assert(renamedDraft.title == "Returned value")
renameInPlace(&workingDraft, to: "Explicit mutation")
assert(workingDraft.title == "Explicit mutation")
```

The first API advertises a transformation: input value in, replacement value out. The second advertises mutation at the call site with `&`. Neither API needs shared object identity. Choosing between them concerns clarity, composability, and the amount of data involved, not a rule that one syntax is always faster.

Swift enforces exclusive access around mutation. Passing overlapping mutable accesses is not a supported way to obtain shared state. Read [Memory Safety](/swift-memory-safety/) before treating `inout` as an unrestricted reference to storage.

## Implement a small copy-on-write value

Copy-on-write separates **logical independence** from **immediate physical duplication**. Two values can initially share a private storage object if a mutation first makes that storage unique.

```swift
struct ReadingHistory {
    private final class Storage {
        var titles: [String]

        init(titles: [String]) {
            self.titles = titles
        }
    }

    private var storage = Storage(titles: [])

    var titles: [String] {
        storage.titles
    }

    mutating func record(_ title: String) {
        if !isKnownUniquelyReferenced(&storage) {
            storage = Storage(titles: storage.titles)
        }
        storage.titles.append(title)
    }
}

var history = ReadingHistory()
history.record("Swift Basics")
var archivedHistory = history
history.record("Object Modeling")
assert(history.titles == ["Swift Basics", "Object Modeling"])
assert(archivedHistory.titles == ["Swift Basics"])
archivedHistory.record("Testing")
assert(!history.titles.contains("Testing"))
```

Copying `ReadingHistory` initially copies a reference to `Storage`. Before writing, `record` checks uniqueness. If another history shares that storage, it creates a replacement. The public API never exposes the storage object, so a caller cannot bypass the check and mutate it directly.

The returned `[String]` also has value semantics. Its own standard-library storage can be shared until necessary, so creating `Storage(titles: storage.titles)` does not require hand-copying every character immediately. The two layers cooperate without changing the observable promise.

This example has one mutation path and value-type elements. A production implementation must preserve the same rule in every setter, mutable subscript, and modifying accessor. A single reference escape can invalidate the whole design. Apple's [`isKnownUniquelyReferenced` documentation](https://developer.apple.com/documentation/swift/isknownuniquelyreferenced(_:)) explains the uniqueness operation; it is not a replacement for synchronization when storage is accessed concurrently.

## Reference identity and domain identity can disagree

Consider a database user with ID 42 loaded twice. Two separate class instances may both represent that user. `===` reports different allocations, while a domain comparison based on user ID may report the same entity.

Now consider an edit screen with a `UserDraft` struct containing ID 42 and an edited display name. Copying that value creates another draft, not another database user. Value semantics help isolate editing state; the identifier records which entity a later save concerns.

This is why “entities must be classes” is too strong. A value can carry entity identity, and an application service can coordinate updates. A class becomes useful when sharing one changing in-memory representation is itself a requirement.

## Value semantics do not establish a concurrency boundary

A value composed entirely of safely transferable immutable data is convenient to pass between tasks. A struct that wraps an unsafe mutable reference does not become safe because the wrapper is a value type.

Even ordinary value variables can participate in a data race if concurrent code mutates the same variable through shared captures. Two independent copies and two tasks accessing the same captured binding are different situations.

When reviewing concurrency, ask what storage is actually shared, who may mutate it, and what isolation or synchronization protects it. Modern Swift's `Sendable` checking helps express transfer requirements, but the choice of `struct` alone answers none of those questions. Keep that reasoning separate from a stack-versus-heap story.

## Choose a representation from the workflow

| Requirement | Useful starting point | Question to resolve |
|---|---|---|
| Cancel edits without touching the original | Value draft | Are nested fields values too? |
| Several views observe one active session | Shared object | Who owns it, and where may it mutate? |
| Persist an immutable event | Value record | Which fields define its meaning? |
| Coordinate a resource with a lifetime | Object or scoped resource API | When must release happen? |
| Pass data to concurrent work | Transferable snapshot | Does any mutable reference escape? |

These are starting points rather than language restrictions. A concrete workflow should decide whether identity, independent copies, or explicit coordination is necessary.

## A useful experiment before changing representation

Take an editing feature and write three observations: change a copied draft, change a nested child, and cancel the edit. If the original changes in any case where the UI promises independence, trace the reference that made sharing possible.

Then fix the smallest representation boundary that restores the promise. That may mean making one child a value, taking an immutable snapshot, or giving the feature an explicit transaction. Replacing every class with a struct is a much larger change and may leave the actual reference escape intact.

## Case study: an editor with save and cancel

An editor needs three distinct pieces of state: the persisted document, an independent working value, and the version on which editing began. If the working value is a shared reference to the persisted object, cancel cannot reliably undo changes that have already leaked into other screens.

A value draft makes the ordinary editing behavior direct. A version protects against a separate issue: someone else saving while this editor remains open.

```swift
struct ArticleText: Equatable {
    var title: String
    var paragraphs: [String]
}

struct ArticleRevision {
    let version: Int
    let text: ArticleText
}

enum EditorFailure: Error { case conflict }

final class ArticleStore {
    private(set) var revision: ArticleRevision

    init(text: ArticleText) {
        revision = ArticleRevision(version: 0, text: text)
    }

    func save(_ text: ArticleText, expectedVersion: Int) throws {
        guard expectedVersion == revision.version else { throw EditorFailure.conflict }
        revision = ArticleRevision(version: revision.version + 1, text: text)
    }
}

struct ArticleEditor {
    private let original: ArticleRevision
    var draft: ArticleText

    init(revision: ArticleRevision) {
        original = revision
        draft = revision.text
    }

    var hasChanges: Bool { draft != original.text }

    mutating func cancel() { draft = original.text }

    func save(to store: ArticleStore) throws {
        try store.save(draft, expectedVersion: original.version)
    }
}

let articleStore = ArticleStore(text: ArticleText(title: "Before", paragraphs: ["One"]))
var articleEditor = ArticleEditor(revision: articleStore.revision)
articleEditor.draft.paragraphs.append("Two")
assert(articleEditor.hasChanges)
assert(articleStore.revision.text.paragraphs == ["One"])
articleEditor.cancel()
assert(!articleEditor.hasChanges)
articleEditor.draft.title = "Edited"
try articleEditor.save(to: articleStore)
assert(articleStore.revision.text.title == "Edited")
```

The editor's original revision is intentionally fixed. After a successful save, a UI should create or reset an editing session from the newly accepted revision. Reusing the old expected version would correctly produce a conflict on a later save. That lifecycle decision belongs in the feature rather than being hidden inside equality or copying.

The store here is serial and local. A persisted version check must be atomic in the persistence system, and concurrent access needs an isolation strategy. Value semantics provide independent state; they do not implement a distributed transaction.

### Understand what cancel actually guarantees

Cancel replaces the draft value with its original text. It does not undo external effects such as uploads, analytics events, or a request already sent to another system. If editing performs those effects eagerly, a separate compensation policy may be necessary.

This distinction is useful during API review. A method called `cancel` can mean discard local edits, request cancellation of ongoing work, or roll back a transaction. Name and document the operation according to the guarantee actually provided.

A value draft is particularly effective when the product can defer writes until save. When edits must stream live to collaborators, the ownership model needs revisions, operations, or another synchronization design. Simply changing the draft to a class does not solve that problem.

### Add undo as values, then evaluate the cost

```swift
struct TextUndoHistory {
    private var past: [ArticleText] = []
    private(set) var current: ArticleText

    init(initial: ArticleText) { current = initial }

    mutating func apply(_ replacement: ArticleText) {
        guard replacement != current else { return }
        past.append(current)
        current = replacement
    }

    mutating func undo() -> Bool {
        guard let previous = past.popLast() else { return false }
        current = previous
        return true
    }
}

var undoHistory = TextUndoHistory(initial: ArticleText(title: "A", paragraphs: []))
undoHistory.apply(ArticleText(title: "B", paragraphs: []))
undoHistory.apply(ArticleText(title: "B", paragraphs: []))
assert(undoHistory.undo())
assert(undoHistory.current.title == "A")
assert(!undoHistory.undo())
```

This representation is easy to reason about: each history entry is an independent text value. Standard-library copy-on-write may share storage efficiently, but retaining history can still keep large buffers alive. Copy-on-write postpones duplication; it does not promise that an unbounded history consumes no memory.

For very large documents, an operation history or persistent data structure may be more appropriate. Make that change in response to measured memory or editing costs. The simpler snapshot implementation provides a useful correctness reference for a more optimized one.

### Inspect nested state before promising independent editing

If `ArticleText` later gains a mutable `Attachment` class, copying the draft will copy that reference. Renaming the attachment through the draft could then change the supposedly persisted representation too.

Choose among an immutable attachment descriptor, a stable attachment ID with separately coordinated updates, and a deliberate deep-copy operation. The right answer depends on whether an attachment's edits are part of the same save/cancel transaction.

The important review is recursive at the semantic level: which mutations can the draft perform, and which of them must stay local? You do not have to clone every reachable object, but you must account for every permitted mutation that could escape.

### Use identity only for the question it answers

Two equal `ArticleText` values can represent different editing sessions. Two editor sessions can concern the same persistent article while having different original revisions. A session may need a separate ID for request routing or analytics, without changing the text's equality definition.

Keep content equality, persistent identity, and session identity separate. Combining them into one overloaded comparison is a common source of false “no changes” results and accidental overwrites.

A strong ownership design lets each of those questions be answered directly. The value/object choice is one part of that design, alongside transaction boundaries, versioning, and lifetime.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
