---
layout: post
hidden: true
title: "The Value of Immutability in Swift: Stable Facts and Explicit Changes"
date: "2023-08-17"
last_modified_at: "2023-08-17"
permalink: /swift-immutability/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Immutability, State]
thumbnail: assets/img/article-placeholder.svg
---
Immutability reduces the number of things that can change while you are reasoning about a calculation. A checkout total is easier to explain when its input is a stable snapshot than when another owner can edit the cart halfway through the work.

Swift's `let` is a useful starting point, but the deeper question is ownership: does this value contain independent facts, or references to objects whose contents can change elsewhere?

<!--more-->

These Swift 5.7 examples build an editable cart as a series of value states. The application still changes; each change becomes an explicit operation with a defined result.

## let freezes the binding according to its type's semantics

```swift
struct Product: Equatable {
    let id: Int
    let priceCents: Int
}

let product = Product(id: 1, priceCents: 500)

final class MutablePrice {
    var cents: Int
    init(cents: Int) { self.cents = cents }
}

let sharedPrice = MutablePrice(cents: 500)
sharedPrice.cents = 700
assert(sharedPrice.cents == 700)
```

The struct's stored values are immutable. The class binding cannot be reassigned, but the referenced object's mutable property can change. A struct containing that class reference would still share the object with other owners.

This distinction explains why “use `let` everywhere” is incomplete advice. Prefer stable bindings, but also inspect the reachable data and the mutation capabilities exposed by its types.

## Model a change as a transformation

```swift
struct CartLine: Equatable {
    let product: Product
    let quantity: Int
}

struct Cart: Equatable {
    let lines: [CartLine]
}

enum CartFailure: Error, Equatable {
    case invalidQuantity
    case missingProduct
}

func settingQuantity(
    _ quantity: Int,
    for productID: Int,
    in cart: Cart
) -> Result<Cart, CartFailure> {
    guard quantity > 0 else { return .failure(.invalidQuantity) }
    guard cart.lines.contains(where: { $0.product.id == productID }) else {
        return .failure(.missingProduct)
    }
    let lines = cart.lines.map { line in
        line.product.id == productID
            ? CartLine(product: line.product, quantity: quantity)
            : line
    }
    return .success(Cart(lines: lines))
}

let original = Cart(lines: [CartLine(product: product, quantity: 1)])
let changed = try settingQuantity(3, for: 1, in: original).get()
assert(original.lines[0].quantity == 1)
assert(changed.lines[0].quantity == 3)
assert(settingQuantity(0, for: 1, in: original) == .failure(.invalidQuantity))
```

The function does not partially change the input before discovering an error. It either returns a replacement cart or a reason for rejection.

The example assumes unique product IDs in a valid cart. With duplicate IDs it updates every match, which may be undesirable. Enforce uniqueness during construction or define duplicates explicitly; immutability does not repair an ambiguous domain model.

Removing a product is a different operation from setting a positive quantity. Treating zero as removal could be valid, but it should be an intentional API contract rather than an accidental consequence of filtering.

## Local mutation is compatible with an immutable interface

Constructing a replacement with `map` is one implementation. Another can copy the local array, update one position, and return it. If callers cannot observe or mutate the intermediate storage, the public behavior is the same value transformation.

This is useful for algorithms that naturally maintain an accumulator, a parser cursor, or a working buffer. Banning every `var` can produce repeated allocation and less readable code without improving the ownership boundary.

The important distinction is between mutation owned by one calculation and shared mutation visible to unrelated callers. A small, locally mutable implementation can expose a stable, predictable contract.

## Snapshots support undo, with a memory policy

```swift
struct CartHistory {
    private(set) var current: Cart
    private var past: [Cart] = []

    init(_ initial: Cart) { current = initial }

    mutating func commit(_ next: Cart) {
        guard next != current else { return }
        past.append(current)
        current = next
    }

    mutating func undo() -> Bool {
        guard let previous = past.popLast() else { return false }
        current = previous
        return true
    }
}

var history = CartHistory(original)
history.commit(changed)
assert(history.current == changed)
assert(history.undo())
assert(history.current == original)
assert(!history.undo())
```

Undo is straightforward because previous states remain meaningful. If the cart contained mutable shared price objects, historical totals could change after a price edit, defeating the snapshot's purpose.

Arrays use copy-on-write storage, so saving a value does not necessarily copy every element immediately. A later mutation may cause copying, and keeping history retains old storage. Bound history length or storage cost according to the product's needs.

Undoing a local cart edit also does not undo an external payment or inventory reservation. Those effects need their own compensating workflow. State history records what the local model was, not a reversible history of the world.

## Immutable input makes caching easier to justify

A calculation depending only on a stable value can be cached by that value or an appropriate key. If the input contains shared mutable state, equal-looking keys can produce different results over time.

Even with immutable inputs, cache identity must include every dependency. A total depending on currency rules, tax jurisdiction, and a pricing version cannot be keyed only by product IDs.

There is also a memory tradeoff: retaining every input and result can cost more than recomputing. Immutability makes a cache easier to reason about; it does not establish that caching is worthwhile.

## Concurrency still needs an ownership policy

Independent immutable snapshots reduce interference between calculations. They do not make every variable holding those snapshots safe to read and replace concurrently.

Two tasks mutating the same `var currentCart` still need synchronization or actor isolation. A struct holding a non-thread-safe reference also needs attention when crossing concurrency boundaries. See the [Swift concurrency guide](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/) for the language's isolation and `Sendable` concepts available in this period.

A common architecture gives one owner responsibility for applying state transitions. Background work receives snapshots and returns results, which the owner accepts or rejects according to request identity and version. Stable values help, while ordering remains explicit.

## Treat external data as a boundary

A network DTO with writable fields can be converted into a validated immutable domain snapshot. That conversion is a useful place to reject negative prices, duplicate IDs, or quantities outside a supported range.

Do not place live service objects inside the snapshot merely to avoid passing another parameter later. A computed property that consults a singleton turns a supposedly stable value into a view of changing external state.

If a field must represent a live resource, name and document that fact. A file handle or image buffer reference can be a valid dependency, but its lifetime and stability contract differ from those of a plain integer.

## Test independence, not physical copies

Verify that transforming one cart leaves the original observable value unchanged. Retain an earlier state, make several later changes, and confirm the earlier state still contains the original quantities and prices.

Do not assert array buffer addresses or exact copy counts in ordinary behavior tests. Copy-on-write is an optimization that may vary with compiler decisions and ownership. Performance tests can measure representative edit and history workloads separately.

Also test rejected transitions: invalid quantity and missing product must leave the current cart unchanged. That protects the all-or-nothing state rule the API promises.

## Case study: a quote is a snapshot, not a live catalog view

A cart can contain a product's price at selection time, while the catalog later changes. Decide whether checkout should honor that snapshot or requote against the catalog. Immutability makes either policy easier to express, but does not choose between them.

```swift
struct CartQuote: Equatable {
    let catalogVersion: Int
    let totalCents: Int
}

func quotedTotal(_ cart: Cart, catalogVersion: Int) -> CartQuote {
    let total = cart.lines.reduce(0) { total, line in
        total + line.product.priceCents * line.quantity
    }
    return CartQuote(catalogVersion: catalogVersion, totalCents: total)
}

let originalQuote = quotedTotal(original, catalogVersion: 1)
let changedQuote = quotedTotal(changed, catalogVersion: 1)
assert(originalQuote.totalCents == 500)
assert(changedQuote.totalCents == 1_500)
assert(quotedTotal(original, catalogVersion: 1) == originalQuote)
```

The version is supplied by the boundary that selected the product snapshot. A caller could lie about it, so a real model should construct the snapshot and version together under one trusted policy.

The example retains the earlier bounded arithmetic assumption. A production pricing engine needs checked multiplication and addition, currency identity, and a deliberate rounding policy for percentages or taxes.

A saved quote may also expire. Represent expiration as a fact and evaluate validity against an explicit current time. Calling a quote immutable does not mean the business is obliged to honor it forever.

## Decide where mutation belongs in an editor

A UI needs somewhere to store the current cart. That owner can replace one value after applying a validated action. The calculation does not need access to the owner's mutable storage.

For example, the owner receives a quantity edit, calls `settingQuantity`, and commits the returned cart only on success. A failure can update a separate validation message while leaving the cart unchanged.

If two edits arrive from background work, the owner also needs an ordering or version policy. A result calculated from an old snapshot should not blindly overwrite a newer cart. Include the source version in the work request and check it when accepting the result.

Immutable values make both versions available for comparison. They do not decide whether to merge, reject, or reapply the obsolete edit. That remains a product rule expressed by the transition owner.

## An event log is different from a list of snapshots

Snapshots record states. An event log records changes such as setting a quantity or removing a product. Replaying events can reconstruct state if the transition rules and required inputs are stable.

If an old event consults today's catalog price while replaying, the result may differ from the original checkout. Record the relevant fact or version when deterministic reconstruction is required.

Events also need schema evolution and error handling. A historical action might refer to a product no longer in the current catalog. Rejecting it, preserving an archived snapshot, or applying a migration are different policies.

For a local undo feature, snapshots may be simpler. For auditing, explicit events plus checkpoints may be more useful. Choose from the questions the application must answer, rather than assuming immutability implies event sourcing.

## Keep equality aligned with the domain

Synthesized `Equatable` compares the cart's stored value fields, which suits no-op detection in this example. If a cart later gains a cache or transient display timestamp, including those fields could make semantically identical carts compare unequal.

Separate domain state from derived or operational metadata where practical. If equality must be customized, document which observable facts it represents and test it across independent constructions.

Using object identity to compare immutable snapshots would be a different contract. Two separately constructed carts can have equal content without sharing storage or identity, and a history mechanism should not need to know how their buffers are allocated.

## Exercise: add redo with a branch rule

Extend `CartHistory` with redo. After undoing, committing a new edit should discard the abandoned future. Verify a no-op commit either preserves or clears redo according to an explicit policy.

Then set a maximum history length and test eviction at the boundary. Explain why a bounded count may still be insufficient when one state contains a very large payload.

Continue with [Value Types and Copy-on-Write](/swift-copy-on-write/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
