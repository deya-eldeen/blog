---
layout: post
hidden: true
title: "Parent and Child Classes in Swift: Inheritance vs. Ownership"
date: "2023-07-06"
last_modified_at: "2023-07-06"
permalink: /swift-parent-child-classes/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Inheritance", "ARC"]
thumbnail: assets/img/article-placeholder.svg
---
“Parent” and “child” can describe two very different relationships. A child class may mean a subclass that inherits behavior. A child object may mean an instance owned by another instance. Confusing these meanings can produce both awkward models and memory leaks.

Use superclass and subclass for the first relationship, and owner and owned object for the second whenever precision helps.

<!--more-->

## Inheritance is a relationship between types

```swift
class Screen {
    func title() -> String {
        "Screen"
    }
}

final class SettingsScreen: Screen {
    override func title() -> String {
        "Settings"
    }
}

let screen: Screen = SettingsScreen()
assert(screen.title() == "Settings")
```

`SettingsScreen` is a kind of `Screen`. The subclass instance includes inherited state and behavior; creating it does not create a separate parent `Screen` object that owns it. The [Inheritance chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/inheritance/) describes this superclass relationship.

Calling `super.title()` from an override invokes the superclass implementation on the same instance. It is not messaging another object stored in a `parent` property.

## Ownership is a relationship between instances

```swift
final class Folder {
    let name: String
    private(set) var files: [FileNode] = []

    init(name: String) {
        self.name = name
    }

    func addFile(named name: String) -> FileNode {
        let file = FileNode(name: name, parent: self)
        files.append(file)
        return file
    }
}

final class FileNode {
    let name: String
    private(set) weak var parent: Folder?

    fileprivate init(name: String, parent: Folder) {
        self.name = name
        self.parent = parent
    }
}

var folder: Folder? = Folder(name: "Documents")
let file = folder!.addFile(named: "Notes.txt")
assert(file.parent === folder)
folder = nil
assert(file.parent == nil)
```

A folder holds strong references to files. Each file has a weak back-reference, so retaining a file does not keep the folder alive. When the folder disappears, the weak reference becomes `nil`.

Neither type inherits from the other. This design models “has a” rather than “is a.” The file can outlive its folder because another owner, the local `file` binding, still retains it.

## Weak is an ownership decision

If both sides strongly retain each other, ARC cannot reclaim the cycle simply by removing outside references. A weak back-reference is useful when the child should not own the parent, but it must match the intended lifetime model. See [ARC's reference-cycle examples](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/).

Do not choose `unowned` just to remove the optional. It asserts a lifetime relationship: the referenced instance must still exist whenever the reference is used. The example deliberately permits a file to survive the folder, so `weak` expresses the safer contract.

## Keep relationship updates consistent

Our API creates a file and attaches it in one operation. A more complete tree might also support removal and reparenting. Those operations must update both directions, reject invalid cycles where appropriate, and decide whether names must be unique.

Making both sides publicly writable invites contradictory state: one folder lists a file while the file points to another folder. Encapsulate the relationship mutation in a small API instead.

When reviewing a “parent-child” design, ask which relationship is intended. Substitutability belongs to inheritance. Retain cycles, back-references, and reparenting belong to object ownership. A class can participate in both, but they need separate reasoning.

## Draw the actual retain graph

For the folder example, the ownership story is:

```text
external owner ─strong→ Folder ─strong→ [FileNode]
                              ←weak──── each FileNode
another owner ─strong────────────────→ one FileNode
```

Dropping the external folder owner can release the folder even while another owner keeps a file alive. The file's parent then becomes `nil`. That optional state is part of the API's meaning, not an inconvenience to eliminate with a forced unwrap.

If files are not allowed to outlive their folders conceptually, you still need to decide how the API enforces that lifetime. An `unowned` reference merely assumes the referenced lifetime remains valid; it does not prevent callers from retaining a child too long. A value representation or an owner-controlled access API may express a stricter lifetime model more clearly.

## Maintain both directions during reparenting

A real tree often needs movement, not just creation. Moving a child means removing it from the old parent's collection, assigning the new parent, and adding it to the new parent's collection. Exposing those steps independently invites contradictory intermediate state.

```swift
final class OutlineNode {
    let name: String
    private(set) weak var parent: OutlineNode?
    private(set) var children: [OutlineNode] = []

    init(name: String) {
        self.name = name
    }

    func attach(_ child: OutlineNode) -> Bool {
        var ancestor: OutlineNode? = self
        while let current = ancestor {
            guard current !== child else { return false }
            ancestor = current.parent
        }

        if child.parent === self { return true }
        child.detach()
        children.append(child)
        child.parent = self
        return true
    }

    func detach() {
        parent?.children.removeAll { $0 === self }
        parent = nil
    }
}

let rootNode = OutlineNode(name: "Root")
let firstBranch = OutlineNode(name: "First")
let secondBranch = OutlineNode(name: "Second")
let leafNode = OutlineNode(name: "Leaf")
assert(rootNode.attach(firstBranch))
assert(rootNode.attach(secondBranch))
assert(firstBranch.attach(leafNode))
assert(secondBranch.attach(leafNode))
assert(firstBranch.children.isEmpty)
assert(leafNode.parent === secondBranch)
assert(!leafNode.attach(rootNode))
assert(rootNode.parent == nil)
```

The ancestor walk rejects attaching a node beneath one of its descendants, including attaching a node to itself. Without that check, a supposed tree could become cyclic even though each parent back-reference is weak. Weak references solve a retain-cycle problem; they do not enforce the logical structure of a tree.

The implementation treats attaching an already attached child as an idempotent success. It also permits detached nodes and duplicate names. Those are explicit policies, not universal rules for trees. A file system model might require unique sibling names and report a structured error rather than a boolean.

All operations here assume serial access. Concurrent moves require a broader isolation strategy so two operations cannot interleave their multi-step updates.

## Object equality is not enough for relationship maintenance

The tree removes children by `===`, identifying the actual instance being moved. If equality were defined only by name, removing “Leaf” could accidentally remove a different node with the same name.

A persisted tree might instead use stable node identifiers because one record can be represented by several loaded objects. In that design, uniqueness and identity resolution belong at an appropriate repository or model boundary. Do not mix instance identity and record identity without deciding which the relationship stores.

This is one reason an in-memory object graph and a database schema are not interchangeable models. The database may enforce a foreign key, while the in-memory model must still coordinate aliases and loaded state.

## Framework containment includes behavior beyond references

In UIKit, view-controller containment is an application-facing example of a parent-child relationship that is not subclassing. A child controller need not be a subclass of its parent controller. The framework's containment APIs also coordinate lifecycle and appearance behavior; assigning a property or adding a view alone is not a complete substitute.

When using a framework, follow its documented containment operations rather than assuming a custom retain graph is the whole contract. Apple's [Implementing a Container View Controller](https://developer.apple.com/library/archive/featuredarticles/ViewControllerPGforiPhoneOS/ImplementingaContainerViewController.html) describes the framework-specific sequence.

That distinction generalizes: a domain relationship may carry notification, ordering, persistence, or lifecycle obligations in addition to retaining an object.

## Watch the other edges in the graph

A weak `parent` property does not guarantee the graph is free of cycles. A parent can store a closure that captures a child, and the child can store a closure that captures the parent. A task or observer registration can add another strong edge that the simple class diagram omitted.

When investigating a leak, list every ownership edge, including closures and callbacks. Check the path from a root owner to the instance and any cycle that remains after that owner releases it. The memory graph debugger can help reveal these edges; a weak parent reference only addresses the one edge it annotates.

## Test graph invariants after successful and rejected moves

Check that every listed child points back to its owner, that moving removes the old association, that repeated attachment does not duplicate entries, and that an attempted cycle leaves the whole graph unchanged.

Then retain a child while releasing its parent and verify the intended optional-parent behavior. A relationship API can pass its movement tests and still have a lifetime bug, so exercise both logical consistency and ownership.

As an exercise, add sibling-name uniqueness. Decide whether a failed move preserves the original parent; it usually should. Validate the destination before detaching the child, so an expected rejection does not accidentally turn a move into a removal.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
