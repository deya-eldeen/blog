---
layout: post
hidden: true
title: "An OOP Refresher Before Protocol-Oriented Swift"
date: "2023-01-12"
last_modified_at: "2023-01-12"
permalink: /swift-oop-refresher-for-pop/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "OOP", "Encapsulation"]
thumbnail: assets/img/article-placeholder.svg
---
Protocol-oriented programming is easier to understand when the object-oriented ideas underneath it are clear. Encapsulation, abstraction, and polymorphism still matter when the implementation is a struct and the shared interface is a protocol. What changes is how the design expresses reuse, identity, and variation.

A small checkout model gives those words something concrete to describe. We will protect a reservation rule, share behavior through a class, and then identify the part that can become a protocol without moving every responsibility into an extension.

<!--more-->

## Begin with a rule rather than a type hierarchy

A checkout reserves some of a limited number of seats. Requests must be positive, and a rejected request must leave availability unchanged. Those rules belong beside the state they protect.

```swift
enum SeatFailure: Error, Equatable {
    case invalidCount
    case insufficientAvailability
}

final class SeatInventory {
    let capacity: Int
    private(set) var reserved = 0
    var available: Int { capacity - reserved }

    init(capacity: Int) {
        precondition(capacity >= 0)
        self.capacity = capacity
    }

    func reserve(_ count: Int) throws {
        guard count > 0 else { throw SeatFailure.invalidCount }
        guard count <= available else {
            throw SeatFailure.insufficientAvailability
        }
        reserved += count
    }
}

let seatInventory = SeatInventory(capacity: 4)
try seatInventory.reserve(3)
assert(seatInventory.available == 1)
do {
    try seatInventory.reserve(2)
    assertionFailure("The second reservation must fail")
} catch {
    assert(error as? SeatFailure == .insufficientAvailability)
}
assert(seatInventory.reserved == 3)
```

This is encapsulation. A caller can inspect availability, but cannot bypass the transition by assigning an arbitrary reservation count. Access control supports the rule; the ordering of validation and mutation actually implements it.

The initializer uses a precondition because a negative capacity represents invalid construction by this program. Reservation failures are ordinary domain outcomes, so they are thrown errors. An application receiving capacity from an untrusted document might instead validate that document and report a recoverable construction error.

The class represents one shared inventory. Two references should observe the same reservations. That identity requirement is independent of whether we later introduce protocols.

## Abstraction gives the consumer a useful question

A ticket screen should not need to know how reservations are stored. It needs the available count and an operation that attempts a reservation. We can describe that smaller view separately:

```swift
protocol SeatReserving: AnyObject {
    var available: Int { get }
    func reserve(_ count: Int) throws
}

extension SeatInventory: SeatReserving {}

struct TicketCheckout {
    let seats: any SeatReserving

    func purchase(_ count: Int) throws -> String {
        try seats.reserve(count)
        return "Reserved \(count) seats"
    }
}

let ticketCheckout = TicketCheckout(seats: seatInventory)
let reservationMessage = try ticketCheckout.purchase(1)
assert(reservationMessage == "Reserved 1 seats")
assert(seatInventory.available == 0)
```

The abstraction names the operation the consumer needs. It does not expose the internal `reserved` counter, require a database connection, or dictate a UI representation.

`AnyObject` is intentional here: this contract represents a shared reservation service with nonmutating reference access. A value-based reservation calculator would need a different mutation and ownership story. Protocols can describe either design, but choosing a protocol does not settle that choice automatically.

Swift's [Protocols chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) explains the language rules for requirements and class-only protocols. The behavioral promise still comes from the API: what does successful reservation guarantee, and what remains unchanged on failure?

## Inheritance reuses implementation within one family

Suppose a receipt presenter has a standard heading and subclasses customize its footer:

```swift
class ReceiptPresenter {
    func footer() -> String { "Thank you" }

    final func receipt(for count: Int) -> String {
        "Seats: \(count)\n" + footer()
    }
}

final class MemberReceiptPresenter: ReceiptPresenter {
    override func footer() -> String { "Thank you, member" }
}

let receiptPresenter: ReceiptPresenter = MemberReceiptPresenter()
assert(receiptPresenter.receipt(for: 2) == "Seats: 2\nThank you, member")
```

There is one instance here, not a child instance containing a separate parent instance. The subclass inherits the base implementation, and the inherited workflow calls the overridden footer on that same instance.

The final wrapper fixes the outer sequence. It does not make the hook pure, fast, or safe against reentrancy. A subclass can still put surprising work in `footer`, so the extension contract deserves documentation.

Inheritance is reasonable when this family and its hooks are intentional. It is less attractive if a completely unrelated receipt renderer must inherit a large presenter merely to obtain one formatting helper.

## Polymorphism is broader than inheritance

The reservation consumer already uses polymorphism. It calls the protocol's operation without knowing the concrete service. A recorded implementation can supply deterministic capacity for a preview:

```swift
final class PreviewSeatService: SeatReserving {
    private(set) var available: Int

    init(available: Int) { self.available = available }

    func reserve(_ count: Int) throws {
        guard count > 0 else { throw SeatFailure.invalidCount }
        guard count <= available else {
            throw SeatFailure.insufficientAvailability
        }
        available -= count
    }
}

let previewSeats = PreviewSeatService(available: 2)
let previewCheckout = TicketCheckout(seats: previewSeats)
let previewMessage = try previewCheckout.purchase(2)
assert(previewMessage == "Reserved 2 seats")
assert(previewSeats.available == 0)
```

Neither concrete service inherits from the other. Both satisfy the capability the checkout requires. That is the bridge into protocol-oriented design: replace a dependency through a meaningful contract without requiring every implementation to share one superclass.

The compiler checks signatures, not full substitutability. A service that returns successfully without reserving anything would satisfy the method shape and violate the contract. Test important promises across implementations, including rejected requests.

## Separate four decisions that often get mixed together

| Decision | Question | Choice in this example |
|---|---|---|
| Encapsulation | Who preserves reservation validity? | The reservation service |
| Identity | Should aliases observe one evolving inventory? | Yes, use a reference owner |
| Abstraction | What does checkout need to request? | Availability and reservation |
| Reuse | Must implementations share stored machinery? | No, conformance is sufficient |

A protocol does not eliminate the need for encapsulation. A struct does not guarantee independence if it contains mutable reference objects. A final class does not become immutable. These are separate properties, and naming them separately makes reviews more precise.

In a concurrent implementation, the availability check and mutation must also be isolated as one operation. The synchronous examples assume serialized access. Wrapping an unsafe inventory in a protocol does not make simultaneous reservations atomic.

## Extract a capability without extracting every field

A common migration copies a superclass's entire public API into a protocol, including caches, loggers, configuration setters, and internal hooks. The consumer now depends on a protocol, but still knows too much about the implementation.

Start from a use site instead. `TicketCheckout` needs one command and one query. If another screen only displays availability, a narrower read-only capability may be appropriate. Do not require it to manufacture a reservation method that it will never use.

Likewise, shared algorithms should depend on actual requirements. A preview formatter can be a function accepting a count. It does not need access to the inventory's storage just because that storage happens to contain the input.

## Notice where an object remains valuable

The inventory owns a meaningful lifecycle: construction establishes a capacity, successful operations change reservations, and multiple consumers share the current result. A reference type makes that role straightforward.

The receipt string is a value. It should not change when another reservation occurs. The checkout is a small coordinator containing a service reference. These different representations cooperate; protocol-oriented programming does not require replacing every class with a struct.

For a persisted service, distinguish the in-memory object's identity from the identity of the venue or performance. Two loaded service objects can represent the same logical inventory. Concurrency control and record identity then belong at the repository or transaction boundary.

## Use a behavioral checklist for the migration

Before introducing a new conformance, write examples for a valid reservation, a nonpositive request, exhaustion, and a failure followed by a valid request. Observe the available count after each operation. Then run those examples through the consumer-facing interface.

For receipt customization, test through a base-typed reference so the intended override path is exercised. For dependency replacement, test through the protocol-backed checkout. Tests written only against concrete methods can miss behavior that changes when values cross the abstraction boundary.

As an exercise, add a cancellation operation. Decide whether it identifies a reservation or merely subtracts a count. A count alone can let one checkout release another checkout's seats; a stable reservation identifier may better express ownership. That domain decision should precede the choice between another protocol requirement and another superclass hook.

Continue with [The Limits of Class Inheritance](/swift-inheritance-limits/) and [OOP vs. POP](/swift-oop-vs-pop/) to see when these mechanisms start pulling a design in different directions.

## Worked contract check: substitute a different reservation service

A protocol boundary earns its place when a consumer can replace an implementation without learning a new set of reservation rules. Turn the earlier assertions into a small reusable check:

```swift
func checkSeatContract(_ make: () -> any SeatReserving) throws {
    let service = make()
    assert(service.available == 4)
    try service.reserve(1)
    assert(service.available == 3)
    for invalid in [0, -1] {
        do {
            try service.reserve(invalid)
            assertionFailure("Nonpositive requests must fail")
        } catch {
            assert(error as? SeatFailure == .invalidCount)
        }
        assert(service.available == 3)
    }
    do {
        try service.reserve(4)
        assertionFailure("Overbooking must fail")
    } catch {
        assert(error as? SeatFailure == .insufficientAvailability)
    }
    assert(service.available == 3)
    try service.reserve(3)
    assert(service.available == 0)
}
try checkSeatContract { SeatInventory(capacity: 4) }
try checkSeatContract { PreviewSeatService(available: 4) }
```

The factory creates fresh state for each implementation. Reusing the same service across checks would make test order part of the result, because the first run exhausts its inventory.

This check establishes an intentional failure priority too. A nonpositive request produces `invalidCount` even if the service has little or no capacity. If consumers rely on the distinction, implementations should preserve it. If they do not, a broader failure assertion may be less brittle.

A shared contract check is still not an integration test. The preview service can pass while a database-backed implementation races between reading availability and committing a reservation. Test that backend's atomic operation separately. The protocol and its tests describe the intended behavior; the infrastructure must supply it under its actual execution conditions.

The exercise connects the OOP vocabulary to observable evidence. Encapsulation preserves state after rejection, abstraction hides the representation, and polymorphism lets the same consumer-facing checks exercise another implementation. Inheritance is one possible implementation-reuse mechanism, and no superclass is required for this particular substitution.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
