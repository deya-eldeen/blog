---
layout: post
hidden: true
title: "Abstraction in Swift: Designing Interfaces Around Intent"
date: "2022-09-01"
last_modified_at: "2022-09-01"
permalink: /swift-abstraction/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Abstraction", "API Design"]
thumbnail: assets/img/article-placeholder.svg
---
A delivery screen needs to find out where a parcel is. It should not need to know an endpoint path, a JSON key, or how many network retries happened. Abstraction gives the caller a useful concept and puts the mechanics behind that concept.

The difficult part is choosing an interface that still tells the truth about failure and behavior.

<!--more-->

## Start from what the caller needs

```swift
struct ParcelStatus: Equatable {
    let description: String
    let isDelivered: Bool
}

enum TrackingError: Error {
    case unknownParcel
}

protocol ParcelTracking {
    func status(for trackingID: String) throws -> ParcelStatus
}

struct RecordedTracker: ParcelTracking {
    let records: [String: ParcelStatus]

    func status(for trackingID: String) throws -> ParcelStatus {
        guard let status = records[trackingID] else {
            throw TrackingError.unknownParcel
        }
        return status
    }
}

struct TrackingSummary {
    let tracker: any ParcelTracking

    func message(for trackingID: String) throws -> String {
        let status = try tracker.status(for: trackingID)
        return status.isDelivered ? "Delivered" : status.description
    }
}

let tracker = RecordedTracker(records: [
    "PKG-1": ParcelStatus(description: "At the depot", isDelivered: false)
])
let summary = TrackingSummary(tracker: tracker)
let message = try summary.message(for: "PKG-1")
assert(message == "At the depot")
```

The summary asks a domain question and receives a domain value. The example implementation uses a dictionary, but the consumer has no dictionary API to depend on. Swift [protocol requirements](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/) let another type provide the same operation.

The example is intentionally synchronous because it reads local records. A live network implementation would need an asynchronous contract. Hiding a network request behind a synchronous function by blocking a thread would preserve the spelling while changing an important part of the behavior.

## Hide mechanisms, preserve meaningful choices

An abstraction should hide details the caller does not need. It should expose details the caller must use to make a decision.

For a real tracker, “parcel not found,” “temporarily unavailable,” and “cached result from yesterday” might need different outcomes. Returning an empty string for all three would make the interface smaller but less useful. Likewise, a cancellation requirement belongs in the design if users can leave the screen before a request finishes.

An abstraction is a promise about semantics, not just a list of method signatures. Document whether data can be stale, whether an operation has side effects, and what failures mean.

## A protocol is optional

A concrete type with a small public interface can be a perfectly good abstraction. `Array` hides its storage details without requiring your code to invent an `ArrayProviderProtocol`.

Introduce a protocol when a consumer benefits from substituting behavior, reducing dependency on an external system, or expressing a real capability shared by several types. A protocol that merely duplicates every member of one concrete class may add maintenance without improving the boundary.

## Separate abstraction from encapsulation

[Encapsulation](/swift-encapsulation/) protects state and its valid transitions. Abstraction determines which concepts and operations a caller sees. A type can do both: a reservation exposes `reserve` while privately ensuring capacity is never exceeded.

The distinction helps during review. If callers know too much about storage, improve the abstraction. If callers can put the model in an invalid state, improve encapsulation. Adding a protocol alone does not fix either problem automatically.

## Review the call site

Read the consumer without opening the implementation. Can you understand its purpose, recognize an operation that can fail, and tell what information it receives? Then imagine replacing the implementation. Any detail the caller must relearn is a candidate for a clearer contract.

## Decide which guarantees belong in the interface

A tracking abstraction has more dimensions than a function name and a return type. Before adding a live implementation, make the important choices explicit:

| Concern | Question a consumer needs answered |
|---|---|
| Freshness | Is this live information, a cached result, or either? |
| Failure | Does absence mean an unknown parcel or a temporary outage? |
| Timing | Is the operation immediate or asynchronous? |
| Cancellation | Can leaving a screen stop work, and how is cancellation reported? |
| Repetition | May a retry perform the operation safely? |
| Ownership | Can several callers share the service and its mutable state? |

You do not have to expose every implementation detail. You do have to expose enough meaning for the consumer to behave correctly. A spinner, a stale-data label, and an error message may all depend on distinctions that an overly broad `String?` result erases.

## Make freshness a value the consumer can inspect

The original synchronous interface is appropriate for local records. A separate cache-oriented abstraction can make the result's age and absence visible without pretending it is a live network request:

```swift
enum StoredTrackingResult: Equatable {
    case found(status: ParcelStatus, recordedMinute: Int)
    case unknownParcel
}

struct TrackingPresentation: Equatable {
    let message: String
    let needsRefresh: Bool
}

func presentation(
    for result: StoredTrackingResult,
    nowMinute: Int,
    maximumAgeMinutes: Int
) -> TrackingPresentation {
    precondition(maximumAgeMinutes >= 0)
    switch result {
    case .unknownParcel:
        return TrackingPresentation(message: "No saved tracking information", needsRefresh: true)
    case let .found(status, recordedMinute):
        let age = max(0, nowMinute - recordedMinute)
        let isStale = age > maximumAgeMinutes
        return TrackingPresentation(
            message: status.description + (isStale ? " (saved result)" : ""),
            needsRefresh: isStale
        )
    }
}

let storedResult = StoredTrackingResult.found(
    status: ParcelStatus(description: "In transit", isDelivered: false),
    recordedMinute: 100
)
let stalePresentation = presentation(
    for: storedResult,
    nowMinute: 140,
    maximumAgeMinutes: 15
)
assert(stalePresentation.message == "In transit (saved result)")
assert(stalePresentation.needsRefresh)
```

The calculation does not know where the record was stored. It knows the semantic facts needed to decide whether to show a saved-result label and request a refresh. Minutes are a simplified clock representation; real timestamps need an agreed clock and a policy for skew. The `max` explicitly treats future-recorded data as age zero in this example.

Notice that this is not an attempt to make one enormous “universal tracker” protocol. It separates reading saved information from requesting fresh information because those operations have different meanings. A caller can combine them deliberately in a refresh workflow.

## Follow information loss through an adapter

Suppose a vendor SDK reports three outcomes: a successful status, an unknown parcel, and a rate-limit response with a retry delay. An adapter translating all failures into `unknownParcel` makes the application tell users their package does not exist when the service is merely busy.

Design the domain error vocabulary from the consumer's recovery choices. If the screen should offer “try again later,” preserve a temporary-unavailability outcome. If a retry delay affects behavior, preserve that information too. You can discard a vendor's raw diagnostic fields while keeping those meaningful distinctions.

Adapters should also translate identifiers and units. A vendor's milliseconds and your domain's seconds may both be integers, but passing them through unchanged would satisfy the compiler and break the contract. Names, wrapper types, and conversion tests help make that boundary visible.

## Make substitutability observable

A fake tracker that always returns instantly can verify presentation logic, but it cannot establish that a live implementation obeys cancellation or error mapping. Use several levels of verification.

First, test consumers against controlled outcomes such as delivered, stale, unknown, and unavailable. Second, test the adapter with representative vendor responses to verify translation. Third, use a small integration check where real service behavior matters. Each level answers a different question; a hundred consumer tests cannot prove an adapter maps one rarely seen status correctly.

For a protocol with several implementations, shared contract checks can exercise the same outcomes against each implementation. Include rejected inputs and repeated calls, since those often reveal semantic differences hidden by identical signatures.

## Choose the level of generality after seeing variation

An interface such as `execute(input: Any) -> Any` appears general because it can represent almost anything. It pushes validation and interpretation onto every caller and loses useful type relationships. A narrowly typed parcel operation is a stronger abstraction for tracking even though it applies to fewer domains.

The opposite mistake is creating a protocol for a hypothetical second backend before understanding the first consumer. It can harden accidental SDK concepts into your application's vocabulary. Begin at the use case: what question does the screen need to ask, and what decisions does it make from the answer?

Once a real second implementation appears, compare the semantics rather than merely renaming its methods to fit. An abstraction that forces one backend to fake capabilities it does not have is probably at the wrong level.

## Diagnose leaks by reading change requests

A useful exercise is replacing a local tracker with a cache plus remote refresh. List which consumer code should change because the product behavior changes, and which should stay stable because storage mechanics changed.

The screen may legitimately gain a freshness indicator. It should not need to parse the vendor's JSON or know which database table holds the cache. That distinction is how you evaluate an abstraction in practice: it permits meaningful product changes while containing irrelevant mechanical changes.

## Case study: adapting a carrier without leaking its vocabulary

A carrier SDK may use transport-specific outcomes that do not belong in a tracking screen: numeric response codes, rate-limit fields, and vendor labels. An adapter should preserve the distinctions the application needs while translating away those mechanics.

Start with the consumer's recovery choices. It can show a known status, explain that no parcel matches the identifier, or ask the user to retry later. A misconfigured integration requires a different operational response from an unknown parcel.

```swift
enum CarrierReply {
    case inTransit(label: String, observedMinute: Int)
    case delivered(observedMinute: Int)
    case noMatch
    case rateLimited(retryAfterMinutes: Int)
    case credentialsRejected
}

protocol CarrierResponding {
    func reply(for identifier: String) throws -> CarrierReply
}

enum ParcelObservation: Equatable {
    case known(status: ParcelStatus, observedMinute: Int)
    case unknown
}

enum ParcelLookupFailure: Error {
    case temporarilyUnavailable(retryAfterMinutes: Int)
    case integrationMisconfigured
    case invalidResponse
}

struct CarrierTrackingAdapter {
    let carrier: any CarrierResponding

    func lookup(_ identifier: String) throws -> ParcelObservation {
        switch try carrier.reply(for: identifier) {
        case let .inTransit(label, minute):
            return .known(
                status: ParcelStatus(description: label, isDelivered: false),
                observedMinute: minute
            )
        case let .delivered(minute):
            return .known(
                status: ParcelStatus(description: "Delivered", isDelivered: true),
                observedMinute: minute
            )
        case .noMatch:
            return .unknown
        case let .rateLimited(delay):
            guard delay >= 0 else { throw ParcelLookupFailure.invalidResponse }
            throw ParcelLookupFailure.temporarilyUnavailable(retryAfterMinutes: delay)
        case .credentialsRejected:
            throw ParcelLookupFailure.integrationMisconfigured
        }
    }
}

struct FixedCarrierReply: CarrierResponding {
    let response: CarrierReply
    func reply(for identifier: String) throws -> CarrierReply { response }
}

let unknownAdapter = CarrierTrackingAdapter(carrier: FixedCarrierReply(response: .noMatch))
let unknownObservation = try unknownAdapter.lookup("PKG-404")
assert(unknownObservation == .unknown)
let busyAdapter = CarrierTrackingAdapter(carrier: FixedCarrierReply(response: .rateLimited(retryAfterMinutes: 5)))
do {
    _ = try busyAdapter.lookup("PKG-42")
    assertionFailure("A rate limit is not an unknown parcel")
} catch ParcelLookupFailure.temporarilyUnavailable(let delay) {
    assert(delay == 5)
}
```

The adapter is intentionally synchronous because the supplied carrier is local. A real network-backed contract should be asynchronous and include a cancellation policy. Do not hide a blocking SDK behind a friendly name and assume that naming has abstracted away its timing cost.

The new result also carries observation time. It is a separate contract from the earlier `ParcelTracking`, which returned only status. When the product needs freshness, evolve the semantic contract deliberately instead of smuggling timestamps into a display string.

### Decide which errors cross the boundary

A transport timeout may map to temporary unavailability, while a decoding error may indicate an invalid integration response. Raw diagnostic information can still be logged by the adapter or infrastructure layer without becoming the screen's public error vocabulary.

Avoid catching every error and returning `.unknown`. That makes the UI give a confident but false explanation. Also avoid exposing every vendor error directly: consumers then have to understand a backend's private taxonomy and change whenever the SDK renames a case.

A useful boundary preserves information needed for recovery and operations while discarding irrelevant representation details. That is a more demanding goal than merely replacing a concrete parameter with a protocol.

### Validate units and meaning, not just types

Both a retry delay in seconds and a retry delay in minutes can be integers. A compiler cannot catch passing one as the other when both are represented as `Int`.

Wrapper values such as `RetryDelay` or a standard duration type can make those distinctions harder to lose. Even with wrappers, tests should cover conversion boundaries, negative values, overflow, and any clamping policy. An adapter is often the last place to reject a malformed vendor value before it becomes trusted domain data.

Similarly, “observed at” and “downloaded at” are different timestamps. A freshly downloaded cached response can still describe an old observation. Name the field according to what it actually means.

### Write an implementation matrix before adding another backend

| Scenario | Carrier A | Carrier B | Consumer-facing requirement |
|---|---|---|---|
| Identifier absent | Explicit no-match result | Empty result list | `.unknown` |
| Temporary rate limit | Delay in minutes | Delay in seconds | One agreed retry-delay representation |
| Delivered parcel | Dedicated case | Status code | Delivered status plus observation time |
| Invalid credentials | Error code | Thrown SDK error | Integration failure, not parcel absence |

The matrix reveals where an abstraction is coherent and where an adapter must translate. If one backend cannot provide observation time at all, decide whether the domain allows an unknown timestamp. Inventing a current timestamp would make the interface easy to satisfy while misleading consumers about freshness.

### Keep adapter tests separate from screen tests

A screen test should exercise known, unknown, stale, and unavailable outcomes without constructing carrier responses. An adapter test should feed representative carrier responses and verify the domain translation. A small integration test can check that the actual SDK still provides the shapes the adapter expects.

Those tests protect different contracts. Reusing one giant fake for every layer tends to blur whether a failure is in presentation logic or translation. It can also accidentally make the tests reproduce the adapter's implementation instead of checking the intended meaning.

### Evaluate the abstraction under a real change

Add a second carrier that has no live status for delivered parcels but offers a historical completion record. Ask whether the existing result can truthfully represent that record and its timestamp. If it can, the screen may remain stable. If the product must expose a different guarantee, change the consumer-facing model rather than concealing the distinction.

A good abstraction makes relevant differences explicit and irrelevant differences local. Its success is measured by the correctness and clarity of the consumer, not by how many backends can be forced through one method signature.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
