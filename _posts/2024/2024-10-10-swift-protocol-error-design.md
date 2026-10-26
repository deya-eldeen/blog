---
layout: post
hidden: true
title: "Designing Error Handling Around Swift Protocols"
date: "2024-10-10"
last_modified_at: "2024-10-10"
permalink: /swift-protocol-error-design/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Error Handling", "Adapters"]
thumbnail: assets/img/article-placeholder.svg
---
A protocol abstracts behavior only if its failure semantics are useful to its consumers. A method named `load` that leaks arbitrary server codes forces every caller to understand the backend the protocol was supposed to hide.

Design the failure vocabulary from the consumer's decisions: show a missing state, ask for permission, retry later, or report an invalid integration response. A document reader gives us a complete mapping example with deterministic tests.

<!--more-->

## Treat absence as a result when absence is ordinary

```swift
struct DocumentID: Hashable {
    let rawValue: String
}

struct ReadDocument: Equatable {
    let id: DocumentID
    let title: String
}

enum DocumentReadFailure: Error, Equatable {
    case permissionDenied
    case temporarilyUnavailable(retryAfterSeconds: Int?)
    case invalidResponse
    case unexpectedFailure
}

protocol DocumentReading {
    func document(id: DocumentID) throws -> ReadDocument?
}
```

The optional result represents a document that does not exist. Failure is reserved for an operation that could not answer the query under its contract. This lets a consumer distinguish “missing” from “the service is offline” without examining a transport-specific status code.

Another domain may treat missing data as an error, especially if an identifier is guaranteed to exist by an earlier transaction. Choose according to the use case. Optionality is not universally better; it is a way to encode an expected outcome truthfully.

The synchronous interface here is for an in-memory teaching adapter. A real network-backed reader should expose asynchronous behavior rather than block behind this signature.

## Keep transport vocabulary on the adapter side

```swift
enum RemoteDocumentReply {
    case content(title: String)
    case absent
    case accessRejected
    case rateLimited(retryAfterSeconds: Int)
}

enum RemoteDocumentFailure: Error { case connectionLost }

protocol RemoteDocumentFetching {
    func fetch(id: String) throws -> RemoteDocumentReply
}

struct DocumentReaderAdapter: DocumentReading {
    let remote: any RemoteDocumentFetching

    func document(id: DocumentID) throws -> ReadDocument? {
        let reply: RemoteDocumentReply
        do {
            reply = try remote.fetch(id: id.rawValue)
        } catch RemoteDocumentFailure.connectionLost {
            throw DocumentReadFailure.temporarilyUnavailable(retryAfterSeconds: nil)
        } catch {
            throw DocumentReadFailure.unexpectedFailure
        }

        switch reply {
        case let .content(title):
            guard !title.isEmpty else { throw DocumentReadFailure.invalidResponse }
            return ReadDocument(id: id, title: title)
        case .absent:
            return nil
        case .accessRejected:
            throw DocumentReadFailure.permissionDenied
        case let .rateLimited(seconds):
            guard seconds >= 0 else { throw DocumentReadFailure.invalidResponse }
            throw DocumentReadFailure.temporarilyUnavailable(retryAfterSeconds: seconds)
        }
    }
}
```

The adapter translates representations and validates the data required by the domain. A negative retry delay is an invalid response, not a meaningful scheduling instruction. An empty title is rejected under this example's deliberately simple document rule.

Unexpected errors receive a distinct classification rather than being relabeled as an ordinary temporary outage. A production boundary should also record diagnostic causes through an appropriate logging channel. Avoid exposing raw server responses or private account data in user-facing messages.

## Test the mapping without a server

```swift
struct FixedRemoteDocument: RemoteDocumentFetching {
    let reply: RemoteDocumentReply
    func fetch(id: String) -> RemoteDocumentReply { reply }
}

struct DisconnectedRemoteDocument: RemoteDocumentFetching {
    func fetch(id: String) throws -> RemoteDocumentReply {
        throw RemoteDocumentFailure.connectionLost
    }
}

let documentID = DocumentID(rawValue: "guide")
let missingReader = DocumentReaderAdapter(remote: FixedRemoteDocument(reply: .absent))
let missingDocument = try missingReader.document(id: documentID)
assert(missingDocument == nil)

let contentReader = DocumentReaderAdapter(remote: FixedRemoteDocument(reply: .content(title: "Protocols")))
let loadedDocument = try contentReader.document(id: documentID)
assert(loadedDocument == ReadDocument(id: documentID, title: "Protocols"))

let limitedReader = DocumentReaderAdapter(remote: FixedRemoteDocument(reply: .rateLimited(retryAfterSeconds: 12)))
do {
    _ = try limitedReader.document(id: documentID)
    assertionFailure("A rate limit must be exposed")
} catch {
    assert(error as? DocumentReadFailure == .temporarilyUnavailable(retryAfterSeconds: 12))
}

let disconnectedReader = DocumentReaderAdapter(remote: DisconnectedRemoteDocument())
do {
    _ = try disconnectedReader.document(id: documentID)
    assertionFailure("A lost connection must fail")
} catch {
    assert(error as? DocumentReadFailure == .temporarilyUnavailable(retryAfterSeconds: nil))
}
```

These tests prove classification and data mapping, not the correctness of a real HTTP client. An integration test must separately establish that actual response codes and payloads become the appropriate `RemoteDocumentReply` or transport error.

That separation is valuable. Consumer tests can exercise recovery with precise outcomes, while adapter tests cover backend translation. A single universal fake that always returns content would leave most of this contract untested.

## Let the consumer choose recovery

A reader should not automatically show an alert or navigate to sign-in because it encounters a permission failure. Those are application decisions. Return the failure meaning to the owner that has enough context to respond.

```swift
func documentStatus(reader: any DocumentReading, id: DocumentID) -> String {
    do {
        return try reader.document(id: id)?.title ?? "Document not found"
    } catch let failure as DocumentReadFailure {
        switch failure {
        case .permissionDenied: return "Access required"
        case .temporarilyUnavailable: return "Try again later"
        case .invalidResponse: return "The document response was invalid"
        case .unexpectedFailure: return "The document could not be loaded"
        }
    } catch {
        return "The document could not be loaded"
    }
}

assert(documentStatus(reader: missingReader, id: documentID) == "Document not found")
assert(documentStatus(reader: limitedReader, id: documentID) == "Try again later")
```

The broad final catch is necessary because the protocol uses ordinary `throws`; the compiler does not enforce `DocumentReadFailure` as its only failure type. A Swift 6 API can use [Typed Throws](/swift-typed-throws/) if that closed vocabulary should be a compiler-checked part of the signature.

Either choice still needs semantic documentation. Typed throws makes the type precise, not the meaning of each case or the required state after failure.

## Specify effect guarantees before adding retries

For this read operation, retrying does not intentionally create a new document. A write operation needs more care. A timeout can mean the server committed a write but the response was lost. Retrying blindly may duplicate an effect.

Define whether the operation is idempotent, accepts an idempotency key, or returns a durable operation identifier that can be queried. A protocol named `Saving` does not imply any of those properties.

Likewise, “temporary” does not mean “retry immediately forever.” The consumer or retry policy should consider a delay, attempt budget, user cancellation, and the operation's effect semantics. Keep retry mechanics separate from backend error classification when that makes responsibilities clearer.

## Avoid optional chaining over required effects

A required persistence collaborator represented as an optional can turn a missing dependency into an apparent success. An expression that silently skips a save is not equivalent to a save that completed.

Prefer construction requiring essential dependencies. Optional observation can remain optional; business effects should have an explicit outcome. This is the same distinction that separates a weak UI delegate from a required result processor.

For a batch operation, state whether failure preserves all earlier values or permits partial completion. A single thrown error cannot tell the caller which rows were written unless the contract includes that information.

## Keep errors useful across implementation changes

| Consumer decision | Stable failure meaning | Backend detail kept inside adapter |
|---|---|---|
| Show missing content | Optional missing result | Specific not-found representation |
| Request access | Permission denied | Authentication or authorization response |
| Schedule another attempt | Temporary unavailability and delay | Connection failure or rate-limit payload |
| Report invalid integration data | Invalid response | Decoding or validation details |

The mapping can evolve when the backend changes while the consumer's decision remains stable. Do not collapse every failure into one generic case if consumers need different recovery. Also avoid exposing twenty backend-specific cases when callers treat all of them identically.

## Cancellation deserves its own policy

An asynchronous version must decide how cancellation crosses the boundary. Do not map every `CancellationError` to temporary unavailability and trigger another request. That converts a deliberate stop into renewed work.

The adapter may preserve cancellation as a standard error, represent it in a domain enum, or have an owner ignore cancelled outcomes. Whichever approach is chosen, test a completion arriving after cancellation or after a newer request starts. Error mapping and stale-result acceptance are separate rules.

As an exercise, add a forbidden-access test, an empty-title test, and a negative-retry-delay test. Then introduce a recording consumer scheduler and verify that only an appropriate temporary failure schedules another attempt. The result should be a truthful workflow, not merely a protocol-shaped wrapper around a remote exception.

## Worked rejection tests: invalid data is not temporary unavailability

Complete the adapter's error matrix with cases that a happy-path fake would miss:

```swift
func classifiedFailure(
    for reply: RemoteDocumentReply,
    id: DocumentID
) -> DocumentReadFailure? {
    let reader = DocumentReaderAdapter(remote: FixedRemoteDocument(reply: reply))
    do {
        _ = try reader.document(id: id)
        return nil
    } catch let failure as DocumentReadFailure {
        return failure
    } catch {
        return .unexpectedFailure
    }
}

assert(classifiedFailure(for: .accessRejected, id: documentID) == .permissionDenied)
assert(classifiedFailure(for: .content(title: ""), id: documentID) == .invalidResponse)
assert(classifiedFailure(for: .rateLimited(retryAfterSeconds: -1), id: documentID)
    == .invalidResponse)
assert(classifiedFailure(for: .rateLimited(retryAfterSeconds: 0), id: documentID)
    == .temporarilyUnavailable(retryAfterSeconds: 0))
assert(classifiedFailure(for: .content(title: "Valid"), id: documentID) == nil)
```

Zero is a valid delay in this contract, while a negative delay is invalid. That boundary is easy to overlook if the only rate-limit test uses a large positive value.

The classification helper intentionally returns only the failure category. It does not prove the content result is correct; the earlier result assertions cover that. Focused checks can share fixtures without conflating classification with complete behavioral verification.

For a real adapter, maintain a table from actual backend representations to these domain outcomes. If the backend adds a response kind, review whether it maps into an existing recovery category or requires a new one. Do not automatically classify every unknown response as retryable, because retries can amplify a persistent integration mistake.

Finally, test that user-facing recovery does not expose the raw title, identifier, or underlying exception unless that disclosure is intentional. Structured errors can preserve meaningful decisions while diagnostics record sensitive details only in an appropriate channel.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
