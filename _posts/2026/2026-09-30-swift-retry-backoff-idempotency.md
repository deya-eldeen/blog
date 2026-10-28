---
layout: post
hidden: true
title: "Retry Policies, Backoff, and Idempotency"
date: "2026-09-30"
last_modified_at: "2026-09-30"
permalink: /swift-retry-backoff-idempotency/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Resilience, Reliability]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Retrying a failed request is the cheapest reliability improvement a client can make, and one of the easiest ways for a client to make an outage worse. A transient failure, such as a dropped connection on a moving train or a `503` while a server restarts, often succeeds a second later, and retrying turns it into a short delay the user never notices. A million clients retrying at once against a server that is already overloaded keep it overloaded, and a `POST` retried after its response was lost may charge a card twice.

A retry policy has to answer four questions: which failures are worth retrying, whether *this* request is safe to send again, how long to wait between attempts, and when to stop. This article answers each one with a measurement or a simulation: a server that dedupes payments with an idempotency key, a herd of 1,000 simulated clients with and without jitter, retry amplification across layers, and a retry budget that keeps a total outage from multiplying load.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. They send requests to `LocalServer`, the loopback HTTP server from the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`.

<!-- check-uses: local-server -->

## Which failures to retry

A retry helps only if the next attempt has a reasonable chance of a different outcome. The classification from [Separating Transport Errors from Application Failures](/swift-transport-vs-application-errors/) gives the answer for most cases:

| Failure | Retry? | Why |
|---|---|---|
| `networkConnectionLost`, `timedOut`, `cannotConnectToHost`, `cannotFindHost` | Yes, with backoff | Transient network conditions |
| `notConnectedToInternet` | Not on a timer | Wait for connectivity instead (see [Offline Behavior](/swift-offline-reachability/)) |
| `cancelled` | Never | Someone stopped waiting |
| TLS and trust failures | Never | The next attempt will meet the same certificate |
| `408`, `429`, `502`, `503`, `504` | Yes, honoring `Retry-After` | The server or a gateway says "later" |
| `500` | Rarely | Usually a bug that repeats for the same request |
| Other `4xx` | Never | The request itself is wrong; sending it again sends the same mistake |
| Decoding failures | Never | The response arrived; it will arrive again |

`Retry-After` ([RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)) is the server telling the client exactly how long to wait, either as a number of seconds or as an HTTP date. When it is present it replaces the client's own backoff for that attempt, and a client that ignores it on a `429` is the reason servers start returning `429` more often.

```swift
import Foundation
import Synchronization

func retryAfter(_ response: HTTPURLResponse, now: Date = .now) -> Duration? {
    guard let value = response.value(forHTTPHeaderField: "Retry-After")?.trimmingCharacters(in: .whitespaces) else {
        return nil
    }
    if let seconds = Int(value), seconds >= 0 { return .seconds(seconds) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "GMT")
    formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"   // IMF-fixdate, RFC 9110 §5.6.7
    guard let date = formatter.date(from: value) else { return nil }
    return .milliseconds(max(0, Int(date.timeIntervalSince(now) * 1000)))
}

let sample = HTTPURLResponse(url: URL(string: "https://x.example")!, statusCode: 503, httpVersion: nil,
                             headerFields: ["Retry-After": "Wed, 30 Sep 2026 12:00:30 GMT"])!
let reference = ISO8601DateFormatter().date(from: "2026-09-30T12:00:00Z")!
assert(retryAfter(sample, now: reference) == .seconds(30))
```

## Whether this request may be sent again

The second question is about the request, not the failure. [The first article](/swift-http-methods-status-codes-headers/) defined an idempotent request as one where $$n$$ deliveries leave the server in the same state as one. `GET`, `HEAD`, `PUT`, and `DELETE` are idempotent by definition, so retrying them is always safe. `POST` is not, and the dangerous case is precisely the one retries exist for: the request reached the server, the server acted on it, and the response was lost.

The standard solution is an **idempotency key**: a unique value the client generates once per logical operation and sends with every attempt. The server records the key with the result of the first request that carried it, and answers any later request with the same key by returning that recorded result instead of acting again. The IETF is standardizing the header as [`Idempotency-Key`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), and payment APIs such as Stripe's have used it for years.

The server below creates a payment and then, on the first attempt only, closes the connection *after* processing it, which is the lost-response case:

```swift
final class PaymentServer: Sendable {
    struct State {
        var payments: [String] = []
        var results: [String: String] = [:]  // idempotency key -> response body
        var dropNext = true
    }
    let state = Mutex(State())

    func handle(_ request: HTTPRequest) -> HTTPResponse {
        guard request.method == "POST", request.path == "/payments" else { return .text("not found", status: 404) }
        return state.withLock { state in
            if let key = request.header("Idempotency-Key"), let recorded = state.results[key] {
                return .json(recorded, status: 201)        // replay: no second payment
            }
            let id = "pay-\(state.payments.count + 1)"
            state.payments.append(id)
            let body = #"{"id":"\#(id)"}"#
            if let key = request.header("Idempotency-Key") { state.results[key] = body }
            if state.dropNext {
                state.dropNext = false
                return .drop                                // processed, but the response is lost
            }
            return .json(body, status: 201)
        }
    }
}

func pay(at server: LocalServer, key: String?) async throws -> String {
    var request = URLRequest(url: server.baseURL.appending(path: "payments"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data(#"{"amount":1999,"currency":"EUR"}"#.utf8)
    if let key { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
    let (data, _) = try await URLSession(configuration: .ephemeral).data(for: request)
    return String(decoding: data, as: UTF8.self)
}

func payWithOneRetry(at server: LocalServer, key: String?) async throws -> String {
    do {
        return try await pay(at: server, key: key)
    } catch let error as URLError where error.code == .networkConnectionLost {
        return try await pay(at: server, key: key)  // the outcome was unknown, so try again
    }
}

let withoutKey = PaymentServer()
let unkeyedServer = try await LocalServer.start { withoutKey.handle($0) }
_ = try await payWithOneRetry(at: unkeyedServer, key: nil)
assert(withoutKey.state.withLock { $0.payments } == ["pay-1", "pay-2"])  // charged twice

let withKey = PaymentServer()
let keyedServer = try await LocalServer.start { withKey.handle($0) }
let operationKey = UUID().uuidString  // generated once per user action, reused on every attempt
let receipt = try await payWithOneRetry(at: keyedServer, key: operationKey)
assert(withKey.state.withLock { $0.payments } == ["pay-1"])              // charged once
assert(receipt == #"{"id":"pay-1"}"#)                                    // and the client learned the result
```

The key must be created when the *user* acts, stored with the operation, and reused for every attempt, including attempts after an app restart if the operation is queued, as in [Offline Behavior and Reachability Assumptions](/swift-offline-reachability/). Generating a fresh key inside the retry loop defeats the mechanism entirely. Recall also that `URLSession` itself retries only `GET` and `HEAD` on a lost connection, never `POST`, so for a `POST` this retry is entirely the app's decision.

## How long to wait: backoff and jitter

Retrying immediately is right only for a failure that is purely local to one connection. For anything that might be load-related, the client should wait, and wait longer after each failure, so that the load it adds falls as the failure persists. **Exponential backoff** waits $$b \cdot 2^n$$ before attempt $$n+1$$, capped at some maximum $$c$$:

$$
d_n = \min(c,\; b \cdot 2^n)
$$

Exponential backoff alone has a flaw that only shows up at scale. Clients that fail at the same moment, because the server restarted, retry at the same moments too: all of them after $$b$$, again after $$2b$$, and so on. The load arrives in synchronized waves, each one as large as the original spike. The fix is **jitter**, randomizing each delay. The "full jitter" variant from Marc Brooker's analysis on the [AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) draws the delay uniformly between zero and the exponential value:

$$
d_n \sim \mathcal{U}\big(0,\; \min(c,\; b \cdot 2^n)\big),
\qquad
\mathbb{E}[d_n] = \tfrac{1}{2}\min(c,\; b \cdot 2^n)
$$

Full jitter waits half as long on average and spreads the retries uniformly over each window instead of stacking them at its end. The simulation below makes the difference concrete. A thousand clients fail at time zero, and each retries up to five times with $$b = 100$$ ms and $$c = 2$$ s. It counts the retries that land in each 10 ms bucket:

```swift
struct Backoff: Sendable {
    var base: Duration = .milliseconds(100)
    var cap: Duration = .seconds(2)
    var jitter = true

    func delay(forAttempt attempt: Int, using random: inout some RandomNumberGenerator) -> Duration {
        let exponential = min(cap, base * (1 << min(attempt, 30)))
        guard jitter else { return exponential }
        let milliseconds = Double(exponential.components.seconds) * 1000 + Double(exponential.components.attoseconds) / 1e15
        return .milliseconds(Int.random(in: 0...Int(milliseconds), using: &random))
    }
}

func peakRetriesPerBucket(clients: Int, backoff: Backoff, bucket: Duration = .milliseconds(10)) -> Int {
    var generator = SystemRandomNumberGenerator()
    var buckets: [Int: Int] = [:]
    let bucketMilliseconds = Int(bucket.components.attoseconds / 1_000_000_000_000_000) + Int(bucket.components.seconds) * 1000
    for _ in 0..<clients {
        var time = Duration.zero
        for attempt in 0..<5 {
            time += backoff.delay(forAttempt: attempt, using: &generator)
            let milliseconds = Int(time.components.seconds) * 1000 + Int(time.components.attoseconds / 1_000_000_000_000_000)
            buckets[milliseconds / bucketMilliseconds, default: 0] += 1
        }
    }
    return buckets.values.max() ?? 0
}

let synchronized = peakRetriesPerBucket(clients: 1000, backoff: Backoff(jitter: false))
let jittered = peakRetriesPerBucket(clients: 1000, backoff: Backoff(jitter: true))
print("peak retries per 10 ms: without jitter \(synchronized), with full jitter \(jittered)")
assert(synchronized == 1000)        // every client retries in the same bucket, five times over
assert(jittered < 250)              // spread out by a factor of six or more
```

Without jitter, the peak was exactly 1,000: every client retried in the same 10 ms window, and did so five times, at 100, 300, 700, 1,500, and 3,100 ms. With full jitter, the peak over six runs was between 149 and 164. The first retry window alone spreads 1,000 clients over 100 ms, ten buckets of about 100, and later attempts overlapping it add the rest. The server sees the same total number of retries in both cases. What changes is whether they arrive as five spikes the size of the original failure or as a spread it can absorb.

## When to stop: amplification and budgets

Retries multiply load, and the multiplication compounds when several layers retry independently. If each of $$k$$ layers makes up to $$r + 1$$ attempts for every attempt it receives, a single user action can reach the bottom layer:

$$
A = (r + 1)^k
$$

times. An app that tries three times, over a `URLSession` that replays a `GET` up to three times on a lost connection (as measured in [HTTP Methods, Status Codes, and Headers](/swift-http-methods-status-codes-headers/)), through a gateway that tries twice, can send $$3 \times 3 \times 2 = 18$$ requests to the backend for one tap. During an outage, every user's traffic is multiplied by that factor at exactly the moment the backend can least afford it.

Two rules contain it. Retry at **one layer** only, ideally the one closest to the user, which knows whether anyone is still waiting. And cap retries with a **retry budget**: a client may retry only while recent retries are a small fraction of recent requests. This is the approach of gRPC's [retry throttling](https://github.com/grpc/proposal/blob/master/A6-client-retries.md) and Finagle's retry budgets. A token bucket implements it: each successful request adds a fraction of a token, each retry spends one, and retries stop when the bucket is empty.

```swift
final class RetryBudget: Sendable {
    private let state: Mutex<Double>
    let ratio: Double
    let capacity: Double

    init(ratio: Double = 0.1, capacity: Double = 10) {
        self.ratio = ratio
        self.capacity = capacity
        self.state = Mutex(capacity)
    }

    func recordRequest() { state.withLock { $0 = min(capacity, $0 + ratio) } }

    func tryRetry() -> Bool {
        state.withLock { tokens in
            guard tokens >= 1 else { return false }
            tokens -= 1
            return true
        }
    }
}

func simulatedLoad(requests: Int, failureRate: Double, attempts: Int, budget: RetryBudget?) -> Int {
    var sent = 0
    for _ in 0..<requests {
        for attempt in 0..<attempts {
            if attempt > 0, let budget, !budget.tryRetry() { break }
            sent += 1
            budget?.recordRequest()
            if Double.random(in: 0..<1) >= failureRate { break }
        }
    }
    return sent
}

let healthy = simulatedLoad(requests: 10_000, failureRate: 0.01, attempts: 3, budget: RetryBudget())
let outageNoBudget = simulatedLoad(requests: 10_000, failureRate: 1.0, attempts: 3, budget: nil)
let outageWithBudget = simulatedLoad(requests: 10_000, failureRate: 1.0, attempts: 3, budget: RetryBudget())
print("healthy \(healthy), outage without budget \(outageNoBudget), with budget \(outageWithBudget)")
assert(healthy < 10_200)                                  // transient failures are still retried
assert(outageNoBudget == 30_000)                          // a total outage triples the load
assert(outageWithBudget < 11_200)                         // the budget holds it near 1.1×
```

In a healthy system with 1% transient failures, the budget never runs out and every retry happens. In a total outage, retries without a budget triple the load, while with a 10% budget the load stays near 1.1 times normal. The budget adapts on its own: it permits retries exactly when they are rare enough to be likely transient.

## A retry policy in the transport

The pieces combine into one function: classify the outcome, check idempotency, wait with jitter or `Retry-After`, respect the overall deadline from [Timeouts, Cancellation, and Request Lifetimes](/swift-network-timeouts-cancellation/), and spend budget. Waiting is injected as a closure, so tests can record delays instead of sleeping:

```swift
struct RetryPolicy: Sendable {
    var maxAttempts = 3
    var backoff = Backoff()
    var budget = RetryBudget()
    var retryableStatuses: Set<Int> = [408, 429, 502, 503, 504]
    var retryableErrors: Set<URLError.Code> = [.networkConnectionLost, .timedOut, .cannotConnectToHost, .cannotFindHost]

    func isIdempotent(_ request: URLRequest) -> Bool {
        let method = request.httpMethod ?? "GET"
        return ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"].contains(method)
            || request.value(forHTTPHeaderField: "Idempotency-Key") != nil
    }
}

func send(_ request: URLRequest, policy: RetryPolicy, session: URLSession = .shared,
          sleep: @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) async throws -> (Data, HTTPURLResponse) {
    var generator = SystemRandomNumberGenerator()
    var attempt = 0
    while true {
        policy.budget.recordRequest()
        let delay: Duration
        do {
            let (data, response) = try await session.data(for: request)
            let http = response as! HTTPURLResponse
            guard policy.retryableStatuses.contains(http.statusCode) else { return (data, http) }
            guard attempt + 1 < policy.maxAttempts, policy.isIdempotent(request), policy.budget.tryRetry() else {
                return (data, http)
            }
            delay = retryAfter(http) ?? policy.backoff.delay(forAttempt: attempt, using: &generator)
        } catch let error as URLError where policy.retryableErrors.contains(error.code) {
            guard attempt + 1 < policy.maxAttempts, policy.isIdempotent(request), policy.budget.tryRetry() else {
                throw error
            }
            delay = policy.backoff.delay(forAttempt: attempt, using: &generator)
        }
        try await sleep(delay)
        attempt += 1
    }
}
```

A server that fails twice and then succeeds, once with a `Retry-After`, exercises every branch. The recorded delays show which rule chose each wait:

```swift
let flakyCount = Mutex(0)
let flaky = try await LocalServer.start { request in
    let count = flakyCount.withLock { count in count += 1; return count }
    switch (request.path, count) {
    case ("/books", 1): return HTTPResponse(status: 503, headers: [("Retry-After", "1")])
    case ("/books", 2): return HTTPResponse(status: 502)
    case ("/books", 3): return .drop
    case ("/books", _): return .json(#"["Dune"]"#)
    case ("/broken", _): return .text("bad request", status: 400)
    default: return .text("x")
    }
}

final class Delays: Sendable {
    let recorded = Mutex<[Duration]>([])
}
let delays = Delays()
let recordOnly: @Sendable (Duration) async throws -> Void = { delay in delays.recorded.withLock { $0.append(delay) } }

let (books, booksResponse) = try await send(URLRequest(url: flaky.baseURL.appending(path: "books")),
                                            policy: RetryPolicy(), session: URLSession(configuration: .ephemeral),
                                            sleep: recordOnly)
assert(booksResponse.statusCode == 200 && books == Data(#"["Dune"]"#.utf8))
let waits = delays.recorded.withLock { $0 }
assert(waits.count == 2)
assert(waits[0] == .seconds(1))                       // Retry-After overrode the backoff
assert(waits[1] <= .milliseconds(200))                // full jitter, second attempt: U(0, 200 ms)
assert(flaky.requests.filter { $0.path == "/books" }.count == 4)  // three app attempts, four server hits

let before400 = flaky.requests.count
let (_, badResponse) = try await send(URLRequest(url: flaky.baseURL.appending(path: "broken")), policy: RetryPolicy(),
                                      sleep: recordOnly)
assert(badResponse.statusCode == 400 && flaky.requests.count - before400 == 1)  // never retried

var postRequest = URLRequest(url: flaky.baseURL.appending(path: "books"))
postRequest.httpMethod = "POST"
assert(!RetryPolicy().isIdempotent(postRequest))
postRequest.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
assert(RetryPolicy().isIdempotent(postRequest))
```

The app made three attempts and waited twice: one second because the `503` said so, then a jittered delay of at most 200 ms after the `502`. The server, however, counted four requests. The third attempt's connection was dropped before any response, and `URLSession` replayed the `GET` on a new connection by itself, as measured in the first article, so the app saw a `200` and never knew. That is a small, live example of the amplification above: two retry layers, each behaving correctly, and a server that receives more requests than either layer intended. It is a reason to keep the app's own `maxAttempts` low for `GET`, and to count attempts at the server, as `flaky.requests` does here, when tuning a policy.

## Summary

- Retry only failures that can change: transient transport errors and `408`, `429`, `502`, `503`, `504`. Never retry cancellation, trust failures, other `4xx`, or decoding errors, and wait for connectivity rather than retrying offline.
- Honor `Retry-After`, in seconds or as an HTTP date.
- Retry non-idempotent requests only with an idempotency key, created once per user action. Measured: without one, a lost response led to two payments; with one, to one payment and a correct receipt.
- Use exponential backoff with full jitter, $$\mathcal{U}(0, \min(c, b\,2^n))$$. In the simulation, jitter cut the peak retry load per 10 ms from 1,000 to about 150.
- Layered retries multiply, $$(r+1)^k$$. Retry at one layer and cap retries with a budget; the 10% budget kept a total outage at about 1.1× normal load instead of 3×.
- Inject the sleep so policies can be tested without waiting.

## Exercise

Add decorrelated jitter, $$d_{n+1} = \min(c, \mathcal{U}(b, 3 d_n))$$, to `Backoff`, and extend the simulation to report, for each strategy, the peak bucket, the mean time until a client's fifth retry, and the total time until 99% of clients have succeeded when the server recovers 1.5 seconds after the failure and can serve 60 requests per 10 ms. Which strategy recovers the fleet fastest, and which is kindest to the server during the outage?

## Further reading

- Marc Brooker, [*Exponential Backoff And Jitter*](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), AWS Architecture Blog.
- Google SRE book, [*Addressing Cascading Failures*](https://sre.google/sre-book/addressing-cascading-failures/), on retry amplification and budgets.
- The IETF draft [*The Idempotency-Key HTTP Header Field*](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
- gRPC's [retry design (A6)](https://github.com/grpc/proposal/blob/master/A6-client-retries.md), including retry throttling.

Previous: [Timeouts, Cancellation, and Request Lifetimes](/swift-network-timeouts-cancellation/). Next: [HTTP Caching with `Cache-Control` and `ETag`](/swift-http-caching-etag/).

Return to the [Networking roadmap](/swift-networking/).
