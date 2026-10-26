---
layout: post
hidden: true
title: "Pure Functions and Side Effects in Swift: Build a Testable Core"
date: "2022-12-15"
last_modified_at: "2022-12-15"
permalink: /swift-pure-functions-side-effects/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Testing, Architecture]
thumbnail: assets/img/article-placeholder.svg
---
A reminder should be sent when an invoice is overdue, remains unpaid, and has not received a reminder today. That rule sounds easy to test until the method also reads the system clock, queries a database, sends an email, and records a timestamp.

A pure function separates the decision from those effects. Given the same explicit inputs, it returns the same output without changing observable state outside the calculation. The application still performs real work; the work has a clear boundary.

<!--more-->

The examples use Swift 5.7. Time is represented as an integer day supplied by the caller so that the business rule is visible without calendar configuration.

## Make the hidden inputs visible

Reading `Date()`, looking up a singleton's settings, and consulting a mutable cache all add inputs that are absent from a function's parameter list. A method can have no arguments and still depend on half an application.

Start by making a snapshot of the facts the decision needs:

```swift
struct Invoice: Equatable {
    let id: Int
    let dueDay: Int
    let outstandingCents: Int
    let lastReminderDay: Int?
}

enum ReminderDecision: Equatable {
    case skip
    case send(invoiceID: Int)
}

func reminderDecision(for invoice: Invoice, today: Int) -> ReminderDecision {
    guard invoice.outstandingCents > 0 else { return .skip }
    guard invoice.dueDay < today else { return .skip }
    guard invoice.lastReminderDay != today else { return .skip }
    return .send(invoiceID: invoice.id)
}

let unpaid = Invoice(id: 7, dueDay: 10, outstandingCents: 900, lastReminderDay: nil)
assert(reminderDecision(for: unpaid, today: 10) == .skip)
assert(reminderDecision(for: unpaid, today: 11) == .send(invoiceID: 7))
```

The due-day comparison is a product decision: an invoice becomes overdue the following day. A different policy could include the due day itself. Making the comparison testable helps expose that ambiguity before an email reaches a customer.

The function returns a decision value. Calling it twice does not send two reminders, write two records, or advance a clock. That makes it safe to inspect the result while debugging or compare implementations during a refactor.

## Local mutation can implement a pure calculation

Purity concerns observable behavior. A local variable used to build a result does not automatically make a function impure:

```swift
func pendingReminders(_ invoices: [Invoice], today: Int) -> [Int] {
    var ids: [Int] = []
    for invoice in invoices {
        if case let .send(id) = reminderDecision(for: invoice, today: today) {
            ids.append(id)
        }
    }
    return ids
}

let alreadyReminded = Invoice(
    id: 8, dueDay: 9, outstandingCents: 600, lastReminderDay: 11
)
assert(pendingReminders([unpaid, alreadyReminded], today: 11) == [7])
assert(unpaid.lastReminderDay == nil)
```

The accumulator is owned entirely by this call. No caller can observe its intermediate states, and the function does not change the invoices. Replacing this loop with `compactMap` could be readable too, but the spelling is not the proof of purity.

A closure inside `map` that logs, mutates a shared object, or increments an external counter would introduce effects. Review the operations and captures rather than counting functional API names.

## Keep the effect boundary small and honest

```mermaid
flowchart LR
    accTitle: Reminder planning and effect execution
    accDescr: Invoice facts enter a pure planner. Its decisions go to an interpreter that sends a reminder and then records delivery as separate effects.
    Facts[Invoice snapshot and reporting day] --> Planner[Pure reminder planner]
    Planner --> Decisions[Decision values]
    Decisions --> Runner[Effect interpreter]
    Runner --> Delivery[Send reminder]
    Delivery --> Record[Record delivery]
```

The arrows describe responsibilities and sequencing. The final two steps are separate effects, so a failure between them needs an explicit recovery policy.

Here is a synchronous coordinator with explicit capabilities:

```swift
struct ReminderRunner {
    let readInvoices: () throws -> [Invoice]
    let currentDay: () -> Int
    let send: (Int) throws -> Void
    let record: (Int, Int) throws -> Void

    func run() throws {
        let today = currentDay()
        let invoices = try readInvoices()
        let ids = pendingReminders(invoices, today: today)
        for id in ids {
            try send(id)
            try record(id, today)
        }
    }
}

var sent: [Int] = []
var recorded: [(Int, Int)] = []
let runner = ReminderRunner(
    readInvoices: { [unpaid, alreadyReminded] },
    currentDay: { 11 },
    send: { sent.append($0) },
    record: { recorded.append(($0, $1)) }
)
try runner.run()
assert(sent == [7])
assert(recorded.count == 1 && recorded[0].0 == 7 && recorded[0].1 == 11)
```

The runner is intentionally effectful. It reads facts, calculates decisions, and executes them. Reading the day once ensures all invoices in this run use the same day even if execution crosses midnight.

Dependency injection makes this runner testable, but does not make it pure. Calling `run()` repeatedly can send repeatedly. A fixed test clock is a controlled effect, not a claim that time reading has disappeared from the application.

## Failure between effects is part of the design

What if sending succeeds and recording fails? Retrying the runner may send the reminder again. Reversing the order creates the opposite problem: a recorded reminder that was never sent.

The pure decision function cannot make two external systems atomic. A real solution might use an outbox written transactionally with local state, a delivery service accepting an idempotency key, and a worker that retries delivery. The exact guarantee depends on those systems' contracts.

Even an idempotency key needs a defined scope. `(invoiceID, reminderDay)` might express “one reminder per invoice per day,” but it could be wrong if reminders are scoped by customer account or invoice identifiers are reused. Domain identity belongs in the effect protocol.

Test the runner's sequencing with a recording operation that fails. Verify that it reports the failure and does not proceed as though everything completed. Separately test the adapter's retry behavior; a pure-core test cannot establish remote delivery guarantees.

## Model time accurately at the boundary

An integer day is a simplification, not a production calendar. “Today” depends on a time zone and calendar, while “24 hours after” describes elapsed time. These are different rules around daylight-saving changes and international customers.

Translate real timestamps to the domain's day representation in a boundary adapter with an explicit calendar and time zone. Pass the resulting facts into the calculation. If the rule is based on elapsed seconds instead, use that representation and test the boundary precisely.

The same approach applies to randomness. Generate a random choice at the boundary and pass it in, or pass and return an explicit deterministic generator state. Reproducible decisions require reproducible inputs, not merely a fixed function name.

## Value inputs need value semantics

Our invoice stores integers and an optional integer. If it stored a mutable customer object, copying the invoice would copy a reference to that object. Another owner could change the customer's eligibility during the calculation.

A snapshot should contain the facts the rule requires, expressed as independent values. Avoid passing a large service object just because it can answer the necessary question. That object hides when the answer is read and whether reading it has effects.

Swift does not enforce general purity through a language keyword. It remains a design property you maintain through types, ownership, and review. See [The Value of Immutability](/swift-immutability/) for how stable values support that property.

## Test the rule's boundary and its invariants

Useful examples include an invoice due today, one overdue by a day, one with no outstanding balance, and one already reminded today. Add a prior-day reminder to establish that yesterday's reminder does not suppress today's under this policy.

Useful properties go further: fully paid invoices never produce a send decision; every returned ID came from an input invoice; reordering independent invoices reorders decisions without changing membership. Duplicate IDs require a separate policy because the current function does not deduplicate them.

Avoid a property that only repeats the implementation's condition in a different file. Where possible, test a consequence meaningful to the domain. For example, changing an overdue invoice from positive balance to zero should remove its reminder.

## Verify partial failure without pretending it is atomic

The send-then-record boundary is important enough to exercise directly. A fake recording service can fail after the send has completed:

```swift
enum RecordingFailure: Error { case unavailable }
var deliveredBeforeFailure: [Int] = []
let partiallyFailingRunner = ReminderRunner(
    readInvoices: { [unpaid] },
    currentDay: { 11 },
    send: { deliveredBeforeFailure.append($0) },
    record: { _, _ in throw RecordingFailure.unavailable }
)
do {
    try partiallyFailingRunner.run()
    assertionFailure("Recording failure must be reported")
} catch RecordingFailure.unavailable {
    assert(deliveredBeforeFailure == [7])
}
```

The test establishes two observations: the runner reports failure, and delivery has already occurred. It deliberately does not assert that retrying is safe. That requires the external protocol discussed earlier.

Also test a send failure. In that case, the runner must not record a successful reminder. Test a read failure too: neither delivery nor recording should start when the input snapshot cannot be obtained.

These interaction checks protect sequencing requirements. They do not need to assert the names or call counts of private calculation helpers. Keep the test focused on the externally meaningful boundary.

## A plan can be inspected before it is executed

Returning decision values supports a useful operational workflow. An administrator can preview invoice IDs selected for reminders, inspect the chosen day, and approve a batch through the same planning calculation used for execution.

But a preview is a snapshot. If an invoice is paid between planning and sending, the plan may be obsolete. Choose a consistency policy: revalidate before delivery, use a versioned invoice snapshot, or accept a documented delay in reflecting payments.

The pure function makes the plan reproducible from its inputs. It does not keep the world unchanged while someone inspects it. Include version or validity information when a plan crosses a long-running boundary.

A recorded plan can also support diagnostics. Store the relevant inputs and policy version, then recalculate decisions without executing effects. Replaying the effect interpreter would be a different operation that could send duplicate messages.

## Idempotence and purity answer different questions

A pure planner returns the same answer for the same inputs without external mutation. An idempotent effect can be executed repeatedly with the same intended final external state. These are separate guarantees.

Setting a remote flag to true may be idempotent while still being an effect. Incrementing a counter is usually not idempotent. A reminder service accepting an idempotency key may deduplicate retries, but the caller must understand the key's retention window and scope.

Conversely, a pure function can return a plan containing two identical sends if its input contains duplicate invoice IDs. Purity does not deduplicate the plan or establish uniqueness of domain identity.

If duplicate invoices are impossible by contract, validate that at snapshot construction. If they can occur, decide whether to reject the batch or combine duplicates. Silently keeping the first record could hide conflicting balances or reminder dates.

## Use dependency injection to expose capabilities

The runner takes four named capabilities rather than an arbitrary container. A reviewer can see that the workflow reads invoices, reads time, sends, and records. A container resolved internally would hide those same dependencies behind a smaller-looking initializer.

Closure dependencies work well here because each capability has one operation. A protocol can become clearer when a capability grows related lifecycle operations, such as opening a transaction and committing it. Preserve the consumer's needs rather than forcing every dependency into the same mechanism.

Be equally explicit about information leaving the pure core. A reminder decision may need a recipient and template version, not merely an invoice ID. Capturing that immutable delivery data in the plan avoids a later adapter silently selecting different content from a changing service.

The boundary should contain enough information to execute the chosen policy coherently, while avoiding unnecessary personal or infrastructure data in the calculation model.

## Exercise: return an explanation

Replace `.skip` with separate reasons such as `.paid`, `.notOverdue`, and `.alreadyReminded`. Decide which reason wins when more than one condition applies, and test that ordering.

Then add a dry-run mode to the runner that reports decisions without executing delivery. Keep the planner unchanged. A dry run becomes trustworthy when it uses the same calculation as the real workflow, while its effect interpreter deliberately avoids sending.

Swift's [Error Handling chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/) covers the synchronous failure mechanics used here. For a larger state-and-effect example, see [Mixing OOP with Functional Programming](/swift-oop-functional-programming/). Return to the [Functional Programming roadmap](/swift-functional-programming/).
