---
layout: post
hidden: true
title: "The Law of Demeter in Swift: Reduce Knowledge of Object Internals"
date: "2024-02-01"
last_modified_at: "2024-02-01"
permalink: /swift-law-of-demeter/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Law of Demeter", "Coupling"]
thumbnail: assets/img/article-placeholder.svg
---
A checkout screen that reads `order.customer.account.deliverySettings.preferredAddress` knows the internal shape of several collaborators. Changing account storage can now break checkout code that should only need an address.

The Law of Demeter asks us to limit that knowledge. Its value comes from reducing coupling, not from mechanically counting dots.

<!--more-->

## Notice the information the caller requires

Imagine a screen that needs a shipping label. A deeply nested object traversal forces it to know where an address lives and which intermediate relationships are optional. That information may belong to the order or to a fulfillment policy instead.

The [general formulation from the Demeter project](https://www2.ccs.neu.edu/research/demeter/demeter-method/LawOfDemeter/general-formulation.html) describes limiting a unit's knowledge to closely related units. Treat it as a way to examine dependencies rather than a ban on property access.

## Expose a meaningful operation

```swift
struct Address {
    let city: String
    let street: String

    var shippingLabel: String {
        street + ", " + city
    }
}

struct Customer {
    let name: String
    let deliveryAddress: Address
}

struct Order {
    let number: Int
    let customer: Customer

    func shippingLabel() -> String {
        customer.name + "\n" + customer.deliveryAddress.shippingLabel
    }
}

struct DispatchSummary {
    func text(for order: Order) -> String {
        "Order #" + String(order.number) + "\n" + order.shippingLabel()
    }
}

let order = Order(
    number: 42,
    customer: Customer(
        name: "Maya",
        deliveryAddress: Address(city: "Amman", street: "Garden Street")
    )
)
let summary = DispatchSummary().text(for: order)
assert(summary == "Order #42\nMaya\nGarden Street, Amman")
```

The dispatch summary asks for the information it needs rather than navigating the customer's representation. `Order` coordinates the customer information, while `Address` owns its own formatting detail.

If shipping rules later use a pickup point instead of the customer's address, the summary's dependency can remain stable. That is the benefit to evaluate: which caller no longer needs to change when an internal relationship changes?

## Do not turn every getter into a forwarding chain

Adding `orderCity`, `orderStreet`, `orderPostcode`, and dozens of similar wrappers can simply move the original traversal behind a growing pile of trivial methods. It may also put formatting responsibilities into the wrong domain type.

Choose a meaningful result such as a `ShippingDestination` value, or move the operation to a fulfillment service if it depends on account policy and external configuration. The right boundary follows the decision being made, not a universal rule that an entity must format every display string.

Our small example formats a label inside the model to keep the ownership clear. A localized production app might use a dedicated formatter while still passing it an appropriate address value.

## Chaining is not always coupling trouble

A sequence such as `names.filter { ... }.sorted().joined(separator: ", ")` transforms values through a collection API. It does not necessarily expose the internals of unrelated domain objects.

Likewise, reading fields from a deliberate data transfer value can be appropriate. Such a value may exist specifically to communicate a complete representation. Hiding each field behind another method would add little protection.

Ask what the caller learns about implementation structure and how likely that structure is to change independently. The number of periods is only a rough visual clue.

## Use the rule during change reviews

When changing an account model, look for consumers that unexpectedly need edits. A cluster of callers navigating the same deep path suggests a missing operation or a missing value boundary.

Reduce that specific knowledge, then read the resulting call sites. If their intent is easier to understand and fewer modules depend on storage details, the change has earned its abstraction.

## Locate the knowledge a change would invalidate

A deeply nested read is a warning because it can reveal several decisions owned elsewhere: a customer's account layout, how delivery settings are represented, which address is preferred, and how address fields are formatted.

Changing any one of those details can then require editing a dispatch screen that only wants a label. The useful review question is “which independent changes would force this consumer to change?” That is more precise than counting property accesses.

In the method-oriented formulation, permitted collaborators commonly include the receiver itself, its direct collaborators, arguments, and objects created by the method. The exact application depends on the model. The Demeter project's [general formulation](https://www2.ccs.neu.edu/research/demeter/demeter-method/LawOfDemeter/general-formulation.html) emphasizes limited knowledge of closely related units rather than an absolute prohibition on every returned object.

## Turn structural knowledge into a value boundary

If the UI only needs a shipping summary, it can receive a projection containing exactly that information. The projection is deliberately data; the UI is allowed to inspect its fields.

```swift
struct ShippingSummary: Equatable {
    let heading: String
    let destinationLabel: String
    let requiresDelivery: Bool
}

enum FulfillmentDestination {
    case delivery(Address)
    case pickup(locationName: String)
}

struct FulfillmentOrder {
    let number: Int
    let recipientName: String
    let destination: FulfillmentDestination
}

struct ShippingSummaryBuilder {
    func summary(for order: FulfillmentOrder) -> ShippingSummary {
        switch order.destination {
        case let .delivery(address):
            return ShippingSummary(
                heading: "Order #" + String(order.number),
                destinationLabel: order.recipientName + "\n" + address.shippingLabel,
                requiresDelivery: true
            )
        case let .pickup(locationName):
            return ShippingSummary(
                heading: "Order #" + String(order.number),
                destinationLabel: "Collect from " + locationName,
                requiresDelivery: false
            )
        }
    }
}

let pickupOrder = FulfillmentOrder(
    number: 43,
    recipientName: "Maya",
    destination: .pickup(locationName: "Central branch")
)
let pickupSummary = ShippingSummaryBuilder().summary(for: pickupOrder)
assert(pickupSummary.destinationLabel == "Collect from Central branch")
assert(!pickupSummary.requiresDelivery)
```

The builder owns the fulfillment choice. The UI receives a stable representation and does not have to infer pickup behavior from missing address fields. Adding pickup does not force each display to traverse a new account relationship and reproduce the same condition.

The projection is a snapshot. If the underlying order changes, an already created summary does not update magically. The owner must build and publish another summary. That explicit update boundary is often useful, but a live-observation design would need a different contract.

## Decide whether behavior belongs to the entity or a collaborator

A meaningful operation on `Order` can hide internal structure, but not every display concern belongs inside the order. Localized typography, date formatting, and screen-specific wording may belong to a presenter or formatter that consumes domain values.

The aim is to keep the consumer's knowledge appropriate. A formatter can know address fields because formatting an address is its job. A navigation coordinator should not need those fields merely to decide which screen to show.

This avoids a false solution in which every dependency is removed from the screen by moving the entire screen's behavior into one enormous entity. Responsibilities still need to be coherent after the traversal disappears.

## A forwarding method should earn its name

A method such as `orderCustomerAccountPreferredStreet()` hides punctuation without hiding a concept. The consumer still knows the exact internal path and asks for one fragment of it.

A method such as `shippingDestination()` communicates a domain concept that can survive representation changes. It may return a value containing an address or pickup location, allowing the consumer to handle legitimate variation without learning where those facts were stored.

Sometimes a forwarding method is useful, especially at a boundary designed to expose a simpler facade. The question is whether it creates a meaningful consumer-facing contract or merely repeats an internal property path with parentheses.

## Fluent transformations are a different kind of chain

A chain that filters, sorts, and maps values describes successive operations on a deliberate collection API. It does not necessarily reveal a hidden object graph. The receiver of each operation is a documented result value, not an internal subsystem that the caller accidentally discovered.

Similarly, a builder API may intentionally return itself to support chaining. Assess whether the chain increases knowledge of independently changing collaborators. Mechanical “one dot per line” rewrites can turn clear transformations into noisy temporary variables without reducing coupling.

Optional chaining deserves the same reasoning. `account?.preferences?.address?.city` might be a perfectly valid inspection of an explicit transfer representation, or a leak of several domain decisions. The syntax alone cannot choose between those interpretations.

## Testing can reveal structural coupling

A test that creates five unrelated objects only to make one label available suggests the consumer may be asking the wrong collaborator. A narrow projection or provider can make that test smaller and express what the feature actually needs.

Do not automatically mock every intermediate object. That often freezes the very traversal you hoped to simplify: the test asserts that A called B to obtain C rather than asserting the intended result. If the storage structure changes, both production and test code must be rewritten even though the feature behavior is unchanged.

Use a behavior-focused test for the consumer and separate tests for the adapter or builder that translates the domain structure. Each test then covers an appropriate responsibility.

## Exercise: absorb a representation change

Move the preferred delivery address from a customer account into the order itself so historical orders keep the destination used at checkout. List the consumers affected before and after introducing `ShippingSummary`.

A good boundary should localize the storage-model adjustment to the projection builder or domain operation. The screen may still change if the product now displays a historical-address warning; that is a legitimate behavior change. The goal is containing irrelevant structural knowledge, not preventing every consumer change forever.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
