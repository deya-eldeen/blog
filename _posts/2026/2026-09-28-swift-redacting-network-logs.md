---
layout: post
hidden: true
title: "Redacting Sensitive Data from Network Logs"
date: "2026-09-28"
last_modified_at: "2026-09-28"
permalink: /swift-redacting-network-logs/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Privacy, Logging]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Network logs are the most useful diagnostic an app has and one of the easiest ways for it to leak what it was trusted with. A log line that prints a request prints its `Authorization` header. One that prints a URL prints the token in its query string and the email address in its path. One that prints a response body prints the new access token from a sign-in. Those lines end up in sysdiagnose archives users send to support, in crash reporter breadcrumbs, in third-party analytics, and in screenshots of the Xcode console pasted into chat.

The fix is not to stop logging. It is to decide, in code, which parts of an exchange are safe to record, and to make everything else impossible to record by accident. This article measures what Apple's unified logging redacts on its own, which turns out to be less than its defaults suggest. It then builds an allowlist-based redactor for URLs, headers, and bodies, and a test that proves no secret reaches a log by planting **canary** values and searching for them.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. They send requests to `LocalServer`, the loopback HTTP server from the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`.

<!-- check-uses: local-server -->

## What is sensitive in an exchange

Almost every part of an HTTP exchange can carry something that must not be logged. Listing them by location is more useful than listing them by kind, because a redactor works by location:

| Location | Examples of sensitive content |
|---|---|
| URL userinfo | `https://user:password@host/` |
| URL path | `/users/alice@example.com/loans`, `/reset/8f2c...e91` (a one-time token) |
| URL query | `?access_token=...`, `?email=...`, `?lat=51.5072&lon=-0.1276` |
| Request headers | `Authorization`, `Cookie`, `X-API-Key`, `Proxy-Authorization` |
| Response headers | `Set-Cookie`, `Location` with a signed URL |
| Request body | Passwords, addresses, payment details, free text |
| Response body | Access and refresh tokens, personal data, other users' data |

Two properties of this table shape the design. First, sensitive data appears in places that change with every API version: a new query parameter, a new header, a new body field. A **denylist** of known secrets is out of date the day a server adds `X-Session-Token`. An **allowlist** of fields known to be safe fails closed: a new field is redacted until someone decides it is safe. Second, the location of data matters as much as the value: an ID in a path is fine to log when it is a book ID and not fine when it is an email address.

## What unified logging redacts by itself

`os.Logger` has a privacy system: each interpolated value can be marked `.public`, `.private`, `.private(mask: .hash)`, or `.sensitive`, and values marked private are replaced by `<private>` in the persisted log unless a debugger is attached or the device has a logging profile installed. Apple's documentation says that dynamic strings are private by default. A small program logged the same kinds of values with and without explicit markers, and `log show` was used to read what was persisted:

```text
default, string literal:       default string: Bearer secret-123
default, URL from a literal:   url default: https://api.example.com/x?token=abc
default, runtime string:       dyn default: <private>
default, runtime URL:          url dynamic: <private>
default, dictionary, struct:   dict: <private>      custom: <private>
default, integer:              int default: 42
.public:                       public: Bearer secret-123
.private, .sensitive:          private: <private>   sensitive: <private>
.private(mask: .hash) twice:   hash: <mask.hash: 'EG2YAW30mwpeACZehG5X7w=='>  (identical both times)
```

Values computed at runtime were redacted by default, as documented. Values whose characters come straight from the app's binary, a string literal or a `URL` created from one, were **logged in the clear** under the same default. The logging system treats text in the binary's constant data as static, and static strings as public. That is a reasonable rule for log messages, which are literals, and a dangerous one for an API key or a token embedded in the source code as a constant, which is exactly where API keys tend to live.

Three conclusions follow:

- **Never rely on the default.** Mark every interpolated value with an explicit privacy level, so that what reaches the log does not depend on where a string's bytes happen to live.
- **Redact before logging, not by logging.** `<private>` protects the persisted log, but the Xcode console shows the full value, and so does any log forwarder that runs in your process, such as a crash reporter's breadcrumb hook. Data that is never interpolated cannot leak through any of them.
- **Integers are public by default.** A user ID logged as an `Int` is in the clear.

### Hashing is pseudonymous, not anonymous

`.private(mask: .hash)` replaces the value with a hash, and the same value produced the same hash both times. That allows correlation ("these three failures were the same user") without showing the value. It does not make the value unrecoverable when the space of possible values is small. A phone number has at most about $$10^{10}$$ possibilities in a given country, and a modern GPU computes SHA-256 at more than $$10^{9}$$ hashes per second, so trying every number takes:

$$
\frac{10^{10}}{10^{9}\ \text{s}^{-1}} = 10\ \text{seconds}
$$

Email addresses have more entropy, but a list of leaked addresses makes them just as easy to test. A salt known only to the device helps against someone holding only the log, which is the threat the system's mask is designed for. Treat hashed identifiers in your own analytics and logs as personal data, which is also how privacy regulations such as the GDPR treat pseudonymous data.

## An allowlist redactor

The redactor below works on the three places that matter: the URL, the headers, and the body. For each, it keeps only what an allowlist names, and replaces everything else with a marker that says *something* was there, which is often what a diagnosis needs.

```swift
import Foundation
import Synchronization
import os

struct Redactor: Sendable {
    var safeHeaders: Set<String> = ["accept", "accept-encoding", "accept-language", "cache-control", "content-encoding",
                                    "content-length", "content-type", "date", "etag", "if-none-match", "last-modified",
                                    "retry-after", "user-agent", "x-request-id", "age", "vary"]
    var safeQueryItems: Set<String> = ["limit", "sort", "page", "include", "fields"]
    var safeJSONKeys: Set<String> = ["id", "status", "error", "error_description", "type", "title", "code", "count", "next"]
    var marker = "<redacted>"

    func url(_ url: URL?) -> String {
        guard let url, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return "<no url>" }
        components.user = nil
        components.password = nil
        components.fragment = nil
        components.percentEncodedPath = components.percentEncodedPath
            .split(separator: "/", omittingEmptySubsequences: false)
            .map { segment(String($0)) }
            .joined(separator: "/")
        components.percentEncodedQueryItems = components.percentEncodedQueryItems?.map { item in
            safeQueryItems.contains(item.name.lowercased()) ? item : URLQueryItem(name: item.name, value: "REDACTED")
        }
        return components.string ?? "<unprintable url>"
    }

    /// Path segments that look like personal data or secrets are replaced; route words and short IDs are kept.
    func segment(_ raw: String) -> String {
        let decoded = raw.removingPercentEncoding ?? raw
        if decoded.contains("@") { return ":email" }
        if decoded.wholeMatch(of: /[0-9]{7,}/) != nil { return ":number" }
        if decoded.wholeMatch(of: /[0-9a-fA-F-]{32,36}/) != nil { return ":uuid" }
        if decoded.wholeMatch(of: /[A-Za-z0-9_\-\.=]{24,}/) != nil { return ":token" }
        return raw
    }

    func headers(_ fields: [String: String]) -> [String] {
        fields.keys.sorted().map { name in
            safeHeaders.contains(name.lowercased()) ? "\(name): \(fields[name]!)" : "\(name): \(marker)"
        }
    }

    func body(_ data: Data?, contentType: String?) -> String {
        guard let data, !data.isEmpty else { return "<empty>" }
        guard contentType?.lowercased().contains("json") == true,
              let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
            return "<\(data.count) bytes \(contentType ?? "unknown type")>"
        }
        let redacted = redactJSON(object)
        let text = (try? JSONSerialization.data(withJSONObject: redacted, options: [.sortedKeys, .fragmentsAllowed]))
            .map { String(decoding: $0, as: UTF8.self) } ?? "<json>"
        return text
    }

    private func redactJSON(_ value: Any, key: String? = nil) -> Any {
        switch value {
        case let object as [String: Any]:
            return object.reduce(into: [String: Any]()) { result, pair in
                result[pair.key] = redactJSON(pair.value, key: pair.key)
            }
        case let array as [Any]:
            return array.map { redactJSON($0, key: key) }
        default:
            guard let key, safeJSONKeys.contains(key.lowercased()) else { return marker }
            return value
        }
    }
}
```

Each choice in it is a deliberate one:

- **Userinfo and fragments are always removed.** Neither has a diagnostic use worth the risk.
- **Query values are replaced, names are kept.** Knowing that a request had a `token` parameter is useful; its value never is.
- **Path segments are classified by shape.** Route words such as `books` and short IDs such as `b-7` are kept, because a log that says `GET /:x/:x/:x` is useless. Emails, long numbers, UUIDs, and long token-like strings are replaced by what they looked like. This is a heuristic, which is why the allowlists for headers, query items, and keys do the heavy lifting and the path rule is a backstop.
- **JSON keeps its structure.** Every key is printed, and values survive only under allowlisted keys, so a log shows `{"access_token":"<redacted>","expires_in":"<redacted>"}` and the shape of a failing response is still visible.
- **Non-JSON bodies are summarized** as a byte count and a type. Logging form bodies, multipart uploads, or images verbatim is never worth it.

The redactor's behavior on the URLs from the table above:

```swift
let redactor = Redactor()
assert(redactor.url(URL(string: "https://alice:hunter2@api.example.com/users/alice@example.com/loans?limit=20&token=abc#top"))
       == "https://api.example.com/users/:email/loans?limit=20&token=REDACTED")
assert(redactor.url(URL(string: "https://api.example.com/reset/8f2c4e9a1b3d4f5a6b7c8d9e0f1a2b3c"))
       == "https://api.example.com/reset/:uuid")
assert(redactor.url(URL(string: "https://api.example.com/books/b-7/reviews?sort=-date"))
       == "https://api.example.com/books/b-7/reviews?sort=-date")
assert(redactor.url(URL(string: "https://api.example.com/geo?lat=51.5072&lon=-0.1276"))
       == "https://api.example.com/geo?lat=REDACTED&lon=REDACTED")

assert(redactor.headers(["Authorization": "Bearer x", "Content-Type": "application/json", "X-Session": "s"])
       == ["Authorization: <redacted>", "Content-Type: application/json", "X-Session: <redacted>"])

let tokenBody = Data(#"{"access_token":"eyJ.secret","expires_in":3600,"user":{"id":"u-1","email":"a@b.c"}}"#.utf8)
assert(redactor.body(tokenBody, contentType: "application/json")
       == #"{"access_token":"<redacted>","expires_in":"<redacted>","user":{"email":"<redacted>","id":"u-1"}}"#)
assert(redactor.body(Data("password=hunter2".utf8), contentType: "application/x-www-form-urlencoded")
       == "<16 bytes application/x-www-form-urlencoded>")
```

`expires_in` was redacted, which is harmless but shows the allowlist working as designed: nothing is logged that nobody decided to log. Adding it to `safeJSONKeys` is a one-line, reviewable change.

## A logging transport that cannot leak

The redactor is used in one place: a transport decorator, in the style of [Designing an API Client Around Consumer Needs](/swift-api-client-design/), that writes one line per exchange to a sink. The line is built *only* from redacted parts, so the sink can mark it `.public`:

```swift
protocol LogSink: Sendable {
    func write(_ line: String)
}

struct OSLogSink: LogSink {
    let logger = Logger(subsystem: "com.example.library", category: "network")
    func write(_ line: String) {
        logger.notice("\(line, privacy: .public)")  // already redacted; explicit, not default
    }
}

final class MemorySink: LogSink {
    private let lines = Mutex<[String]>([])
    func write(_ line: String) { lines.withLock { $0.append(line) } }
    var all: [String] { lines.withLock { $0 } }
}

struct RedactingLoggingTransport: Sendable {
    let session: URLSession
    let redactor: Redactor
    let sink: any LogSink
    var logBodies = false

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let started = ContinuousClock.now
        let requestID = UUID().uuidString.prefix(8)
        var request = request
        request.setValue(String(requestID), forHTTPHeaderField: "X-Request-ID")
        let method = request.httpMethod ?? "GET"
        let target = redactor.url(request.url)
        sink.write("→ \(requestID) \(method) \(target) \(redactor.headers(request.allHTTPHeaderFields ?? [:]))"
                   + (logBodies ? " body=\(redactor.body(request.httpBody, contentType: request.value(forHTTPHeaderField: "Content-Type")))" : ""))
        do {
            let (data, response) = try await session.data(for: request)
            let http = response as! HTTPURLResponse
            let headers = (http.allHeaderFields as? [String: String]) ?? [:]
            sink.write("← \(requestID) \(http.statusCode) \(data.count)B \(ContinuousClock.now - started) \(redactor.headers(headers))"
                       + (logBodies ? " body=\(redactor.body(data, contentType: http.value(forHTTPHeaderField: "Content-Type")))" : ""))
            return (data, http)
        } catch let error as URLError {
            sink.write("← \(requestID) URLError \(error.code.rawValue) \(ContinuousClock.now - started)")
            throw error
        }
    }
}
```

The `X-Request-ID` header is the most valuable field in the line. It costs nothing, it is safe to log on both sides, and when the server logs it too, a support engineer can find the server's full, access-controlled record of an exchange from the client's redacted one. That division of labor is the right one: the server's logs live in a system with access controls and retention policies, and the client's logs end up on users' devices and in support tickets.

## Proving nothing leaks: canary tests

A redactor is only as good as its tests, and tests that check for *known* secrets miss the new header nobody thought of. A **canary test** turns the question around. It plants unique, recognizable values in every place a secret could hide, runs real exchanges through the logging transport, and then searches every log line for any canary:

```swift
let canaries = (1...9).map { "CANARY\($0)" + UUID().uuidString.prefix(12).replacing("-", with: "") }

let leakServer = try await LocalServer.start { request in
    HTTPResponse(status: 200,
                 headers: [("Content-Type", "application/json"),
                           ("Set-Cookie", "session=\(canaries[6]); HttpOnly"),
                           ("X-Debug-Token", canaries[7])],
                 body: [.bytes(Data(#"{"id":"b-7","access_token":"\#(canaries[8])","next":null}"#.utf8))])
}

let sink = MemorySink()
let transport = RedactingLoggingTransport(session: URLSession(configuration: .ephemeral),
                                          redactor: Redactor(), sink: sink, logBodies: true)

var components = URLComponents(url: leakServer.baseURL.appending(path: "users/\(canaries[0])@example.com/books"),
                               resolvingAgainstBaseURL: false)!
components.queryItems = [URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "session", value: canaries[1])]
var request = URLRequest(url: components.url!)
request.httpMethod = "POST"
request.setValue("Bearer \(canaries[2])", forHTTPHeaderField: "Authorization")
request.setValue("theme=dark; sid=\(canaries[3])", forHTTPHeaderField: "Cookie")
request.setValue(canaries[4], forHTTPHeaderField: "X-New-Secret-Header")  // a header nobody listed
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.httpBody = Data(#"{"password":"\#(canaries[5])","id":"b-7"}"#.utf8)

let (responseData, response) = try await transport.send(request)
assert(response.statusCode == 200 && String(decoding: responseData, as: UTF8.self).contains(canaries[8]))

let logged = sink.all.joined(separator: "\n")
print(logged)
let leaks = canaries.filter { logged.contains($0) }
assert(leaks.isEmpty, "leaked: \(leaks)")

// The log is still useful:
assert(logged.contains("POST"))
assert(logged.contains("/users/:email/books?limit=20&session=REDACTED"))
assert(logged.contains("← ") && logged.contains(" 200 "))
assert(logged.contains(#""id":"b-7""#))
assert(logged.contains("X-Request-ID: "))
let sentRequestID = leakServer.requests.last?.header("X-Request-ID")
assert(sentRequestID.map { logged.contains($0) } == true)  // the same ID the server received
```

The canary in `X-New-Secret-Header` is the point of the exercise: no one listed that header as sensitive, and it was redacted anyway because no one listed it as safe. The canaries are long, random, and prefixed, so a search for them cannot match anything by coincidence. The printed log:

```text
→ EAED0BEA POST http://127.0.0.1:50108/users/:email/books?limit=20&session=REDACTED ["Authorization: <redacted>", "Content-Type: application/json", "Cookie: <redacted>", "X-New-Secret-Header: <redacted>", "X-Request-ID: EAED0BEA"] body={"id":"b-7","password":"<redacted>"}
← EAED0BEA 200 60B 0.007372291 seconds ["Content-Length: 60", "Content-Type: application/json", "Set-Cookie: <redacted>", "X-Debug-Token: <redacted>"] body={"access_token":"<redacted>","id":"b-7","next":null}
```

Both lines are enough to diagnose most problems: which endpoint, which status, how long it took, how big the response was, what shape it had, and the ID to look up on the server. None of the nine planted values appear in them.

Run the canary test in CI against the real transport configuration of the app, not a test-only one, and extend it whenever a new kind of request is added: a multipart upload, a WebSocket handshake, a background download. Each one is a new place for a secret to hide.

## Other places logs come from

The transport covers the app's own logging. Several other sources print network data, and each needs its own decision:

- **`print` and `debugPrint`** write to standard output, which on iOS is captured only under a debugger, but which `URLRequest`'s and `HTTPURLResponse`'s descriptions populate with full URLs and headers. Ban them in networking code with a lint rule.
- **`CFNETWORK_DIAGNOSTICS`** is an environment variable that makes the URL Loading System log its internals, including headers, at levels 1 to 3. It is invaluable for debugging and must never be set in a build that reaches users.
- **Third-party SDKs** that wrap `URLSession` or install their own `URLProtocol` may log requests themselves. Review their logging options; many have a "log request bodies" flag that defaults to on in debug builds.
- **Crash reporters and analytics** often record "breadcrumbs" of recent network activity automatically. Configure them to use the same redactor, or to record only the method, the path template, and the status.
- **cURL exports** in debugging tools are the most complete leak of all: a working command line with every credential included. If your app generates them for bug reports, build them from the redactor's output so the command fails until someone adds credentials by hand.

## Summary

- Sensitive data appears in URLs (userinfo, path, query), headers, and bodies in both directions. Redact by location, with allowlists, so new fields fail closed.
- Measured: `os.Logger` redacted runtime values by default, but logged strings from the binary, including a `URL` created from a literal, in the clear. Mark every interpolation explicitly, and redact before logging.
- `.private(mask: .hash)` gives stable hashes for correlation; low-entropy values such as phone numbers can be recovered by brute force in seconds, so treat them as personal data.
- Keep route words and short IDs in paths, replace emails, long numbers, UUIDs, and tokens. Keep query names, drop values. Keep JSON structure, drop values under keys not allowlisted. Summarize non-JSON bodies.
- Log one line per exchange from a transport decorator, with an `X-Request-ID` shared with the server.
- Prove the redactor with canary tests that plant unique values in every location and search the log for them, including headers nobody listed.

## Exercise

Add a test that fails if the summary line for a JSON body exceeds 2 KB, truncating large arrays to their first three elements plus a count. Then add a canary test for redirects: have the server redirect to a URL with a canary in its query, and make sure the redirect's `Location` header and the final URL are both redacted in the log.

## Further reading

- Apple's [Generating Log Messages from Your Code](https://developer.apple.com/documentation/os/generating-log-messages-from-your-code) and [`OSLogPrivacy`](https://developer.apple.com/documentation/os/oslogprivacy).
- [Explore logging in Swift](https://developer.apple.com/videos/play/wwdc2020/10168/), WWDC20, which introduced `Logger` and its privacy options.
- The [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), on what to exclude from logs.

Previous: [Handling Logout During an In-Flight Request](/swift-logout-in-flight-requests/). Next: [Timeouts, Cancellation, and Request Lifetimes](/swift-network-timeouts-cancellation/).

Return to the [Networking roadmap](/swift-networking/).
