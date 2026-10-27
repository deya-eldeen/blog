---
layout: page
title: "Networking in Swift and iOS"
subtitle: "HTTP clients with clear contracts for failure, freshness, and cancellation"
permalink: /swift-networking/
hide: true
excluded: true
---

Build networking features from HTTP fundamentals through real application lifecycles. This outline covers request construction, decoding, authentication, resilience, transfers, and testing. The titles below are planned topics, ready for future articles.

{% include roadmap/legend.liquid %}

## 1. HTTP and URL Loading

- HTTP Methods, Status Codes, and Headers
- URLs, Query Parameters, and Percent Encoding
- Choosing a `URLSession` Configuration
- Requests and Responses with `async` and `await`
- Separating Transport Errors from Application Failures
{: .roadmap-topics}

## 2. Designing a Client

- Building Typed Endpoints and Request Bodies
- Decoding JSON with `Codable`
- Validating Decoded Data Before It Reaches the UI
- Pagination: Page Numbers, Cursors, and Stable Ordering
- Designing an API Client Around Consumer Needs
{: .roadmap-topics}

## 3. Authentication and Trust

- Authentication Headers and Credential Scope
- Refreshing Credentials Without Duplicate Requests
- App Transport Security and TLS Trust
- Handling Logout During an In-Flight Request
- Redacting Sensitive Data from Network Logs
{: .roadmap-topics}

## 4. Resilience and Freshness

- Timeouts, Cancellation, and Request Lifetimes
- Retry Policies, Backoff, and Idempotency
- HTTP Caching with `Cache-Control` and `ETag`
- Offline Behavior and Reachability Assumptions
- Coalescing Duplicate Requests and Rejecting Stale Results
{: .roadmap-topics}

## 5. Transfers and Live Connections

- Uploading Files and Multipart Form Data
- Download Progress, Resuming, and Temporary Files
- Background Transfers and App Relaunch
- WebSockets: Connection State and Reconnection
- Streaming Responses and Incremental Parsing
{: .roadmap-topics}

## 6. Testing and Observability

- Isolating HTTP Fixtures with `URLProtocol`
- Testing Status Codes, Invalid Payloads, and Transport Errors
- Verifying Contracts Against a Controlled Server
- Reading `URLSessionTaskMetrics`
- Diagnosing Slow Requests and Excessive Network Usage
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-persistence/" next_title="Persistence" %}
