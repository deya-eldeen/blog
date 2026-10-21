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
thumbnail: "images/covers/swift_encapsulation_thumbnail.webp"
thumbnail_ready: true
---
A type is not well encapsulated just because its properties are private. Encapsulation is useful when the type controls the rules that make its state valid. A reservation should not become confirmed with no seats, and a counter should not drift below a limit because a caller forgot a check.

Let's put the rule beside the state it protects.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_encapsulation_thumbnail.webp"
 alt_text="Protected internal state inside an object with one controlled access port"
 caption="Encapsulation in Swift: Protecting Valid State"
 width="640"
 height="400"
%}

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

## Case study: retries after an amendment or cancellation

The first ledger recognizes a retry only while its active reservation remains stored. A real client can retry after the reservation was amended or cancelled. If deleting an entry allows the original request ID to create a new reservation, an old network retry can unexpectedly reopen a booking.

Represent the lifecycle explicitly and retain enough request history to distinguish a repeated command from a new command. The following local model remembers the count originally requested, the current count, and cancellation separately.

```swift
enum BookingReceipt: Equatable {
    case active(count: Int)
    case cancelled
}

enum BookingFailure: Error {
    case invalidCount, conflictingRequest, insufficientCapacity, unknownID, notActive
}

final class AmendableReservations {
    private struct Entry {
        let originalCount: Int
        var currentCount: Int?

        var receipt: BookingReceipt {
            currentCount.map { .active(count: $0) } ?? .cancelled
        }
    }

    private let capacity: Int
    private var entries: [ReservationID: Entry] = [:]

    init(capacity: Int) {
        precondition(capacity >= 0)
        self.capacity = capacity
    }

    var available: Int {
        capacity - entries.values.compactMap { $0.currentCount }.reduce(0, +)
    }

    func reserve(id: ReservationID, count: Int) throws -> BookingReceipt {
        guard count > 0 else { throw BookingFailure.invalidCount }
        if let existing = entries[id] {
            guard existing.originalCount == count else { throw BookingFailure.conflictingRequest }
            return existing.receipt
        }
        guard count <= available else { throw BookingFailure.insufficientCapacity }
        entries[id] = Entry(originalCount: count, currentCount: count)
        return .active(count: count)
    }

    func amend(id: ReservationID, count: Int) throws {
        guard count > 0 else { throw BookingFailure.invalidCount }
        guard var entry = entries[id] else { throw BookingFailure.unknownID }
        guard let previous = entry.currentCount else { throw BookingFailure.notActive }
        guard count <= available + previous else { throw BookingFailure.insufficientCapacity }
        entry.currentCount = count
        entries[id] = entry
    }

    func cancel(id: ReservationID) throws {
        guard var entry = entries[id] else { throw BookingFailure.unknownID }
        entry.currentCount = nil
        entries[id] = entry
    }
}

let amendedBookings = AmendableReservations(capacity: 6)
let originalRequest = ReservationID(rawValue: "booking-100")
_ = try amendedBookings.reserve(id: originalRequest, count: 3)
try amendedBookings.amend(id: originalRequest, count: 4)
let replayAfterAmendment = try amendedBookings.reserve(id: originalRequest, count: 3)
assert(replayAfterAmendment == .active(count: 4))
assert(amendedBookings.available == 2)
try amendedBookings.cancel(id: originalRequest)
try amendedBookings.cancel(id: originalRequest)
let replayAfterCancellation = try amendedBookings.reserve(id: originalRequest, count: 3)
assert(replayAfterCancellation == .cancelled)
assert(amendedBookings.available == 6)
```

A repeated reserve command recognizes the original request but reports the current lifecycle outcome. It does not replay an immutable copy of the first response. Those are distinct idempotency contracts; choose the one the client workflow needs and document it.

The amendment credits the reservation's existing seats before checking the replacement count. It validates before changing the entry, so a rejected amendment does not lose the original booking. Cancellation retains a tombstone rather than deleting request history, making a late reserve retry harmless under the stated contract.

### Express the invariant in terms of authoritative state

The invariant is that the sum of active counts never exceeds capacity, every active count is positive, and a known request ID keeps its original meaning. Availability is derived from the entries, so a second independently maintained count cannot drift.

For a larger system, recalculating availability by scanning every entry may become expensive. You can maintain a cached total, but then every transition must update both the entry and total atomically. The derived implementation is a useful reference when testing the optimized representation.

Retaining tombstones forever is also not a complete production policy. Define how long clients may retry and how long history is retained. If request IDs expire, communicate that boundary; otherwise a cleanup job can silently reintroduce the duplicate-reservation problem.

### Encapsulate the transition, not just each field

Making `entries` private is helpful because callers cannot delete tombstones or manufacture active counts. The stronger boundary is the set of allowed operations: reserve, amend, and cancel. Each preserves a related collection of rules.

A public `setEntry` method would undo much of that protection even if the property remained private. Likewise, returning a mutable `Entry` class to consumers could allow changes that bypass the ledger. The private entry is a value here, and only the owner commits replacements.

If an operation invokes observers, commit the coherent new state before delivering notifications. Consumers should not observe the seat count from before an amendment alongside the entry from after it. Do not call arbitrary external code midway through the validation-and-update sequence.

### Decide who may request a transition

Access control answers which code can call `amend`; it does not establish that a user is authorized to amend a particular reservation. Authorization typically belongs at an application or service boundary with authenticated identity and permission information.

Keep that distinction visible in review. A well-encapsulated domain object can still be exposed through an endpoint that permits the wrong person to invoke it. Conversely, an authorized endpoint can still corrupt data if the domain transition does not preserve its invariant.

### Verify failure atomicity with a small history

After reserving four of six seats, attempt to amend to seven. Capture availability before the operation and verify it remains two after the expected failure. Then cancel and verify a retry returns cancelled rather than allocating seats again.

Also test a reused ID with a different original count, an unknown cancellation, and an amendment after cancellation. Those cases exercise the lifecycle rather than merely checking that one setter rejects a negative number.

The example assumes serial calls. In a concurrent or persisted implementation, the whole read-validate-write transition needs isolation or a transaction. Keeping the transition inside one method makes that boundary visible, but the runtime and storage design must actually enforce it.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
