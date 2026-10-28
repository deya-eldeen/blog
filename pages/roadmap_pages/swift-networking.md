---
layout: page
title: "Networking in Swift and iOS"
subtitle: "HTTP clients with clear contracts for failure, freshness, and cancellation"
permalink: /swift-networking/
hide: true
excluded: true
---

Build networking features from HTTP fundamentals through real application lifecycles. The topics move from what `URLSession` puts on the wire, through client design, authentication, and resilience, to transfers, live connections, testing, and diagnosis. Each article measures the behavior it describes and ends with an exercise.

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Most of them talk to `LocalServer`, a small HTTP/1.1 server on the loopback interface whose source is in the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series), so that every claim about redirects, retries, caching, timeouts, and streaming is checked against real requests. The testing articles are Swift packages run with `swift test`, and the iOS-only code in the background transfers article was compiled against the iOS 26 SDK.

Diagrams show request sequences, state machines, and timelines; equations appear where they give a precise answer, such as how many connections a burst needs, how much jitter flattens a retry storm, or how many requests coalescing saves. The [concurrency roadmap](/swift-concurrency-roadmap/) covers the language features these articles rely on.

{% include roadmap/legend.liquid %}

## 1. HTTP and URL Loading

- [HTTP Methods, Status Codes, and Headers](/swift-http-methods-status-codes-headers/)
- [URLs, Query Parameters, and Percent Encoding](/swift-urls-query-percent-encoding/)
- [Choosing a `URLSession` Configuration](/swift-urlsession-configuration/)
- [Requests and Responses with `async` and `await`](/swift-urlsession-async-await/)
- [Separating Transport Errors from Application Failures](/swift-transport-vs-application-errors/)
{: .roadmap-topics}

## 2. Designing a Client

- [Building Typed Endpoints and Request Bodies](/swift-typed-endpoints/)
- [Decoding JSON with `Codable`](/swift-decoding-json-codable/)
- [Validating Decoded Data Before It Reaches the UI](/swift-validating-decoded-data/)
- [Pagination: Page Numbers, Cursors, and Stable Ordering](/swift-pagination-cursors/)
- [Designing an API Client Around Consumer Needs](/swift-api-client-design/)
{: .roadmap-topics}

## 3. Authentication and Trust

- [Authentication Headers and Credential Scope](/swift-authentication-headers-credential-scope/)
- [Refreshing Credentials Without Duplicate Requests](/swift-token-refresh/)
- [App Transport Security and TLS Trust](/swift-ats-tls-trust/)
- [Handling Logout During an In-Flight Request](/swift-logout-in-flight-requests/)
- [Redacting Sensitive Data from Network Logs](/swift-redacting-network-logs/)
{: .roadmap-topics}

## 4. Resilience and Freshness

- [Timeouts, Cancellation, and Request Lifetimes](/swift-network-timeouts-cancellation/)
- [Retry Policies, Backoff, and Idempotency](/swift-retry-backoff-idempotency/)
- [HTTP Caching with `Cache-Control` and `ETag`](/swift-http-caching-etag/)
- [Offline Behavior and Reachability Assumptions](/swift-offline-reachability/)
- [Coalescing Duplicate Requests and Rejecting Stale Results](/swift-request-coalescing/)
{: .roadmap-topics}

## 5. Transfers and Live Connections

- [Uploading Files and Multipart Form Data](/swift-multipart-uploads/)
- [Download Progress, Resuming, and Temporary Files](/swift-download-progress-resume/)
- [Background Transfers and App Relaunch](/swift-background-transfers/)
- [WebSockets: Connection State and Reconnection](/swift-websockets-reconnection/)
- [Streaming Responses and Incremental Parsing](/swift-streaming-responses/)
{: .roadmap-topics}

## 6. Testing and Observability

- [Isolating HTTP Fixtures with `URLProtocol`](/swift-urlprotocol-fixtures/)
- [Testing Status Codes, Invalid Payloads, and Transport Errors](/swift-testing-network-failures/)
- [Verifying Contracts Against a Controlled Server](/swift-contract-testing-controlled-server/)
- [Reading `URLSessionTaskMetrics`](/swift-urlsessiontaskmetrics/)
- [Diagnosing Slow Requests and Excessive Network Usage](/swift-diagnosing-slow-requests/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-persistence/" next_title="Persistence" %}
