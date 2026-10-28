---
layout: post
hidden: true
title: "Adopting Swift Protocols in Structs, Enums, and Classes"
date: "2023-05-11"
last_modified_at: "2023-05-11"
permalink: /swift-protocol-conformance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Value Types", "Conformance"]
thumbnail: assets/img/article-placeholder.svg
---
A protocol describes a capability; conformance connects a concrete type to that capability. Structs, enums, and classes can all conform, but they bring different identity, mutation, and construction rules to the same interface.

A retry budget is a useful example because it has observable state and a clear boundary: consume one attempt if any remain. We will implement that contract three ways, then examine inference, conditional conformance, and the mistakes a successful compiler check cannot prevent.

<!--more-->

## Write one capability with an observable result

```swift
protocol AttemptBudget {
    var remaining: Int { get }
    mutating func consume() -> Bool
}

struct ValueAttemptBudget: AttemptBudget {
    private(set) var remaining: Int

    init(remaining: Int) {
        precondition(remaining >= 0)
        self.remaining = remaining
    }

    mutating func consume() -> Bool {
        guard remaining > 0 else { return false }
        remaining -= 1
        return true
    }
}

var valueBudget = ValueAttemptBudget(remaining: 2)
var copiedBudget = valueBudget
assert(valueBudget.consume())
assert(valueBudget.remaining == 1)
assert(copiedBudget.remaining == 2)
```

The struct owns independent integer state. Copying it gives another budget with the same initial count, and consuming one does not consume the other.

That is appropriate when each operation needs its own retry allowance. It would be wrong if the requirement were a shared account-wide quota. The protocol signature alone does not distinguish those product meanings.

The initializer rejects a negative count as a programming error. If counts come from configuration files, validate them at the configuration boundary and produce a recoverable error before constructing the budget.

## An enum can model meaningful states directly

```swift
enum EnumAttemptBudget: AttemptBudget {
    case available(Int)
    case exhausted

    var remaining: Int {
        switch self {
        case let .available(count): return max(0, count)
        case .exhausted: return 0
        }
    }

    mutating func consume() -> Bool {
        guard remaining > 0 else {
            self = .exhausted
            return false
        }
        let next = remaining - 1
        self = next == 0 ? .exhausted : .available(next)
        return true
    }
}

var enumBudget = EnumAttemptBudget.available(1)
assert(enumBudget.consume())
assert(enumBudget.remaining == 0)
assert(!enumBudget.consume())
```

The operation can replace `self` with another case. That is why a general value-capable contract needs `mutating` when a conformer may change its representation.

Public enum cases can still be constructed with invalid payloads, such as `.available(-2)`. This example normalizes that case to zero when observed and to exhausted when consumed. If invalid construction must be impossible, hide the representation behind a struct with validated factories instead of exposing an unrestricted integer case.

An enum can express states clearly, but it does not automatically validate every associated value. Think about both state combinations and the values carried by each state.

## A class makes sharing intentional

```swift
final class SharedAttemptBudget: AttemptBudget {
    private(set) var remaining: Int

    init(remaining: Int) {
        precondition(remaining >= 0)
        self.remaining = remaining
    }

    func consume() -> Bool {
        guard remaining > 0 else { return false }
        remaining -= 1
        return true
    }
}

var sharedBudget = SharedAttemptBudget(remaining: 2)
let anotherBudgetReference = sharedBudget
assert(sharedBudget.consume())
assert(anotherBudgetReference.remaining == 1)
```

A class implementation omits the `mutating` keyword. It modifies the shared object rather than replacing a value binding. Every alias observes the same remaining count.

The class is final because this example does not support a subclass extension contract. Finality does not synchronize access. Sharing this mutable budget across concurrent tasks would require isolation around the check and decrement as one operation.

## Generic consumers preserve the chosen concrete type

```swift
func drain<B: AttemptBudget>(_ budget: inout B) -> Int {
    var consumed = 0
    while budget.consume() { consumed += 1 }
    return consumed
}

var independentBudget = ValueAttemptBudget(remaining: 3)
assert(drain(&independentBudget) == 3)
assert(independentBudget.remaining == 0)
var referenceBudget = SharedAttemptBudget(remaining: 2)
assert(drain(&referenceBudget) == 2)
assert(referenceBudget.remaining == 0)
```

The generic function sees a mutating requirement, so it requests mutable access compatible with value conformers. That requirement still applies when a particular call uses a class whose witness does not replace the binding.

An existential provides a different storage choice:

```swift
var mixedBudgets: [any AttemptBudget] = [
    ValueAttemptBudget(remaining: 1),
    EnumAttemptBudget.available(2),
    SharedAttemptBudget(remaining: 3)
]
for index in mixedBudgets.indices {
    _ = mixedBudgets[index].consume()
}
assert(mixedBudgets.map { $0.remaining } == [0, 1, 2])
```

The array stores different conforming types behind one interface. Its elements must be accessed mutably to call the mutating requirement. The presence of an existential container does not erase the underlying distinction between a copied value and a reference to shared state.

## Put conformance where ownership and readability support it

A type can declare conformance in its original declaration or in an extension. Keeping a conformance in a dedicated extension can group related methods and make the capability easier to find.

Extensions cannot add stored instance properties. Add the budget's storage to the type declaration; use an extension for the protocol-facing implementation when that organization improves the file.

For types from another module, prefer conformances that your module owns semantically. Conforming an imported type to an imported protocol can collide with a future conformance supplied by either owner. A local wrapper often creates a clearer, independently controlled contract. Newer Swift compilers also diagnose some retroactive conformance situations; syntax to acknowledge that risk does not eliminate the underlying compatibility issue.

Swift documents conformance and extension rules in [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) and [Extensions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/extensions/).

## Conditional conformance expresses a real dependency

A generic wrapper may be equatable only when its payload can be compared:

```swift
struct BudgetSnapshot<Label> {
    let label: Label
    let remaining: Int
}

extension BudgetSnapshot: Equatable where Label: Equatable {}

let beforeBudgetSnapshot = BudgetSnapshot(label: "Download", remaining: 2)
let afterBudgetSnapshot = BudgetSnapshot(label: "Download", remaining: 1)
assert(beforeBudgetSnapshot != afterBudgetSnapshot)
```

The constraint is not a runtime check performed for every comparison. It establishes when the generic type has a valid conformance. The compiler can synthesize equality here because both stored properties are equatable under that condition.

Do not add a blanket conformance and trap when the payload is unsupported. Conditional conformance lets the type system express the actual supported combinations.

A related distinction matters for extensions: adding a convenient method in an extension does not itself declare a protocol conformance. If consumers need `BudgetSnapshot` as an `Equatable` value, the conformance declaration must exist.

## Requirements have semantic laws as well as signatures

For this budget, successful consumption should decrease remaining by one. Failed consumption should leave it at zero. Remaining should never be negative. The compiler cannot establish those laws from the declarations.

A conformer that always returns `true` would make `drain` loop forever. A conformer that decrements by two would violate the per-attempt contract. Tests should exercise the interface's laws across every implementation that consumers will substitute.

Also document termination assumptions. `drain` assumes a finite budget and a consumer with exclusive serialized access for the duration of the loop. If a shared budget can be replenished during draining, the operation needs a different contract and likely a different implementation.

## Choose representation from the lifetime of the state

| Representation | Useful when | Important consequence |
|---|---|---|
| Struct | An operation owns an independent allowance | Copies evolve independently |
| Enum | Distinct states affect behavior | Payload validation still matters |
| Class | Several consumers share one allowance | Aliases observe mutation |

These choices can all participate in protocol-oriented code. The protocol should not disguise a difference the consumer actually needs to understand. A method that promises an independent clone, for example, needs stronger semantics than `AttemptBudget` currently supplies.

As an exercise, add a `replenish` capability separately from consumption. Decide whether every budget should permit it. A fixed allowance can remain consumable without acquiring a meaningless no-op replenishment method. That is a small example of conformance shaping the capability boundary rather than forcing every implementation into one large interface.

## Worked law check: every successful consumption has a cost

A reusable bounded check can exercise each representation without risking an infinite loop against a broken conformer:

```swift
func obeysBudgetLaws(_ make: () -> any AttemptBudget) -> Bool {
    var budget = make()
    let initial = budget.remaining
    guard initial >= 0 else { return false }
    for expectedBefore in stride(from: initial, through: 1, by: -1) {
        guard budget.remaining == expectedBefore, budget.consume() else { return false }
        guard budget.remaining == expectedBefore - 1 else { return false }
    }
    return budget.remaining == 0 && !budget.consume() && budget.remaining == 0
}

struct NonconsumingBudget: AttemptBudget {
    var remaining: Int { 1 }
    mutating func consume() -> Bool { true }
}

assert(obeysBudgetLaws { ValueAttemptBudget(remaining: 3) })
assert(obeysBudgetLaws { EnumAttemptBudget.available(3) })
assert(obeysBudgetLaws { SharedAttemptBudget(remaining: 3) })
assert(obeysBudgetLaws { ValueAttemptBudget(remaining: 0) })
assert(!obeysBudgetLaws { NonconsumingBudget() })
```

The negative control compiles and violates the decrement law. The check detects that violation after one attempt. It does not call the earlier unbounded `drain` helper on an implementation that never exhausts.

The factory must produce a fresh budget for an isolated run. Passing a closure that repeatedly returns one exhausted shared object would test a different lifetime policy and could make results depend on test order.

This check makes no claim about independence after copying a budget. Value-copy and shared-reference semantics are representation-specific properties and deserve separate tests. A protocol can support both while preserving the common consumption law.

For a replenishable quota, termination and the law's scope may need to change. If another owner can add attempts during a check, the operation needs appropriate isolation and a contract describing whether replenishment is visible. Do not weaken the test merely to accommodate an implementation whose semantics belong to a different capability.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
