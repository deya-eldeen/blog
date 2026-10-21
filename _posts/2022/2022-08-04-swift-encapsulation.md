---
layout: post
hidden: true
title: "Encapsulation in Swift: Protecting Valid State"
date: "2022-08-04"
last_modified_at: "2022-08-04"
permalink: /swift-encapsulation/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Encapsulation", "Access Control"]
thumbnail: assets/img/article-placeholder.svg
---
A type is not well encapsulated just because its properties are private. Encapsulation is useful when the type controls the rules that make its state valid. A reservation should not become confirmed with no seats, and a counter should not drift below a limit because a caller forgot a check.

Let's put the rule beside the state it protects.

<!--more-->

## Replace arbitrary writes with meaningful operations

```swift
enum ReservationError: Error {
    case invalidCapacity
    case invalidSeatCount
    case notEnoughSeats
}

final class SeatReservation {
    let capacity: Int
    private(set) var reserved = 0

    var available: Int {
        capacity - reserved
    }

    init(capacity: Int) throws {
        guard capacity >= 0 else {
            throw ReservationError.invalidCapacity
        }
        self.capacity = capacity
    }

    func reserve(_ count: Int) throws {
        guard count > 0 else {
            throw ReservationError.invalidSeatCount
        }
        guard count <= available else {
            throw ReservationError.notEnoughSeats
        }
        reserved += count
    }
}

let reservation = try SeatReservation(capacity: 4)
try reservation.reserve(3)
assert(reservation.available == 1)
```

`reserved` remains readable but is writable only within the scope allowed by `private(set)`. A caller does not have to remember that the count must stay between zero and capacity: `reserve` owns that rule. The initializer establishes the first valid state.

Throwing an error lets the caller explain an expected failure to the user. A `precondition` would be more appropriate for a programmer mistake that the API explicitly forbids, rather than an ordinary “not enough seats” outcome.

## Avoid a setter-shaped API

A method named `setReserved(_:)` that blindly assigns a number hides the property spelling while exposing the same dangerous operation. Access modifiers are tools; the operation's semantics provide the protection.

Prefer methods that describe an allowed transition: reserve seats, cancel a reservation, or change capacity under specified conditions. Each new transition should preserve the invariant `0 <= reserved <= capacity`.

Be careful when returning reference types. A private array of mutable objects can still leak writable internals if a public method returns those objects. Returning an immutable description or a value snapshot gives callers information without giving them authority over your internal state.

## Keep the interface smaller than the implementation

The caller needs to know how many seats remain and whether a request succeeded. It does not need to know whether reservations are stored as a counter, a set of seat IDs, or database rows.

That boundary lets the implementation evolve. If seat assignment becomes necessary, callers can continue to use a reservation operation rather than rewriting every place that previously edited the count.

Swift's [access control rules](/swift-access-control/) determine which declarations are visible. In particular, `private(set)` restricts a setter without removing the getter. The [language guide](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/) describes the exact scopes.

## Encapsulation is not synchronization

The example assumes calls occur serially. Two concurrent callers can both observe enough capacity before either increments the count. Private state does not make that sequence atomic.

When the reservation crosses concurrency boundaries, protect the operation with an appropriate isolation mechanism, such as an actor or a serial execution context. A server-backed booking system also needs server-side transactional rules. Local encapsulation cannot guarantee availability across devices.

## Test the boundary, not the storage

Exercise a successful request, a zero or negative request, a request above capacity, and a second request that exhausts the remaining seats. Observe results through `available`, `reserved`, and the reported errors.

Those cases describe the type's contract. They continue to make sense after the internal representation changes, which is a practical sign that the boundary is doing useful work.

## Preserve invariants across a complete operation

A valid count is only the beginning of a reservation model. Suppose the client retries a request after losing the response. Incrementing the count again would reserve the same seats twice. The type needs a way to distinguish a new request from a repeat of a completed request.

Here is a local reservation ledger with explicit request identity. It is a separate implementation from `SeatReservation`, adding the rules needed for retries and cancellation:

```swift
struct ReservationID: Hashable {
    let rawValue: String
}

enum LedgerFailure: Error, Equatable {
    case invalidCount
    case full
    case conflictingRetry
    case unknownReservation
}

final class ReservationLedger {
    private let capacity: Int
    private var reservations: [ReservationID: Int] = [:]

    init(capacity: Int) {
        precondition(capacity >= 0)
        self.capacity = capacity
    }

    var availableSeats: Int {
        capacity - reservations.values.reduce(0, +)
    }

    func reserve(id: ReservationID, count: Int) throws {
        guard count > 0 else { throw LedgerFailure.invalidCount }
        if let previousCount = reservations[id] {
            guard previousCount == count else {
                throw LedgerFailure.conflictingRetry
            }
            return
        }
        guard count <= availableSeats else { throw LedgerFailure.full }
        reservations[id] = count
    }

    func cancel(id: ReservationID) throws {
        guard reservations.removeValue(forKey: id) != nil else {
            throw LedgerFailure.unknownReservation
        }
    }
}

let ledger = ReservationLedger(capacity: 5)
let bookingID = ReservationID(rawValue: "request-42")
try ledger.reserve(id: bookingID, count: 3)
try ledger.reserve(id: bookingID, count: 3)
assert(ledger.availableSeats == 2)

do {
    try ledger.reserve(id: bookingID, count: 4)
    assertionFailure("A retry cannot silently change its meaning")
} catch LedgerFailure.conflictingRetry {
    assert(ledger.availableSeats == 2)
}

try ledger.cancel(id: bookingID)
assert(ledger.availableSeats == 5)
```

The public operation describes a reservation request. It does not expose a way to edit the dictionary or assign the available-seat count. Availability is derived from one authoritative representation, so there are no separate counters that can drift apart.

The retry rule is intentionally limited: it recognizes an ID while that reservation exists. After cancellation, the ID can be reused because the ledger removes its record. A payment or distributed booking system may instead need durable request history, retained cancellation records, and a defined retention period. This is a useful example of why an implementation's boundary and guarantees must be stated precisely.

## Read access can still leak write authority

A read-only getter returning a mutable class reference protects only the reference slot. It does not protect the referenced object. The same issue appears when a property is `private(set)` but its value is an array of mutable objects.

If callers need a report, return a value snapshot with the information they may observe. If they need to request a change, provide an operation on the owner. Do not rely on “this is a read-only property” as evidence that the reachable graph is immutable.

Conversely, copying every object just to answer a query can be wasteful and misleading. An immutable value projection, a stable identifier, or a narrow read-only protocol can be better, depending on whether the underlying object may continue changing. Describe whether the result is a snapshot or a live view.

## Validation has to precede visible mutation

A method can enforce each rule individually and still leave invalid state if it mutates before a later check fails. In a transfer operation, subtracting from one account before discovering the destination is invalid creates a partial update.

For in-memory changes, validate all preconditions and calculate replacement state before committing it. If several related properties represent one state transition, an enum or a small state value can let you replace them together. For persistence, use an appropriate transaction; a Swift method call is not a database transaction.

Callbacks create another boundary. If an object notifies observers halfway through an update, an observer can read inconsistent state or call another operation before the first finishes. Finish establishing the new state before invoking external code, and define whether callbacks may reenter the object.

This is why a public API review must consider sequences of operations, not just each setter in isolation.

## Restrict access at the right module boundary

`private` is useful for implementation details inside a type and its same-file extensions. `fileprivate` permits other declarations in the file. `internal`, the default, allows access within the module. A declaration that seems hidden from one source file can still be reachable throughout the module.

When designing a package API, inspect the effective access of exposed types and their members. A public container does not automatically make every member public. A setter can have a narrower access level than its getter, which is useful when clients should observe state but the module retains mutation authority.

The full rules are in Swift's [Access Control chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/). Access restrictions express who may call an operation; they do not prove the operation itself preserves the invariant.

## Test sequences, including rejected operations

For the ledger, a single successful reservation test is insufficient. Test a successful reservation followed by a duplicate, a conflicting duplicate, an over-capacity request, cancellation, and a second cancellation. Check the public state after every rejected operation, not only the thrown error.

The important property is that failures preserve the previously valid state. A method that throws the correct error after already changing the count is still broken.

A useful exercise is to support changing a reservation from three seats to four. Define whether that is a new request or an explicit amendment, whether the amendment keeps the same ID, and how capacity is checked. If you can add the behavior without exposing the storage dictionary, the original encapsulation boundary is earning its place.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
