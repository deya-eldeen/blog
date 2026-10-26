---
layout: post
hidden: true
title: "Thinking Functionally in Swift: Functions as Values"
date: "2022-11-17"
last_modified_at: "2022-11-17"
permalink: /swift-functions-as-values/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Functions, Closures]
thumbnail: assets/img/article-placeholder.svg
---
A shipping calculator starts with one rule. Then express delivery arrives, followed by regional pricing and a promotion. If every variation becomes another branch inside a manager, the calculation becomes difficult to change without understanding the manager's entire environment.

Swift functions are values. You can store a rule, pass it to another calculation, and build a new rule by combining existing ones. The useful change is in the design: the workflow can stay fixed while the decision it uses becomes an explicit input.

<!--more-->

The examples use Swift 5.7 and integer cents. The rates are illustrative business rules, and all supplied quantities are deliberately small enough to avoid integer overflow.

## Name the input and output before naming a class

Our checkout needs a parcel and a shipping price. Start with that relationship:

```swift
struct Parcel {
    let weightGrams: Int
    let isRemote: Bool

    init(weightGrams: Int, isRemote: Bool) {
        precondition(weightGrams >= 0)
        self.weightGrams = weightGrams
        self.isRemote = isRemote
    }
}

typealias ShippingRule = (Parcel) -> Int

func standardShipping(_ parcel: Parcel) -> Int {
    let weightCharge = (parcel.weightGrams / 500) * 100
    return 300 + weightCharge + (parcel.isRemote ? 400 : 0)
}

let standard: ShippingRule = standardShipping
let sample = Parcel(weightGrams: 1_000, isRemote: false)
assert(standard(sample) == 500)
```

The type alias gives a domain name to a function shape. It does not create a new nominal type: another `(Parcel) -> Int` can be assigned to it. That is convenient here, but a wrapper struct is useful if the compiler must distinguish shipping rules from unrelated functions with the same signature.

A named function can be assigned without calling it. `standardShipping` refers to the function; `standardShipping(sample)` runs it. This distinction becomes important when you want to configure behavior now and apply it later.

The integer result also has a contract: it means cents, not dollars, and it must be nonnegative. A function signature cannot express that entire contract. A production money type could make currency and valid ranges explicit.

## Pass the decision into a stable workflow

```swift
struct ShippingQuote: Equatable {
    let shippingCents: Int
    let totalCents: Int
}

func quote(
    subtotalCents: Int,
    parcel: Parcel,
    shipping: ShippingRule
) -> ShippingQuote {
    precondition(subtotalCents >= 0)
    let cost = shipping(parcel)
    precondition(cost >= 0)
    return ShippingQuote(
        shippingCents: cost,
        totalCents: subtotalCents + cost
    )
}

let quoted = quote(subtotalCents: 2_000, parcel: sample, shipping: standard)
assert(quoted == ShippingQuote(shippingCents: 500, totalCents: 2_500))
let pickup = quote(subtotalCents: 2_000, parcel: sample, shipping: { _ in 0 })
assert(pickup.totalCents == 2_000)
```

`quote` does not discover a global shipping service or switch on every delivery method. Its caller supplies one capability. The workflow calculates a cost once and uses that result consistently.

The preconditions protect programmer assumptions in this demonstration. They are unsuitable for reporting malformed checkout input to a customer. Validate external data before constructing the domain values, or return a modeled failure if invalid inputs are expected.

An injected function is often enough when the consumer needs one operation. A protocol becomes useful when several related operations must share a contract, such as quoting, booking, and cancelling a delivery. Choose the boundary from what the consumer needs.

## Return a configured function

A promotion changes the cost calculation while retaining the original rule:

```swift
func discountedShipping(
    by discountCents: Int,
    using base: @escaping ShippingRule
) -> ShippingRule {
    precondition(discountCents >= 0)
    return { parcel in
        max(0, base(parcel) - discountCents)
    }
}

let promotional = discountedShipping(by: 200, using: standard)
assert(promotional(sample) == 300)
assert(standard(sample) == 500)
let freePromotion = discountedShipping(by: 10_000, using: standard)
assert(freePromotion(sample) == 0)
```

The returned closure captures the base rule and the discount. The factory runs once; the resulting rule can run many times. Because the closure stores `base` beyond the factory call, that parameter is `@escaping`.

This is partial application in a practical form: bind configuration now to get a function with fewer remaining inputs. It does not require a custom operator or a generic library. The name explains what has been configured.

Notice that the promotion preserves the base rule. There is no mutable global rate to restore after a test or an expired campaign. Different checkouts can receive different values independently.

## Composition has an order

Suppose we add a handling charge after calculating shipping:

```swift
func addingHandling(
    _ handlingCents: Int,
    to base: @escaping ShippingRule
) -> ShippingRule {
    precondition(handlingCents >= 0)
    return { parcel in base(parcel) + handlingCents }
}

let tinyParcel = Parcel(weightGrams: 0, isRemote: false)
let discountThenHandling = addingHandling(
    100, to: discountedShipping(by: 400, using: standard)
)
let handlingThenDiscount = discountedShipping(
    by: 400, using: addingHandling(100, to: standard)
)
assert(discountThenHandling(tinyParcel) == 100)
assert(handlingThenDiscount(tinyParcel) == 0)
```

Both functions are valid, but they implement different policies because the discount is clamped at zero. Ask whether a promotion covers handling, and encode that decision in the composition order.

This is why “small functions compose” is only the beginning. Their contracts must agree about units, failure, rounding, and order. Giving every function the same type does not make every arrangement meaningful.

## A function value can still hide mutable state

A closure can capture a class, read the clock, or change a variable. First-class functions provide a mechanism; they do not guarantee purity.

```swift
var campaignDiscount = 100
let changingRule: ShippingRule = { parcel in
    max(0, standardShipping(parcel) - campaignDiscount)
}

assert(changingRule(sample) == 400)
campaignDiscount = 250
assert(changingRule(sample) == 250)

let frozenRule: ShippingRule = { [campaignDiscount] parcel in
    max(0, standardShipping(parcel) - campaignDiscount)
}
campaignDiscount = 0
assert(frozenRule(sample) == 250)
```

The first closure reads a captured variable whose contents can change. The capture list in the second takes the current integer value. Capturing a class reference this way would retain the same object, not freeze that object's mutable properties.

Stored closures also participate in ownership. If an object stores a rule that strongly captures that same object, it can form a retain cycle. Keep simple policies independent of their coordinator where possible; inspect lifetime explicitly when a closure needs an owner.

## Test policies and workflows separately

The pickup example verifies quote arithmetic without requiring the real rate calculation. Separate cases for `standardShipping` should cover weight boundaries, remote destinations, and zero weight. Cases for the discount should cover a discount below, equal to, and above the base price.

A useful law is that a nonnegative discount never increases a nonnegative shipping cost. Another is that creating a promotional rule does not alter the original. These describe behavior across many parcels, rather than one convenient example.

Do not replace every implementation with a stub in every test. A small integration test should still quote with the real composed policy so that wrong wiring, such as applying the handling charge in the wrong place, remains visible.

## When a value needs more than a closure

Function values cannot be meaningfully compared for equality, serialized as business configuration, or inspected to reveal which campaign they represent. If a UI needs to show the selected delivery policy or persist it, store an enum or struct describing that policy and interpret it into a function.

Similarly, a policy that requires an identifier, an explanation, and several operations may deserve a named type. Functional design does not require removing types. It makes the transformation itself explicit so you can decide what additional structure is justified.

## Case study: keep saved choices separate from executable behavior

A checkout may need to save the selected promotion in a draft order. A closure cannot explain itself when the draft is reopened. Store the choice as data and interpret it at assembly time:

```swift
enum DeliveryChoice {
    case standard
    case pickup
    case promotional(discountCents: Int)
}

func shippingRule(for choice: DeliveryChoice) -> ShippingRule {
    switch choice {
    case .standard:
        return standardShipping
    case .pickup:
        return { _ in 0 }
    case let .promotional(discount):
        return discountedShipping(by: discount, using: standardShipping)
    }
}

let selectedChoice = DeliveryChoice.promotional(discountCents: 200)
let restoredRule = shippingRule(for: selectedChoice)
assert(restoredRule(sample) == promotional(sample))
```

The enum describes intent, while the function performs the calculation. An editor can show a label for each case and validate its associated configuration before producing the executable rule.

Persisting a choice also creates a versioning question. If the standard tariff changes next month, should an old draft receive the current tariff or retain its original quote? Saving only `.standard` chooses neither policy by itself. A durable quote may need a tariff version, currency, expiration, and the resulting amount.

Keep this distinction explicit: a saved request to calculate a price is different from a committed price offered to a customer. Both can be values, but they carry different guarantees.

## Check a policy across a meaningful domain

Examples show concrete outcomes. A small exhaustive grid can check the discount law across weight and region combinations without adding a testing dependency:

```swift
for grams in [0, 499, 500, 999, 1_000] {
    for remote in [false, true] {
        let parcel = Parcel(weightGrams: grams, isRemote: remote)
        let baseCost = standard(parcel)
        for discount in [0, 100, 500, 10_000] {
            let rule = discountedShipping(by: discount, using: standard)
            let cost = rule(parcel)
            assert(cost >= 0 && cost <= baseCost)
            if discount == 0 { assert(cost == baseCost) }
        }
    }
}
```

The selected weights straddle the division boundaries. Those boundaries deserve direct cases because a general “the price is nonnegative” property would not detect an off-by-one bracket error.

This grid does not prove behavior for every possible integer. It tests a representative domain under the arithmetic assumptions. If production accepts very large weights, establish a maximum or add checked arithmetic instead of extending the grid until it happens to crash.

## Function signatures need behavioral documentation

`ShippingRule` says what can be called, but cannot say whether the function is deterministic, nonnegative, fast, or free of external effects. Document those requirements at the consumer boundary.

For example, `quote` assumes a synchronous calculation that can be called locally. Substituting a function that blocks on a remote carrier service would preserve the Swift type while violating the workflow's latency expectations. A remote quote operation deserves an asynchronous effect interface and explicit failure handling.

The same applies to units. Two functions returning `Int` can disagree about cents versus whole currency units. A `Money` value with a currency identifier can prevent accidental combination, while a domain-specific quantity type can distinguish grams from kilograms.

Type aliases improve vocabulary but do not create those protections. Introduce nominal types when confusing two same-shaped values is a realistic source of errors, rather than wrapping every integer automatically.

## Let the owner assemble policy once

A checkout coordinator can receive its configured shipping rule in its initializer and reuse it throughout one quote calculation. That makes the selection visible at construction and avoids scattered calls to a mutable settings singleton.

If the user changes delivery method, produce a new configured rule and recalculate from the current checkout snapshot. Do not mutate a captured discount halfway through a multi-step total calculation. A single calculation should observe one coherent policy version.

This approach leaves room for objects where identity and lifetime matter. The coordinator owns the active checkout; the function owns a local pricing decision; the saved choice records user intent. Each boundary corresponds to a concrete responsibility.

## Exercise: introduce a free-shipping threshold

Change the input from `Parcel` to a checkout context containing both the parcel and subtotal. Implement a rule factory that waives shipping only when the subtotal meets a threshold. Decide whether the threshold is checked before or after product discounts, and whether remote handling remains payable.

Test the exact threshold and one cent below it. Then compare composing the threshold policy before and after a fixed shipping discount. Explain which ordering matches the product requirement.

For the language mechanics, see Swift's [Functions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/functions/) and [Closures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/) chapters. Continue with [Pure Functions and Side Effects](/swift-pure-functions-side-effects/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
