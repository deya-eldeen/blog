---
layout: post
hidden: true
title: "Testing Status Codes, Invalid Payloads, and Transport Errors"
date: "2026-10-14"
last_modified_at: "2026-10-14"
permalink: /swift-testing-network-failures/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Testing, Swift Testing]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
The happy path of a networking client gets tested by accident: every developer runs it a hundred times a day. The failure paths get tested by users. A `429` with `Retry-After` arrives for the first time in production, a CDN returns an HTML error page with status `200`, a server deploy starts sending `"price": null`, and the code that handles each case has never run.

Failure handling is also the part of a client that is easiest to test exhaustively, because every failure is a small, well-defined input: a status code, a body, an error code. This article turns the error model from [Separating Transport Errors from Application Failures](/swift-transport-vs-application-errors/) into a test suite with Swift Testing's parameterized tests: a matrix of status codes, a corpus of invalid payloads, a table of transport errors, and a mutation fuzzer that feeds a thousand corrupted variants of a valid response to the decoder and checks that the client never crashes and never returns invalid data.

<!--more-->

The examples use Swift 6 language mode and Swift Testing, and were run with `swift test` using the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Each block is labeled with the file it belongs to in a Swift package with a `Library` target and a `LibraryTests` test target. The tests use the parallel-safe `URLProtocol` fixture from [Isolating HTTP Fixtures with `URLProtocol`](/swift-urlprotocol-fixtures/); copy its `StubProtocol.swift` into the test target.

<!-- check-uses: url-protocol-fixture -->

## The client and its error model

The client fetches a book's price and availability. Its error type is the contract under test: each case corresponds to something the UI does differently, and each carries whether retrying can help:

<!-- file: Sources/Library/PriceClient.swift -->
```swift
import Foundation

public struct Offer: Decodable, Equatable, Sendable {
    public let bookID: String
    public let priceCents: Int
    public let currency: String
    public let inStock: Bool

    public init(bookID: String, priceCents: Int, currency: String, inStock: Bool) {
        (self.bookID, self.priceCents, self.currency, self.inStock) = (bookID, priceCents, currency, inStock)
    }
}

public enum OfferError: Error, Equatable, Sendable {
    case cancelled
    case offline
    case unreachable
    case timedOut
    case insecure
    case transport(URLError.Code)
    case notFound
    case unauthorized
    case rateLimited(retryAfter: Int?)
    case rejected(status: Int, problemType: String?)
    case server(status: Int)
    case unexpectedStatus(Int)
    case unexpectedContentType(String?)
    case invalidPayload(String)

    public var isRetryable: Bool {
        switch self {
        case .offline, .unreachable, .timedOut, .transport, .rateLimited: true
        case .server(let status): [502, 503, 504].contains(status)
        default: false
        }
    }
}

public struct PriceClient: Sendable {
    let session: URLSession
    let baseURL: URL
    public init(session: URLSession, baseURL: URL) { (self.session, self.baseURL) = (session, baseURL) }

    public func offer(for bookID: String) async throws(OfferError) -> Offer {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(from: baseURL.appending(components: "offers", bookID))
        } catch let error as URLError {
            throw Self.classify(error)
        } catch {
            throw .transport(.unknown)
        }
        guard let http = response as? HTTPURLResponse else { throw .unexpectedStatus(0) }
        try Self.check(http, data: data)
        guard http.mimeType == "application/json" else { throw .unexpectedContentType(http.mimeType) }
        let offer: Offer
        do { offer = try JSONDecoder().decode(Offer.self, from: data) }
        catch { throw .invalidPayload("undecodable") }
        try Self.validate(offer, requested: bookID)
        return offer
    }

    static func classify(_ error: URLError) -> OfferError {
        switch error.code {
        case .cancelled: .cancelled
        case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff: .offline
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed: .unreachable
        case .timedOut: .timedOut
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateHasUnknownRoot, .serverCertificateNotYetValid, .appTransportSecurityRequiresSecureConnection: .insecure
        default: .transport(error.code)
        }
    }

    static func check(_ http: HTTPURLResponse, data: Data) throws(OfferError) {
        switch http.statusCode {
        case 200..<300: return
        case 401: throw .unauthorized
        case 404, 410: throw .notFound
        case 429: throw .rateLimited(retryAfter: http.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init))
        case 400..<500:
            let type = http.mimeType == "application/problem+json"
                ? (try? JSONDecoder().decode([String: String].self, from: data))?["type"] : nil
            throw .rejected(status: http.statusCode, problemType: type)
        case 500..<600: throw .server(status: http.statusCode)
        default: throw .unexpectedStatus(http.statusCode)
        }
    }

    static func validate(_ offer: Offer, requested bookID: String) throws(OfferError) {
        guard offer.bookID == bookID else { throw .invalidPayload("offer for another book") }
        guard (0...10_000_000).contains(offer.priceCents) else { throw .invalidPayload("price out of range") }
        guard offer.currency.count == 3, offer.currency.allSatisfy({ $0.isASCII && $0.isUppercase }) else {
            throw .invalidPayload("bad currency")
        }
    }
}
```

## A matrix of status codes

Status handling is a function from `(status, headers, body)` to an outcome, so it is tested as a table. Each row is one argument to a parameterized test, and Swift Testing reports every row as its own test case, so a failure names the row:

<!-- file: Tests/LibraryTests/StatusTests.swift -->
```swift
import Foundation
import Testing
@testable import Library

let catalog = URL(string: "https://api.library.example/v1")!
let validOffer = #"{"bookID":"b-7","priceCents":1299,"currency":"EUR","inStock":true}"#

struct StatusCase: Sendable, CustomTestStringConvertible {
    let status: Int
    var headers: [String: String] = ["Content-Type": "application/json"]
    var body = "{}"
    let expected: Result<Offer, OfferError>
    var testDescription: String { "\(status) \(headers["Content-Type"] ?? "-")" }
}

let statusCases: [StatusCase] = [
    StatusCase(status: 200, body: validOffer, expected: .success(Offer(bookID: "b-7", priceCents: 1299, currency: "EUR", inStock: true))),
    StatusCase(status: 203, body: validOffer, expected: .success(Offer(bookID: "b-7", priceCents: 1299, currency: "EUR", inStock: true))),
    StatusCase(status: 204, headers: [:], body: "", expected: .failure(.unexpectedContentType("text/plain"))),
    StatusCase(status: 304, expected: .failure(.unexpectedStatus(304))),
    StatusCase(status: 400, expected: .failure(.rejected(status: 400, problemType: nil))),
    StatusCase(status: 401, expected: .failure(.unauthorized)),
    StatusCase(status: 403, headers: ["Content-Type": "application/problem+json"],
               body: #"{"type":"https://library.example/problems/region-locked","title":"Not sold here"}"#,
               expected: .failure(.rejected(status: 403, problemType: "https://library.example/problems/region-locked"))),
    StatusCase(status: 404, expected: .failure(.notFound)),
    StatusCase(status: 410, expected: .failure(.notFound)),
    StatusCase(status: 422, expected: .failure(.rejected(status: 422, problemType: nil))),
    StatusCase(status: 429, headers: ["Retry-After": "30"], expected: .failure(.rateLimited(retryAfter: 30))),
    StatusCase(status: 429, headers: ["Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"], expected: .failure(.rateLimited(retryAfter: nil))),
    StatusCase(status: 499, expected: .failure(.rejected(status: 499, problemType: nil))),
    StatusCase(status: 500, expected: .failure(.server(status: 500))),
    StatusCase(status: 502, headers: ["Content-Type": "text/html"], body: "<h1>Bad Gateway</h1>", expected: .failure(.server(status: 502))),
    StatusCase(status: 503, expected: .failure(.server(status: 503))),
    StatusCase(status: 504, expected: .failure(.server(status: 504))),
    StatusCase(status: 599, expected: .failure(.server(status: 599))),
    StatusCase(status: 200, headers: ["Content-Type": "text/html"], body: "<html>Sign in to Wi-Fi</html>",
               expected: .failure(.unexpectedContentType("text/html"))),
]

@Suite struct StatusMatrix {
    @Test(arguments: statusCases)
    func mapsStatus(_ row: StatusCase) async {
        let fixture = Fixture { _ in StubResponse(status: row.status, headers: row.headers, body: Data(row.body.utf8)) }
        let client = PriceClient(session: fixture.session(), baseURL: catalog)
        let outcome: Result<Offer, OfferError>
        do { outcome = .success(try await client.offer(for: "b-7")) } catch { outcome = .failure(error) }
        #expect(outcome == row.expected)
    }

    @Test func retryabilityFollowsTheContract() {
        #expect(OfferError.server(status: 503).isRetryable)
        #expect(!OfferError.server(status: 500).isRetryable)
        #expect(OfferError.rateLimited(retryAfter: 30).isRetryable)
        #expect(!OfferError.rejected(status: 400, problemType: nil).isRetryable)
        #expect(!OfferError.cancelled.isRetryable && !OfferError.insecure.isRetryable)
    }
}
```

A few rows deserve a note, because they record decisions rather than obvious facts:

- `204` with no body and no `Content-Type` is reported as `unexpectedContentType("text/plain")`, because a `GET` for an offer must return one. That `text/plain` is the system's default for a missing type, as [the first article](/swift-http-methods-status-codes-headers/) measured. An endpoint where `204` is valid needs its own path through the client, not a special case here.
- `304` cannot occur on a session with a cache, which turns it into the cached `200`, as [the caching article](/swift-http-caching-etag/) showed; without a cache it is a protocol violation for this request.
- `Retry-After` as an HTTP date is parsed as `nil` by this client, which is a known limitation recorded as a test. The `retryAfter` function in [the retry article](/swift-retry-backoff-idempotency/) handles dates; changing the client means changing this row, which is the point of writing it down.
- `499` and `599` are unregistered codes. They fall into their class, as RFC 9110 requires.

## A corpus of invalid payloads

Status `200` with a body the client cannot use is the failure most likely to crash an app, because code tends to trust a successful response. The corpus below collects the shapes of broken payload that real servers produce, each with the outcome the client must report:

<!-- file: Tests/LibraryTests/PayloadTests.swift -->
```swift
import Foundation
import Testing
@testable import Library

struct PayloadCase: Sendable, CustomTestStringConvertible {
    let name: String
    let body: Data
    let expected: Result<Offer, OfferError>
    var testDescription: String { name }

    init(_ name: String, _ body: String, _ expected: Result<Offer, OfferError>) {
        self.init(name, Data(body.utf8), expected)
    }
    init(_ name: String, _ body: Data, _ expected: Result<Offer, OfferError>) {
        (self.name, self.body, self.expected) = (name, body, expected)
    }
}

let dune = Offer(bookID: "b-7", priceCents: 1299, currency: "EUR", inStock: true)
let undecodable = Result<Offer, OfferError>.failure(.invalidPayload("undecodable"))

let payloadCases: [PayloadCase] = [
    PayloadCase("valid", validOffer, .success(dune)),
    PayloadCase("extra fields are ignored", #"{"bookID":"b-7","priceCents":1299,"currency":"EUR","inStock":true,"promo":{"x":1}}"#, .success(dune)),
    PayloadCase("empty body", "", undecodable),
    PayloadCase("truncated", String(validOffer.dropLast(9)), undecodable),
    PayloadCase("not JSON", "OK", undecodable),
    PayloadCase("array instead of object", "[\(validOffer)]", undecodable),
    PayloadCase("null required field", #"{"bookID":"b-7","priceCents":null,"currency":"EUR","inStock":true}"#, undecodable),
    PayloadCase("missing required field", #"{"bookID":"b-7","currency":"EUR","inStock":true}"#, undecodable),
    PayloadCase("number as string", #"{"bookID":"b-7","priceCents":"1299","currency":"EUR","inStock":true}"#, undecodable),
    PayloadCase("fractional cents", #"{"bookID":"b-7","priceCents":12.99,"currency":"EUR","inStock":true}"#, undecodable),
    PayloadCase("overflowing number", #"{"bookID":"b-7","priceCents":99999999999999999999,"currency":"EUR","inStock":true}"#, undecodable),
    PayloadCase("bool as number", #"{"bookID":"b-7","priceCents":1299,"currency":"EUR","inStock":1}"#, undecodable),
    PayloadCase("byte order mark", "\u{FEFF}" + validOffer, .success(dune)),
    PayloadCase("invalid UTF-8", Data([0x7B, 0x22, 0xFF, 0xFE, 0x22, 0x7D]), undecodable),
    PayloadCase("negative price", #"{"bookID":"b-7","priceCents":-1,"currency":"EUR","inStock":true}"#,
                .failure(.invalidPayload("price out of range"))),
    PayloadCase("lowercase currency", #"{"bookID":"b-7","priceCents":1299,"currency":"eur","inStock":true}"#,
                .failure(.invalidPayload("bad currency"))),
    PayloadCase("another book's offer", #"{"bookID":"b-8","priceCents":1299,"currency":"EUR","inStock":true}"#,
                .failure(.invalidPayload("offer for another book"))),
    PayloadCase("deeply nested", String(repeating: "[", count: 10_000) + String(repeating: "]", count: 10_000), undecodable),
]

@Suite struct PayloadCorpus {
    @Test(arguments: payloadCases)
    func handlesPayload(_ row: PayloadCase) async {
        let fixture = Fixture { _ in StubResponse(body: row.body) }
        let client = PriceClient(session: fixture.session(), baseURL: catalog)
        let outcome: Result<Offer, OfferError>
        do { outcome = .success(try await client.offer(for: "b-7")) } catch { outcome = .failure(error) }
        #expect(outcome == row.expected)
    }
}
```

Every row is a real failure mode. Several are covered in depth in [Decoding JSON with `Codable`](/swift-decoding-json-codable/), including the byte order mark the parser accepts and the overflowing number reported as corrupted data. The last three rows decode successfully and are rejected by validation, which is the layer [Validating Decoded Data](/swift-validating-decoded-data/) adds: a response for the wrong book is valid JSON and a dangerous payload. The deeply nested row checks that 10,000 levels of nesting produce an error rather than a stack overflow, which is the kind of input a fuzzer finds and a person rarely thinks to write.

## A table of transport errors

Transport failures come from the session, so the fixture produces them with `didFailWithError`. A table maps each `URLError.Code` to the case the UI needs:

<!-- file: Tests/LibraryTests/TransportTests.swift -->
```swift
import Foundation
import Testing
@testable import Library

let transportCases: [(URLError.Code, OfferError)] = [
    (.notConnectedToInternet, .offline),
    (.dataNotAllowed, .offline),
    (.cannotFindHost, .unreachable),
    (.cannotConnectToHost, .unreachable),
    (.timedOut, .timedOut),
    (.networkConnectionLost, .transport(.networkConnectionLost)),
    (.secureConnectionFailed, .insecure),
    (.serverCertificateUntrusted, .insecure),
    (.appTransportSecurityRequiresSecureConnection, .insecure),
    (.badServerResponse, .transport(.badServerResponse)),
    (.cannotParseResponse, .transport(.cannotParseResponse)),
    (.cancelled, .cancelled),
]

@Suite struct TransportTable {
    @Test(arguments: transportCases)
    func mapsTransportError(_ code: URLError.Code, _ expected: OfferError) async {
        let fixture = Fixture { _ in .failure(code) }
        let client = PriceClient(session: fixture.session(), baseURL: catalog)
        await #expect(throws: expected) { try await client.offer(for: "b-7") }
    }

    @Test func everyCaseIsCoveredOnce() {
        let codes = transportCases.map(\.0.rawValue)
        #expect(Set(codes).count == codes.count)
    }
}
```

The fixture fails the request with the given error, and `URLSession` delivers it to the client unchanged, which is exactly what makes a stub the right tool for this table: producing `serverCertificateUntrusted` or `notConnectedToInternet` for real takes a misconfigured server or an airplane. The table also guards the classification against accidental change. Moving `networkConnectionLost` into `.offline`, a tempting simplification, fails one named row, and the review that follows can discuss whether a lost connection really means the device is offline, which [the transport error article](/swift-transport-vs-application-errors/) argued it does not.

## Exhaustive where it is cheap

The tables above choose their rows. When inputs combine, choosing gets harder: statuses times content types times bodies is a product, and the interesting failures are often at combinations nobody listed. Here the product is small enough to run whole. With $$s$$ statuses, $$t$$ content types, and $$b$$ bodies, the full matrix has:

$$
N = s \cdot t \cdot b = 19 \times 4 \times 6 = 456 \text{ cases}
$$

Stubbed requests take well under a millisecond each, and the whole matrix ran in about a tenth of a second, so the suite can simply check an invariant over all of them instead of an expected value for each: the client either returns a valid offer, which only happens for a `2xx` JSON response with a valid body, or throws, and it never crashes:

<!-- file: Tests/LibraryTests/MatrixTests.swift -->
```swift
import Foundation
import Testing
@testable import Library

@Suite struct ExhaustiveMatrix {
    static let statuses = [200, 201, 202, 203, 204, 206, 301, 304, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]
    static let contentTypes = ["application/json", "application/problem+json", "text/html", "application/json; charset=utf-8"]
    static let bodies = [validOffer, "", "{}", "null", "<html>", #"{"type":"x"}"#]

    @Test func everyCombinationIsHandled() async {
        var successes = 0
        for status in Self.statuses {
            for type in Self.contentTypes {
                for body in Self.bodies {
                    let fixture = Fixture { _ in StubResponse(status: status, headers: ["Content-Type": type], body: Data(body.utf8)) }
                    let client = PriceClient(session: fixture.session(), baseURL: catalog)
                    do {
                        let offer = try await client.offer(for: "b-7")
                        successes += 1
                        #expect((200..<300).contains(status) && body == validOffer && type.hasPrefix("application/json"))
                        #expect(offer == dune)
                    } catch {
                        // Any OfferError is acceptable here; the invariant is that nothing else happens.
                    }
                }
            }
        }
        #expect(successes == 12)  // six 2xx statuses × two JSON content types, including 204: see below
    }
}
```

The final count is a cross-check on the invariant, and it caught something on its first run. The expectation had been ten successes: five `2xx` statuses that carry a body, times two JSON content types, on the reasoning that a `204 No Content` response has no body. The run produced twelve. The stub delivered the valid offer as the body of a `204`, `URLSession` passed it through, and the client accepted it. Over a real connection that cannot happen, because HTTP/1.1 framing ends a `204` response at its headers and the bytes would never be read as its body. It is one more entry for the fidelity table in [the `URLProtocol` article](/swift-urlprotocol-fixtures/): a stub can produce responses no server can, so an invariant that fails under a stub may describe an impossible case rather than a bug. Here the count was updated, with a comment, rather than adding a `204` check to production code for an input that cannot occur.

When the product is too large to run whole, pairwise testing, which covers every pair of values across parameters with far fewer cases, is the standard compromise.

## Mutation fuzzing the decoder

The corpus contains the failures someone thought of. A **mutation fuzzer** finds the ones nobody did: it takes a valid payload, applies random small changes such as flipping a byte, deleting a range, duplicating a range, or inserting a JSON-significant character, and feeds each variant to the client. The property is the same as in the matrix: a valid offer or an `OfferError`, never a crash, and never an offer that fails validation.

The generator is seeded, so a failure is reproducible from the seed printed in its message. `SplitMix64` is a tiny, well-known generator suitable for tests:

<!-- file: Tests/LibraryTests/FuzzTests.swift -->
```swift
import Foundation
import Testing
@testable import Library

struct SplitMix64: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

func mutate(_ input: [UInt8], using random: inout SplitMix64) -> [UInt8] {
    var bytes = input
    for _ in 0..<Int.random(in: 1...4, using: &random) {
        guard !bytes.isEmpty else { break }
        let index = Int.random(in: 0..<bytes.count, using: &random)
        switch Int.random(in: 0..<5, using: &random) {
        case 0: bytes[index] ^= UInt8(1 << Int.random(in: 0..<8, using: &random))       // flip a bit
        case 1: bytes.removeSubrange(index..<min(bytes.count, index + Int.random(in: 1...8, using: &random)))
        case 2: bytes.insert(contentsOf: bytes[index..<min(bytes.count, index + 6)], at: index)   // duplicate
        case 3: bytes.insert(Array("{}[]\",:-0e.\\".utf8).randomElement(using: &random)!, at: index)
        default: bytes[index] = UInt8.random(in: 0...255, using: &random)                  // replace
        }
    }
    return bytes
}

@Suite struct DecoderFuzzing {
    @Test(arguments: [UInt64(1), 2, 3, 4])
    func mutatedOffersNeverEscapeTheErrorModel(seed: UInt64) async {
        var random = SplitMix64(state: seed)
        let original = Array(validOffer.utf8)
        var accepted = 0
        for iteration in 0..<250 {
            let body = Data(mutate(original, using: &random))
            let fixture = Fixture { _ in StubResponse(body: body) }
            let client = PriceClient(session: fixture.session(), baseURL: catalog)
            do {
                let offer = try await client.offer(for: "b-7")
                accepted += 1
                // Anything accepted must satisfy the validation rules.
                #expect(offer.bookID == "b-7" && (0...10_000_000).contains(offer.priceCents) && offer.currency.count == 3,
                        "seed \(seed) iteration \(iteration): \(String(decoding: body, as: UTF8.self))")
            } catch {
                // Every rejection is an OfferError by construction of typed throws.
            }
        }
        print("seed \(seed): \(accepted) of 250 mutants accepted")
    }
}
```

Four seeds of 250 mutants each, a thousand corrupted payloads, ran in about a tenth of a second, in parallel with the other suites. In the measured run, between zero and two mutants per seed were still accepted, changes such as a digit of the price that produce a different but valid offer, and every accepted one satisfied the validation rules. Typed throws make the other half of the property free: `offer(for:)` is declared `throws(OfferError)`, so the compiler guarantees no other error type escapes, and the fuzzer only has to look for crashes and invalid acceptances.

Fuzzing at this scale is a smoke test, not a proof. Its value is in what it finds without being told where to look; when it finds something, the mutant goes into the payload corpus as a named row, and the fuzzer keeps looking.

## Summary

- Test failure handling as tables: one parameterized test per dimension, with each row a named test case and an expected outcome.
- The status matrix records decisions, such as how `204`, `304`, unregistered codes, and date-valued `Retry-After` are treated, so that changing one is a visible change to a row.
- The payload corpus covers empty, truncated, mistyped, null, overflowing, BOM-prefixed, invalid UTF-8, deeply nested, and semantically wrong bodies; the last group is caught by validation, not decoding.
- A stub produces transport errors that are hard to produce for real; a table maps every `URLError.Code` the client distinguishes.
- When the product of inputs is small, run it all and check an invariant; here 456 combinations in about a tenth of a second. The invariant's count exposed a stub-only response, a `204` with a body.
- A seeded mutation fuzzer feeds a thousand corrupted payloads to the client and checks that it never crashes or accepts invalid data; typed throws guarantee the error type.

## Exercise

Add a `currencyMinorUnits` rule to validation (JPY has none, so `priceCents` must be a whole yen amount) and extend the payload corpus with rows that exercise it. Then run the fuzzer with a JPY offer as the seed payload and check whether any mutant slips past the new rule. Finally, add a test that records, using Swift Testing's `withKnownIssue`, the current behavior for an HTTP-date `Retry-After`, so that the day someone implements date parsing the known issue starts failing and reminds them to update the row.

## Further reading

- [Go further with Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10195/), WWDC24, on parameterized tests and known issues.
- Apple's [Swift Testing documentation](https://developer.apple.com/documentation/testing).
- Andreas Zeller et al., [*The Fuzzing Book*](https://www.fuzzingbook.org), on mutation-based fuzzing.

Previous: [Isolating HTTP Fixtures with `URLProtocol`](/swift-urlprotocol-fixtures/). Next: [Verifying Contracts Against a Controlled Server](/swift-contract-testing-controlled-server/).

Return to the [Networking roadmap](/swift-networking/).
