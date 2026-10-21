---
layout: post
hidden: true
title: "Deep Copy vs. Shallow Copy in Swift"
date: "2023-11-02"
last_modified_at: "2023-11-02"
permalink: /swift-deep-vs-shallow-copy/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Value Types", "Copying"]
thumbnail: assets/img/article-placeholder.svg
---
Assigning a class reference does not copy its object. Copying a container of class references does not recursively clone its elements either. To make an independent edit buffer, you must decide which state should be duplicated and which relationships should remain shared.

That decision is a domain policy, not a universal operation Swift can infer from an assignment.

<!--more-->

## Follow the references

```swift
final class Paragraph {
    var text: String

    init(text: String) {
        self.text = text
    }
}

final class Document {
    var paragraphs: [Paragraph]

    init(paragraphs: [Paragraph]) {
        self.paragraphs = paragraphs
    }

    func shallowCopy() -> Document {
        Document(paragraphs: paragraphs)
    }

    func deepCopy() -> Document {
        Document(paragraphs: paragraphs.map { Paragraph(text: $0.text) })
    }
}

let original = Document(paragraphs: [Paragraph(text: "Draft")])
let alias = original
assert(alias === original)

let shallow = original.shallowCopy()
assert(shallow !== original)
assert(shallow.paragraphs[0] === original.paragraphs[0])
shallow.paragraphs[0].text = "Shared edit"
assert(original.paragraphs[0].text == "Shared edit")

let independent = original.deepCopy()
independent.paragraphs[0].text = "Independent edit"
assert(original.paragraphs[0].text == "Shared edit")
```

The shallow copy creates a new `Document` and copies its array value, but both arrays contain references to the same paragraph. The deep copy creates new paragraph objects too. For this particular model, the only remaining state is a string value, so the result is independent.

The distinction follows Swift's [value and reference semantics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/classesandstructures/). An array's copy-on-write behavior does not recursively copy objects stored in the array.

## Define how far deep goes

Suppose a paragraph also references a shared spelling dictionary. Should copying the document duplicate that dictionary? Probably not if it is an immutable service. Suppose it references a mutable annotation model. That may need copying.

Specify independence in terms of expected edits: changing the copied text and annotations must not change the original, while a shared read-only dictionary can remain shared. “Deep copy” without that policy is underspecified.

A tree is easy to clone recursively. A graph is harder: two original paragraphs may reference the same annotation, and cycles may exist. A correct graph clone often needs a mapping from original object identity to cloned object so it can preserve intentional aliasing and avoid infinite recursion.

## Value snapshots can simplify the problem

```swift
struct DocumentSnapshot: Equatable {
    var paragraphs: [String]
}

var snapshot = DocumentSnapshot(paragraphs: original.paragraphs.map { $0.text })
var edited = snapshot
edited.paragraphs[0] = "Snapshot edit"
assert(snapshot.paragraphs[0] == "Shared edit")
```

A snapshot contains only the data needed for an independent editing or comparison operation. It does not attempt to clone observers, network sessions, or identity-bearing services.

This can be easier to reason about than giving every object a `copy` method. It also makes explicit what information crosses the boundary.

## NSCopying is not a depth guarantee

Foundation's `NSCopying` protocol asks a type to implement its copying behavior. It does not promise that every referenced object is recursively cloned. Read the particular type's contract rather than assuming a method named `copy` means a fully independent object graph.

Likewise, encoding and decoding a model can produce a separate representation, but it is not a general cloning mechanism. It may omit state, reconstruct identity differently, reject cycles, or perform extra work.

## Verify mutation independence

A useful copy test changes each mutable part of the copy and observes the original. For graphs, also verify whether originally shared children remain shared within the clone as intended.

Test the independence your feature needs, not just that the top-level references differ. `copy !== original` says nothing about the objects reachable from their properties.

## A recursive tree copy can accidentally change a graph

Suppose two sections point to the same annotation object. A naive recursive copy creates a new annotation every time it follows an edge. The copied sections now point to two different annotations, even though the original sections shared one.

Whether that is correct depends on the domain. A graph clone usually aims to preserve its internal sharing while separating the clone from the original. That means two original references to one node should become two references to one cloned node, not two independently cloned nodes.

Cycles make the problem more obvious. Recursing from A to B and back to A without a visited mapping never finishes. The mapping must be populated before following children, so a back-edge can find the clone already in progress.

```swift
final class GraphNote {
    let title: String
    var links: [GraphNote] = []

    init(title: String) {
        self.title = title
    }
}

func cloneGraph(_ root: GraphNote) -> GraphNote {
    var copies: [ObjectIdentifier: GraphNote] = [:]

    func clone(_ node: GraphNote) -> GraphNote {
        let identity = ObjectIdentifier(node)
        if let existing = copies[identity] {
            return existing
        }
        let result = GraphNote(title: node.title)
        copies[identity] = result
        result.links = node.links.map { clone($0) }
        return result
    }

    return clone(root)
}

let graphRoot = GraphNote(title: "Root")
let leftNote = GraphNote(title: "Left")
let rightNote = GraphNote(title: "Right")
let sharedNote = GraphNote(title: "Shared")
graphRoot.links = [leftNote, rightNote]
leftNote.links = [sharedNote]
rightNote.links = [sharedNote]
sharedNote.links = [graphRoot]

let clonedRoot = cloneGraph(graphRoot)
let clonedShared = clonedRoot.links[0].links[0]
assert(clonedRoot !== graphRoot)
assert(clonedShared !== sharedNote)
assert(clonedShared === clonedRoot.links[1].links[0])
assert(clonedShared.links[0] === clonedRoot)

// Break the deliberate strong cycles once the demonstration is complete.
sharedNote.links.removeAll()
clonedShared.links.removeAll()
```

The clone separates object identity across the original and copied graphs while preserving aliasing and cycles inside each graph. It copies every reachable node once. With a dictionary providing expected constant-time lookup, the traversal performs work proportional to the nodes and edges it visits, apart from the cost of copying payload data.

The example intentionally uses strong edges to demonstrate a general graph. A production ownership model may require weak back-edges or another lifetime strategy. Successfully cloning a retain cycle does not make the cycle safe; the cleanup above explicitly breaks it.

The recursive implementation can also exhaust the call stack for an extremely deep graph. An iterative traversal with an explicit work queue is preferable when depth is unbounded or input is untrusted.

## Specify what identity means in the copy

A cloned document may preserve its logical document ID because it represents another snapshot of the same record. A “duplicate document” command may instead need a fresh document ID and fresh IDs for owned annotations. Those are different operations.

Do not let a generic method named `copy` decide that product behavior accidentally. Names such as `snapshot`, `duplicateForEditing`, or `duplicateAsNewDocument` can communicate intent more clearly. The implementation should specify which identities are retained, regenerated, or referenced without copying.

The same applies to shared immutable resources. A font definition or read-only schema may remain shared, while mutable annotations must be independent. Copying everything reachable can be expensive, unnecessary, or impossible when the graph includes resources with external identity.

## External resources are not ordinary fields to clone

A file handle, database transaction, observer registration, or network task has a relationship to the outside world. Copying the integer or object reference that represents it does not create an independent resource with equivalent behavior.

A snapshot should usually contain the data required to reconstruct a useful view, not a second reference to a live transaction. If duplication really requires a new resource, use an explicit factory or operation that can report acquisition failure and define cleanup.

This is where encoding and decoding can mislead. A successful round trip proves the encoded fields were reconstructed under a format's rules. It does not prove observer state, caches, object aliasing, or external resources were duplicated appropriately.

## Copy-on-write moves the copying boundary

A copy-on-write value can provide independent observable mutations without cloning all storage immediately. That is a representation optimization, not a different answer to which state should be independent.

If a value wraps mutable reference elements and does not copy or otherwise protect those elements before mutation, copying its outer storage may still leave shared changes visible. A correct design must account for the mutability of the reachable payload, not just the uniqueness of the container.

For a custom implementation, audit every path that returns a reference or grants mutable access. Returning a private buffer as a public class reference bypasses the copy-on-write barrier. Read [Value Types vs. Reference Types](/swift-value-vs-reference-types/) for a smaller working storage example.

## Write a copy contract before writing the algorithm

| Question | Example answer for an editor snapshot |
|---|---|
| Does the top-level instance change? | Yes, a new representation is created |
| Can editing text affect the original? | No |
| Is one shared annotation still shared inside the clone? | Yes |
| Are persistent record IDs preserved? | Yes, this is the same document's snapshot |
| Are network clients duplicated? | No, they are outside the snapshot |
| Are cycles supported? | Only if the model permits them explicitly |

A different feature may need different answers. The table forces the policy into the open instead of relying on the vague word “deep.”

## Test structure as well as content

Verify equal initial content, independent intended mutations, preserved internal aliases, and distinct original-versus-clone instances. If cycles are supported, include one and ensure traversal terminates. If cycles are forbidden, test rejection rather than silently recursing forever.

As an exercise, change the graph so two distinct nodes share the same title. A correct clone mapping must use instance identity, not title equality. Otherwise the clone would merge distinct objects and lose information despite producing plausible-looking text.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
