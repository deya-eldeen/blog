---
layout: post
hidden: true
title: "Equality, Identity, and Hashable in Swift"
date: "2023-10-05"
last_modified_at: "2023-10-05"
permalink: /swift-equality-identity-hashable/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Hashable", "Equality"]
thumbnail: assets/img/article-placeholder.svg
---
Two user objects can represent the same account without being the same instance. Two values can also produce the same hash without being equal. Equality, identity, and hashing answer different questions, and collection bugs often come from treating them as interchangeable.

<!--more-->

## Equality is a domain decision

```swift
struct Coordinate: Equatable {
    let row: Int
    let column: Int
}

assert(Coordinate(row: 2, column: 3) == Coordinate(row: 2, column: 3))
assert(Coordinate(row: 2, column: 3) != Coordinate(row: 3, column: 2))
```

For this value, comparing both stored properties captures its meaning. Swift can synthesize that conformance because the stored properties conform to `Equatable`.

A database entity may have a different definition of equality. If two in-memory records with the same account ID represent the same account for your application, equality may depend only on that stable ID, even if their display names were loaded at different times.

## Identity asks about one instance

```swift
final class Account: Hashable {
    let id: Int
    var displayName: String

    init(id: Int, displayName: String) {
        self.id = id
        self.displayName = displayName
    }

    static func == (lhs: Account, rhs: Account) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

let first = Account(id: 7, displayName: "Maya")
let second = Account(id: 7, displayName: "Maya A.")
let alias = first
assert(first == second)
assert(first !== second)
assert(first === alias)
```

`===` compares class instance identity. The custom `==` compares the account identity chosen by the domain. A struct does not have class reference identity, even when one of its properties is an ID.

This `Account` deliberately treats display-name changes as irrelevant to equality. If a use case needs to compare complete snapshots, use a separate value representation rather than changing the meaning of equality depending on the caller.

## Hashing must agree with equality

```swift
var accounts: Set<Account> = [first, second]
assert(accounts.count == 1)
first.displayName = "Updated name"
assert(accounts.contains(first))
```

Equal values must feed the same equality-defining components into the hasher in the same order. Unequal values may still collide; a hash is not a unique identifier. Apple's [Hashable documentation](https://developer.apple.com/documentation/swift/hashable) specifies this relationship.

The account's immutable ID drives both equality and hashing. Changing its display name leaves set membership valid because the name participates in neither operation.

If a mutable property participates in hashing, do not mutate it while its object is stored as a set element or dictionary key. The collection's placement decisions would no longer match the key's state. Remove it before the change and insert it again, or use an immutable key instead.

## Keep hashes out of persistence

Swift hash values are not stable identifiers across process executions. Do not write `hashValue` to a database, use it as a durable cache filename, or treat it as a content checksum. Store an explicit stable ID or use an appropriate deterministic hashing algorithm for that separate purpose.

Likewise, never implement equality by comparing hash values. Collisions are permitted, so equal hashes do not prove equal data.

## Review the contract together

When adding `Hashable`, write down what equality means first. Ensure it is reflexive, symmetric, and transitive, and keep the hasher aligned with that definition. For simple value types, synthesized conformance is often the clearest implementation.

Class inheritance complicates custom equality, particularly when subclasses add state. A final entity class or a separate immutable ID value can make the intended relationship easier to maintain.

## Separate entity identity from snapshot equality

An account comparison based on ID answers “do these refer to the same account?” A UI change detector often needs a different question: “does this representation contain the same information as before?”

```swift
struct AccountSnapshot: Equatable {
    let id: Int
    let displayName: String
}

func snapshot(of account: Account) -> AccountSnapshot {
    AccountSnapshot(id: account.id, displayName: account.displayName)
}

let snapshotBeforeRename = snapshot(of: first)
first.displayName = "Maya Updated"
let snapshotAfterRename = snapshot(of: first)
assert(snapshotBeforeRename.id == snapshotAfterRename.id)
assert(snapshotBeforeRename != snapshotAfterRename)
assert(first == second)
```

The account still represents the same entity, while its snapshot changed. One equality operation should not silently switch between those meanings depending on whether it is called by a set, a UI, or persistence code.

If a diffing system compares objects only by entity ID, it may correctly match rows but fail to detect changed content unless content comparison is modeled separately. Explicit ID and snapshot types help make that distinction visible.

## A stable key can make collection ownership clearer

Rather than storing a mutable entity object as a key, store a small immutable identifier and keep the object as the value.

```swift
struct AccountID: Hashable {
    let rawValue: Int
}

var accountDirectory: [AccountID: Account] = [:]
let directoryID = AccountID(rawValue: first.id)
accountDirectory[directoryID] = first
first.displayName = "Current display name"
assert(accountDirectory[directoryID]?.displayName == "Current display name")
```

The key's equality and hash cannot change because its stored field is immutable. The object may evolve without changing where the dictionary finds the entry. This does not solve concurrent mutation or cache consistency, but it removes one avoidable coupling between entity state and collection placement.

An ID wrapper also prevents mixing unrelated identifiers accidentally. An `AccountID` and an `OrderID` can both contain integers without being interchangeable arguments.

## Hashing is a lookup aid, not a proof of equality

A set uses hash information to find candidate entries and equality to distinguish actual matches. Equal values must be hashed consistently from the components used to determine equality. Different values are allowed to collide, so a unique-hash assertion is an invalid test.

Do not test that unequal values have different `hashValue`s. Test collection behavior instead: inserting equal keys should not create two logically distinct entries, different keys should remain distinguishable, and replacing a dictionary value should use the intended key semantics.

For the earlier account model, names are deliberately excluded from equality and hashing. Adding a name to the hash without adding it to equality would make equal accounts inconsistent as keys. Adding a mutable name to both would create a different danger: changing a stored object's name could change its key while it remains inside a collection.

Apple's [Hashable documentation](https://developer.apple.com/documentation/swift/hashable) describes combining the equality-defining components. Do not substitute a hand-rolled numeric hash for `Hasher` without a separate, justified requirement.

## Equality needs algebraic discipline

For ordinary domain values, reason about reflexivity, symmetry, and transitivity. A particularly dangerous design compares a base class by ID but a subclass by ID plus additional fields. A base-typed comparison can then disagree with a subclass-typed comparison, or equality can become asymmetric across the hierarchy.

A final entity class, immutable identifier, or value snapshot can simplify that problem. If equality must work across a hierarchy, define the rules centrally and test cross-type pairs deliberately. The compiler cannot infer the domain's intended equivalence relation.

Floating-point values introduce additional questions because NaN and approximate comparisons do not behave like simple integer equality. “Within a tolerance” is often useful for a numerical assertion but can fail transitivity and therefore be unsuitable as a set key equivalence. Keep approximate closeness as a separate named operation rather than casually replacing `==`.

## ObjectIdentifier is temporary instance identity

When you need to track a particular class instance in an in-memory graph algorithm, `ObjectIdentifier` can provide a hashable representation of that instance identity.

```swift
let firstObjectID = ObjectIdentifier(first)
let aliasObjectID = ObjectIdentifier(alias)
let secondObjectID = ObjectIdentifier(second)
assert(firstObjectID == aliasObjectID)
assert(firstObjectID != secondObjectID)
```

This is useful for a visited set during traversal or a clone mapping. It is not a durable database key. Its meaning is tied to the live instance; after an instance's lifetime ends, you should not treat a saved identity token as a permanent globally unique ID. Apple's [`ObjectIdentifier` documentation](https://developer.apple.com/documentation/swift/objectidentifier) explains that role.

Distinguish that from a domain ID that remains meaningful across launches, devices, and different loaded instances of the same record.

## Test observable collection behavior

Construct two equal accounts with different names and confirm that a set treats them as one entity. Construct a third account with a different ID and confirm it remains distinct. Change a non-key field and verify lookup still behaves correctly.

For a snapshot value, test that a content change produces inequality even when the entity ID is unchanged. Those tests exercise two different contracts rather than expecting one equality implementation to satisfy contradictory needs.

As a design exercise, add an account merge operation. Decide whether the surviving account keeps its ID and how dictionary entries and references to the retired ID are handled. A correct hash implementation cannot compensate for an undefined identity policy at that level.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
