---
layout: post
hidden: true
title: "From Imperative to Declarative Swift Without Losing the Algorithm"
date: "2023-01-19"
last_modified_at: "2023-01-19"
permalink: /swift-imperative-to-declarative/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Collections, Refactoring]
thumbnail: assets/img/article-placeholder.svg
---
Replacing a loop with `map` does not automatically improve a program. A successful declarative refactor makes the calculation's intent easier to see while preserving its behavior, ordering, failure policy, and cost.

Consider a sales report: exclude cancelled orders, keep orders in a selected reporting day, aggregate revenue by customer, and show the highest totals first. The interesting work is defining those rules precisely. The collection methods are a way to express them.

<!--more-->

These Swift 5.7 examples use small integer-cent values. The input is already validated domain data, with each order assigned to a reporting day at the boundary.

## Begin with a readable imperative version

```swift
struct Sale {
    let customerID: Int
    let day: Int
    let cents: Int
    let cancelled: Bool
}

struct CustomerTotal: Equatable {
    let customerID: Int
    let cents: Int
}

func reportWithLoop(_ sales: [Sale], day: Int) -> [CustomerTotal] {
    var totals: [Int: Int] = [:]
    for sale in sales {
        guard sale.day == day && !sale.cancelled else { continue }
        totals[sale.customerID, default: 0] += sale.cents
    }
    var rows: [CustomerTotal] = []
    for (id, cents) in totals {
        rows.append(CustomerTotal(customerID: id, cents: cents))
    }
    rows.sort {
        if $0.cents == $1.cents { return $0.customerID < $1.customerID }
        return $0.cents > $1.cents
    }
    return rows
}

let sales = [
    Sale(customerID: 2, day: 10, cents: 500, cancelled: false),
    Sale(customerID: 1, day: 10, cents: 300, cancelled: false),
    Sale(customerID: 1, day: 10, cents: 200, cancelled: false),
    Sale(customerID: 3, day: 10, cents: 900, cancelled: true),
    Sale(customerID: 4, day: 9, cents: 800, cancelled: false)
]
let expected = [
    CustomerTotal(customerID: 1, cents: 500),
    CustomerTotal(customerID: 2, cents: 500)
]
assert(reportWithLoop(sales, day: 10) == expected)
```

This is already a pure calculation. Local mutation is not the problem. The refactoring question is whether naming and expressing the stages will make future changes safer.

The tie-breaker is essential. Dictionaries do not provide the report's business ordering. Sorting only by revenue would leave equal totals without a specified customer order, and screenshots or exports could vary unexpectedly.

## Express the stages in the order the reader needs

```swift
func report(_ sales: [Sale], day: Int) -> [CustomerTotal] {
    let eligible = sales.filter { $0.day == day && !$0.cancelled }
    let totals = eligible.reduce(into: [Int: Int]()) { result, sale in
        result[sale.customerID, default: 0] += sale.cents
    }
    return totals
        .map { CustomerTotal(customerID: $0.key, cents: $0.value) }
        .sorted {
            if $0.cents == $1.cents { return $0.customerID < $1.customerID }
            return $0.cents > $1.cents
        }
}

assert(report(sales, day: 10) == expected)
assert(report([], day: 10).isEmpty)
assert(report(sales, day: 11).isEmpty)
```

The intermediate name `eligible` exposes a domain concept. The dictionary accumulation is still a loop internally, but the public vocabulary now says “filter, aggregate, turn into rows, order.”

`reduce(into:)` is appropriate because the accumulator is a collection being built through mutation. A plain `reduce` that copies and returns a dictionary on every iteration can cause avoidable work. Choosing a declarative API does not remove the need to understand its operational behavior.

## Refactor behavior, not just syntax

Before changing code, write down what is observable. Does the original preserve duplicates? Does it stop on a malformed record? Does it include refunded amounts? Does it use arrival order to resolve a tie?

Our example counts every eligible sale, including repeated identical records. If duplicate records represent ingestion retries, the report needs deduplication by a real sale identifier. Adding `.unique()` by customer would silently discard valid purchases.

Similarly, using `compactMap` while reading external prices would drop failures. That may be acceptable in a best-effort preview and unacceptable in financial reporting. The right abstraction must preserve the chosen failure policy.

Keep a small characterization set through the refactor. Compare both implementations on empty input, mixed days, cancellations, and ties. Agreement supports behavior preservation; it does not establish that an old product rule was correct.

## Cost remains part of the explanation

Let `n` be the number of sales and `k` the number of distinct eligible customers. Filtering and aggregation take linear work in `n` under the dictionary's usual expected lookup cost. Sorting the final rows takes `O(k log k)` comparisons.

The eager `filter` allocates an intermediate array of eligible sales. The loop version does not. For a small report, the clearer stage boundary may be a good trade. For a large import, combine selection and aggregation:

```swift
func totalsInOnePass(_ sales: [Sale], day: Int) -> [Int: Int] {
    sales.reduce(into: [:]) { totals, sale in
        guard sale.day == day && !sale.cancelled else { return }
        totals[sale.customerID, default: 0] += sale.cents
    }
}

assert(totalsInOnePass(sales, day: 10) == [1: 500, 2: 500])
```

This saves the eligible array but puts the predicate inside the accumulation. A plain loop would also be reasonable. Measure with representative data before assuming that a fluent chain wins on speed or memory.

For untrusted totals, fixed-width addition can overflow. A production report should define maximum amounts and use checked addition or an appropriate numeric representation. Changing from a loop to `reduce` leaves this issue exactly where it was.

## Ask for one answer when you need one answer

If the requirement changes to “find any eligible sale,” building an entire filtered array is unnecessary:

```swift
let hasSales = sales.contains { $0.day == 10 && !$0.cancelled }
let firstSale = sales.first { $0.day == 10 && !$0.cancelled }
assert(hasSales)
assert(firstSale?.customerID == 2)
```

Both operations can stop early. A chain ending in `.count > 0` or `.first` after eager filtering still evaluates the full filter first.

If the requirement is “top ten customers,” sorting every customer may be acceptable at the current scale. A bounded heap can improve the asymptotic cost at a much larger scale, but requires a more involved implementation. Express the required result first, then choose the algorithm that fits the workload.

## Effects make evaluation order observable

Pure transformations are easier to rearrange because callers care about their result. If a predicate logs an audit event or a mapping closure reads changing state, fusing or reordering stages can change behavior.

An eager `filter` followed by `map` evaluates all predicates before any mapping. A fused loop interleaves them per element. Those are equivalent for our pure stages, but not for arbitrary effects.

Keep audit logging, database writes, and network calls in a boundary that has an explicit sequencing policy. Use the report calculation to return data or effect descriptions. Do not rely on incidental traversal order to implement a transaction.

## Make domain stages testable without fragmenting every line

Extract a helper when it names a rule that changes independently or deserves focused tests. A report's eligibility policy might fit that description. A helper that merely renames `row.customerID` probably does not.

Long expressions can also challenge type inference and debugging. Intermediate values allow the compiler to check smaller expressions and let a debugger inspect a meaningful stage. Declarative code does not need to be one expression.

The goal is a reader who can answer “what records count, how are they combined, and how is the result ordered?” without simulating every assignment.

## Compare implementations over more than one fixture

The original and refactored calculations can serve as a temporary differential check. With five sample sales, all subsets are small enough to enumerate:

```swift
for mask in 0..<(1 << sales.count) {
    let subset = sales.enumerated().compactMap { index, sale in
        (mask & (1 << index)) == 0 ? nil : sale
    }
    for day in 9...11 {
        assert(report(subset, day: day) == reportWithLoop(subset, day: day))
        assert(report(Array(subset.reversed()), day: day) == report(subset, day: day))
    }
}
```

The first assertion checks agreement across combinations of cancellations, days, and tied totals. The second checks an independent consequence of this report's policy: input order does not affect its final ordered rows.

That second check matters because two implementations can share the same mistake. Differential agreement alone would not reveal a comparator bug copied into both versions. Retain explicit expected cases and meaningful invariants as the permanent test suite.

The mask technique is deliberately bounded to a tiny fixture. Enumerating all subsets grows exponentially and is not a practical strategy for a large sample. Generated cases can explore a larger domain without exhaustively enumerating every combination.

## A pipeline is also a vocabulary for review

Consider a request to exclude internal test customers. In the staged implementation, the reviewer should expect the eligibility stage to change. A request to show low-revenue customers first should affect ordering, not aggregation.

If every requirement forces changes throughout the pipeline, the stages may not correspond to independent concepts. Names such as `step1` and `processedData` do not provide the same guidance as `eligible` and `totals`.

Avoid overextracting stages that only forward values. A helper is worthwhile when it names a domain rule, hides a meaningful representation choice, or provides a coherent test boundary. Splitting one expression into ten generic wrappers can make the report harder to follow.

The readable endpoint is a calculation whose policy can be stated in the same order as its code. That is a stronger reason to refactor than reducing the number of mutable local variables.

## Chunked reporting introduces a combination contract

A large report might be processed in batches. Each batch can produce customer totals, and those maps can be combined by adding amounts for matching IDs. Sorting should happen after combination if the output is a global ranking.

Taking the top ten rows of each batch and concatenating them does not necessarily produce the global top ten. A customer can accumulate moderate revenue across many batches and outrank every per-batch winner in total.

Likewise, averaging batch averages without counts gives small and large batches equal weight. Preserve sufficient statistics—such as totals and counts—so the final combination has the information it needs.

Even combining integer totals requires an overflow policy. A batch total might fit while the global total does not. Checked arithmetic must cover combination as well as per-record accumulation.

## Keep rejection observable at the ingestion boundary

The report accepts valid `Sale` values. A real import has an earlier stage converting dates, identifiers, and amount text into those values. Invalid rows should produce diagnostics or a batch failure according to the reporting contract.

Do not make the declarative report silently responsible for ignoring every malformed value. That can turn a complete-looking report into an undercount with no explanation.

A useful import result contains accepted records and rejected-row reasons, with source positions retained. The caller can decide whether a report based on incomplete data is permitted and can display that status explicitly.

This separation also supports testing: parser tests establish how text becomes domain values, report tests establish calculation rules, and one integration test verifies the two boundaries are assembled correctly.

## Exercise: include refunds deliberately

Add refunds as negative amounts. Decide whether a customer with zero net revenue appears in the report, and whether a customer with only refunds is included. Implement the policy in both versions and compare their output.

Then add a second day and verify that regrouping the input does not change totals. If order changes results, look for overflow, hidden mutable state, or a policy that actually depends on order.

See [Sequence](https://developer.apple.com/documentation/swift/sequence) for the collection operations used here. Continue with [map, filter, and reduce](/swift-map-filter-reduce/) for their individual contracts, or return to the [Functional Programming roadmap](/swift-functional-programming/).
