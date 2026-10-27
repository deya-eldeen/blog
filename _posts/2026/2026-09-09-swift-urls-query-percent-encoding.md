---
layout: post
hidden: true
title: "URLs, Query Parameters, and Percent Encoding in Swift"
date: "2026-09-09"
last_modified_at: "2026-09-09"
permalink: /swift-urls-query-percent-encoding/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, HTTP, URL]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A URL looks like a string, and that is the root of most URL bugs. Building one with string interpolation works for every test value a developer thinks of, and then a user searches for `c++`, names a list `50% off`, or types a book title containing `/`, and the server receives something different from what the app meant to send.

A URL is a small structured document with its own grammar. Each part of it, the path, the query, the host, has its own set of characters that are allowed literally and its own rules for encoding the rest. This article walks through that grammar as Foundation implements it today, shows the places where Foundation's choices differ from what most servers expect, and ends with a URL builder whose round trip through a real server is tested with random input.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Some sections send requests to `LocalServer`, the loopback HTTP server from the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`.

<!-- check-uses: local-server -->

## The grammar of a URL

[RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) defines the generic syntax that every `http` and `https` URL follows. A URL is split by a handful of delimiter characters into components, and each component is decoded separately:

```mermaid
flowchart LR
    accTitle: The components of a URL, split by their delimiters
    A["https"] -->|"://"| B["user:pass@"]
    B --> C["api.example.com"]
    C -->|":"| D["8443"]
    D --> E["/v1/books;edition=2"]
    E -->|"?"| F["q=dune&sort=year"]
    F -->|"#"| G["reviews"]
    A -.- A1[scheme]
    B -.- B1[userinfo]
    C -.- C1[host]
    D -.- D1[port]
    E -.- E1[path]
    F -.- F1[query]
    G -.- G1[fragment]
```

The **authority** (userinfo, host, and port) says which server to contact. The **path** identifies a resource on it, hierarchically, with `/` as the separator. The **query** is non-hierarchical data that further identifies the resource. The **fragment** is never sent to the server at all: it is interpreted by the client after retrieval.

Foundation exposes each component through `URL` accessors. Since macOS 13 and iOS 16, they come in two forms: percent-encoded as it appears in the URL, or decoded.

```swift
import Foundation

let full = URL(string: "https://user:p%40ss@api.example.com:8443/v1/books;edition=2?q=dune#reviews")!
assert(full.scheme == "https")
assert(full.user() == "user")
assert(full.password() == "p%40ss" && full.password(percentEncoded: false) == "p@ss")
assert(full.host() == "api.example.com" && full.port == 8443)
assert(full.path() == "/v1/books;edition=2")
assert(full.query() == "q=dune" && full.fragment() == "reviews")
```

Userinfo deserves a warning of its own. Credentials in a URL end up in logs, crash reports, analytics, and screenshots, because every tool treats a URL as safe to print. HTTP clients should send credentials in headers, as described in [Authentication Headers and Credential Scope](/swift-authentication-headers-credential-scope/), and URL loggers should strip userinfo, which [the redaction article](/swift-redacting-network-logs/) does.

## Percent encoding is about bytes

Only a small set of ASCII characters may appear in a URL literally. Everything else is first converted to bytes with UTF-8 and then written as `%` followed by two hexadecimal digits per byte. RFC 3986 splits the allowed characters into two groups:

| Group | Characters | Meaning |
|---|---|---|
| Unreserved | `A–Z a–z 0–9 - . _ ~` | Never need encoding, and encoding them changes nothing |
| Reserved: gen-delims | `: / ? # [ ] @` | Separate the components |
| Reserved: sub-delims | `! $ & ' ( ) * + , ; =` | May have meaning *inside* a component |

The reserved characters are why encoding is per component. A `/` in a path separates segments, so a `/` that belongs to a segment's *data* must be written `%2F`. In a query, `/` has no special meaning and can appear literally. A `?` starts the query when it appears in a path, but inside the query it is ordinary data.

Encoding works on UTF-8 bytes, so its cost is easy to bound. A Unicode scalar takes 1 to 4 bytes in UTF-8, and each byte becomes at most 3 characters, so for a string of $$n$$ scalars:

$$
\text{encoded length} \;\le\; 3 \cdot \text{UTF-8 bytes} \;\le\; 12n
$$

An emoji such as `😀` (4 bytes) becomes the 12 characters `%F0%9F%98%80`. This matters when a query carries user text: a 2,000-character search in a non-Latin script can exceed the roughly 8 KB that many servers and CDNs accept for a request line, at which point they answer `414 URI Too Long`. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#section-4.1) only recommends that servers support at least 8,000 octets.

## `URL(string:)` accepts almost anything

Since iOS 17 and macOS 14, `URL(string:)` parses according to RFC 3986 and **percent-encodes invalid characters for you**. Before that, a space made it return `nil`. The older behavior is available through `encodingInvalidCharacters: false`:

```swift
assert(URL(string: "https://example.com/a b?q=c d")?.absoluteString
       == "https://example.com/a%20b?q=c%20d")
assert(URL(string: "https://example.com/a b", encodingInvalidCharacters: false) == nil)
assert(URL(string: "https://example.com/caf\u{E9}")?.absoluteString == "https://example.com/caf%C3%A9")

// A malformed escape is treated as a literal % and encoded:
assert(URL(string: "https://example.com/%zz")?.absoluteString == "https://example.com/%25zz")

// Every one of these is a valid *relative* reference:
assert(URL(string: "not a url")?.absoluteString == "not%20a%20url")
assert(URL(string: "") == nil)
```

The lenient parser is convenient for user-facing text fields and dangerous for validation. A non-`nil` result no longer means "this is a usable web address." Code that accepts URLs from users, deep links, or server payloads should check what it actually needs:

```swift
func webURL(_ text: String) -> URL? {
    guard let url = URL(string: text, encodingInvalidCharacters: false),
          let scheme = url.scheme?.lowercased(), scheme == "https",
          let host = url.host(), !host.isEmpty
    else { return nil }
    return url
}

assert(webURL("https://example.com/books") != nil)
assert(webURL("not a url") == nil)
assert(webURL("http://example.com") == nil)          // plain HTTP refused
assert(webURL("javascript:alert(1)") == nil)          // no host
assert(webURL("https:///books") == nil)               // empty host
```

## Paths: segments, slashes, and dot segments

`URL` has two methods for adding to a path, and the difference is exactly the reserved-character rule. `appending(path:)` treats `/` as a separator. `appending(component:)` treats its argument as the data of *one* segment, so it encodes `/`, `?`, and `#`:

```swift
let v1 = URL(string: "https://api.example.com/v1")!
assert(v1.appending(path: "books/42").absoluteString == "https://api.example.com/v1/books/42")
assert(v1.appending(component: "books/42").absoluteString == "https://api.example.com/v1/books%2F42")
assert(v1.appending(component: "a?b#c").absoluteString == "https://api.example.com/v1/a%3Fb%23c")
assert(v1.appending(path: "/books").absoluteString == "https://api.example.com/v1/books")  // no double slash
```

Use `appending(path:)` for path templates you wrote, and `appending(component:)` for every value that came from somewhere else: an identifier from a server payload, a user's list name, a file name. A book titled "Either/Or" is one segment, not two.

`appending(component:)` does *not* protect against dot segments. The segments `.` and `..` are not data; RFC 3986 defines them as "this directory" and "the parent directory," and its `remove_dot_segments` algorithm removes them when a URL is normalized. `URLSession` sends them unchanged, and servers, proxies, and frameworks normalize them on arrival:

```swift
let paths = try await LocalServer.start { request in .text(request.target) }

func target(of url: URL) async throws -> String {
    let (data, _) = try await URLSession.shared.data(from: url)
    return String(decoding: data, as: UTF8.self)
}

let userSupplied = ".."
let traversal = paths.baseURL.appending(path: "users/").appending(component: userSupplied).appending(path: "admin")
let sent = try await target(of: traversal)
assert(sent == "/users/../admin")               // sent exactly as built
assert(traversal.standardized.path() == "/admin")  // what a normalizing server routes
```

A value of `..` for a user name turns `/users/{name}/admin` into `/admin`. Whether that is exploitable depends on the server, but the client's job is clear: reject `.` and `..` as identifiers before they reach a path. The builder at the end of this article does.

Two more path behaviors are worth knowing. A `%2F` inside a segment survives in the encoded path but disappears in the decoded one, and different servers decode it at different times, so some reject it outright:

```swift
let encodedSlash = URL(string: "https://example.com/a%2Fb/c")!
assert(encodedSlash.path() == "/a%2Fb/c")
assert(encodedSlash.path(percentEncoded: false) == "/a/b/c")
assert(encodedSlash.pathComponents == ["/", "a/b", "c"])
```

And relative references resolve against a base URL by RFC 3986's merge rule, which **replaces the last segment of the base unless the base ends in `/`**. This is the single most common reason a request goes to `/v2/books` instead of `/v1/v2/books`, or the other way around:

```swift
assert(URL(string: "books", relativeTo: URL(string: "https://api.example.com/v1")!)!.absoluteString
       == "https://api.example.com/books")
assert(URL(string: "books", relativeTo: URL(string: "https://api.example.com/v1/")!)!.absoluteString
       == "https://api.example.com/v1/books")
assert(URL(string: "/books", relativeTo: URL(string: "https://api.example.com/v1/")!)!.absoluteString
       == "https://api.example.com/books")
```

The `appending` methods do not use this rule; they always add to the end. Prefer them over `URL(string:relativeTo:)` when building API URLs.

## Queries: the part no standard fully defines

RFC 3986 says only that the query is a string. The convention of `name=value` pairs joined by `&` comes from HTML forms, and the most precise specification of how to decode it is the WHATWG URL Standard's [`application/x-www-form-urlencoded` parser](https://url.spec.whatwg.org/#urlencoded-parsing). That parser does one thing that RFC 3986 does not: **it decodes `+` as a space.** Almost every server framework uses that parser for query strings.

`URLComponents` follows RFC 3986. Its `queryItems` encoder escapes the characters that would break the pair structure, `&` and `=`, along with everything that is not allowed in a query, but it leaves `+` alone, because `+` is a legal sub-delimiter:

```swift
var search = URLComponents(string: "https://api.example.com/search")!
search.queryItems = [
    URLQueryItem(name: "q", value: "c++ & rust = fun?"),
    URLQueryItem(name: "path", value: "a/b;c:d@e"),
]
assert(search.percentEncodedQuery == "q=c++%20%26%20rust%20%3D%20fun?&path=a/b;c:d@e")
```

Send that to a server that decodes queries the way HTML forms do, and `c++` arrives as `c` followed by two spaces. The fixture below decodes queries with the WHATWG rules so the difference is visible:

```swift
/// Decodes a query the way browsers and most server frameworks do.
func formDecode(_ query: String) -> [(String, String)] {
    query.split(separator: "&", omittingEmptySubsequences: true).map { pair in
        let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        func decode(_ part: Substring) -> String {
            part.replacing("+", with: " ").removingPercentEncoding ?? String(part)
        }
        return (decode(parts[0]), parts.count > 1 ? decode(parts[1]) : "")
    }
}

let forms = try await LocalServer.start { request in
    let query = request.target.split(separator: "?", maxSplits: 1).dropFirst().first.map(String.init) ?? ""
    return .text(formDecode(query).map { "\($0.0)=\($0.1)" }.joined(separator: "\n"))
}

func serverSees(_ items: [URLQueryItem]) async throws -> String {
    var components = URLComponents(url: forms.baseURL, resolvingAgainstBaseURL: false)!
    components.queryItems = items
    return try await target(of: components.url!)
}

let naive = try await serverSees([URLQueryItem(name: "q", value: "c++")])
assert(naive == "q=c  ")  // the pluses became spaces
```

The fix is to encode the query yourself, with a stricter allowed set, and hand the result to `percentEncodedQueryItems`. The safest choice is to leave only RFC 3986's unreserved characters literal. That is what JavaScript's `encodeURIComponent` does, plus a few more, and it is never ambiguous for any decoder:

```swift
extension CharacterSet {
    /// RFC 3986 unreserved characters: the only ones that never need encoding.
    static let urlUnreserved = CharacterSet(charactersIn:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
}

func strictlyEncoded(_ items: [URLQueryItem]) -> [URLQueryItem] {
    items.map { item in
        URLQueryItem(name: item.name.addingPercentEncoding(withAllowedCharacters: .urlUnreserved)!,
                     value: item.value?.addingPercentEncoding(withAllowedCharacters: .urlUnreserved))
    }
}

var strict = URLComponents(url: forms.baseURL, resolvingAgainstBaseURL: false)!
strict.percentEncodedQueryItems = strictlyEncoded([URLQueryItem(name: "q", value: "c++ & rust = fun?")])
assert(strict.percentEncodedQuery == "q=c%2B%2B%20%26%20rust%20%3D%20fun%3F")
let decodedStrict = try await target(of: strict.url!)
assert(decodedStrict == "q=c++ & rust = fun?")
```

`percentEncodedQueryItems` is a precondition, not a conversion. If you assign a value that contains characters not allowed in a query, such as a raw space, Foundation raises an exception and the app crashes. Only ever assign it values that came out of `addingPercentEncoding`.

### Structure inside the query is a contract

Because the query has no standard structure, each API defines its own. These are the decisions to make once and write down:

| Question | Common choices | What `URLQueryItem` produces |
|---|---|---|
| Repeated values | `tag=a&tag=b`, `tag[]=a&tag[]=b`, `tag=a,b` | Repeated items: `tag=a&tag=b` |
| Flag without value | `?archived`, `?archived=true`, `?archived=1` | `value: nil` gives `archived`; `""` gives `archived=` |
| Absent value | Omit the item, or send it empty | Your code decides |
| Ordering | Usually insignificant to the server | Preserved as given |

The difference between `nil` and an empty string is real on the wire. Some servers read `?archived` as true and `?archived=` as an empty string that fails to parse as a Boolean:

```swift
var flags = URLComponents(string: "https://api.example.com/books")!
flags.queryItems = [URLQueryItem(name: "archived", value: nil), URLQueryItem(name: "author", value: "")]
assert(flags.percentEncodedQuery == "archived&author=")
```

Ordering does not matter to most servers, but it matters to every cache keyed on the URL, including your own. `URL` equality compares the strings, so URLs that a server treats as identical are different keys:

```swift
assert(URL(string: "https://x.com/a?b=1&c=2")! != URL(string: "https://x.com/a?c=2&b=1")!)
assert(URL(string: "https://x.com/a")! != URL(string: "https://x.com/a/")!)
assert(URL(string: "https://x.com/~a")! != URL(string: "https://x.com/%7Ea")!)
assert(URL(string: "https://X.com/a")! != URL(string: "https://x.com/a")!)
```

Sorting query items by name before building a URL costs nothing and makes identical requests produce identical URLs. That makes `URLCache` and the request coalescing in [Coalescing Duplicate Requests](/swift-request-coalescing/) work as intended.

## Hosts: case, international names, and lookalikes

Host names are case-insensitive, but `URL` equality is not, as the last assertion showed. Compare hosts with `lowercased()`, or better, compare against an allowlist after normalizing.

Domain names that contain non-ASCII characters are converted to ASCII by IDNA, which produces the `xn--` [Punycode](https://www.rfc-editor.org/rfc/rfc3492) form that DNS actually resolves. Foundation performs that conversion when it parses the URL, but the two `host` accessors do not return what their names suggest:

```swift
let international = URL(string: "https://bücher.example/")!
assert(international.absoluteString == "https://xn--bcher-kva.example/")
assert(international.host() == "b%C3%BCcher.example")                    // percent-encoded UTF-8
assert(international.host(percentEncoded: false) == "xn--bcher-kva.example")  // the DNS form
```

For security decisions, such as "should this URL receive a credential" or "may this deep link open inside the app," compare the DNS form against an allowlist of DNS forms. That rules out lookalike hosts: the string `example.com∕evil.com`, written with the Unicode division slash `U+2215` instead of `/`, is a single host name, not a path, and it is not `example.com`:

```swift
let lookalike = URL(string: "https://example.com\u{2215}evil.com/")!
assert(lookalike.host() != "example.com")
assert(lookalike.host() == "example.com%E2%88%95evil.com")
```

## A builder you can test

The rules above fit into a small type. It takes a base URL whose path ends at a directory, a list of path segments with templates and values kept apart, and query items. It encodes values strictly, rejects dot segments, and sorts the query:

```swift
enum URLBuildError: Error, Equatable {
    case invalidSegment(String)
}

enum PathSegment {
    case literal(String)  // written by you: may contain "/"
    case value(String)    // from data: encoded as exactly one segment
}

func buildURL(base: URL, path: [PathSegment], query: [URLQueryItem] = []) throws(URLBuildError) -> URL {
    var url = base
    for segment in path {
        switch segment {
        case .literal(let template):
            url.append(path: template)
        case .value(let value):
            guard !value.isEmpty, value != ".", value != ".." else { throw .invalidSegment(value) }
            url.append(component: value, directoryHint: .notDirectory)
        }
    }
    guard !query.isEmpty else { return url }
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
    components.percentEncodedQueryItems = strictlyEncoded(query.sorted { $0.name < $1.name })
    return components.url!
}

let api = URL(string: "https://api.example.com/v1")!
let listURL = try buildURL(base: api, path: [.literal("users"), .value("Either/Or & more"), .literal("books")],
                           query: [URLQueryItem(name: "sort", value: "-year"), URLQueryItem(name: "q", value: "c++")])
assert(listURL.absoluteString
       == "https://api.example.com/v1/users/Either%2FOr%20&%20more/books?q=c%2B%2B&sort=-year")

do {
    _ = try buildURL(base: api, path: [.literal("users"), .value(".."), .literal("admin")])
    assertionFailure("dot segments must be rejected")
} catch {
    assert(error == .invalidSegment(".."))
}
```

The `value` case relies on `append(component:)`, which encodes `/`, `?`, `#`, and `%` along with everything not allowed in a path. It is tempting to encode the value yourself and pass the result to `append(path:)`, but that method encodes `%` too, so an escaped `a%20b` becomes `a%2520b` on the wire. Pick one encoder and give it the raw value.

Unit tests with hand-picked strings only test the cases the author imagined. A better test is a **round trip through a real decoder**: generate random strings from an alphabet full of troublemakers, send them, and check that the server's decoded values are exactly what was sent. The server below decodes the path with `removingPercentEncoding` and the query with the form rules:

```swift
let roundTrip = try await LocalServer.start { request in
    let segment = request.path.split(separator: "/").last.map { $0.removingPercentEncoding ?? "?" } ?? ""
    let query = request.target.split(separator: "?", maxSplits: 1).dropFirst().first.map(String.init) ?? ""
    let decoded = formDecode(query).first { $0.0 == "q" }?.1 ?? ""
    return .text(segment + "\n" + decoded)
}

let alphabet = Array("ab +&=?/#%;:@,!$'()*[]~-._é漢😀\u{200B}")
for _ in 0..<200 {
    let text = String((0..<Int.random(in: 1...12)).map { _ in alphabet.randomElement()! })
    guard text != ".", text != ".." else { continue }
    let url = try buildURL(base: roundTrip.baseURL, path: [.literal("items"), .value(text)],
                           query: [URLQueryItem(name: "q", value: text)])
    let echoed = try await target(of: url)
    assert(echoed == text + "\n" + text, "round trip changed \(text.debugDescription): \(echoed.debugDescription)")
}
```

Two hundred random strings, each containing a mix of reserved characters, multibyte scalars, a zero-width space, and an emoji, survive the trip through `URLSession`, the wire, and a form decoder. Replacing `strictlyEncoded` with plain `queryItems` makes the test fail on the first string that contains a `+`; in five runs that happened between the first and the seventeenth iteration.

## Summary

- A URL is a grammar: scheme, authority, path, query, fragment. Each component allows different characters literally, so encoding is always per component.
- Percent encoding writes UTF-8 bytes as `%XX`; the encoded form is at most three times the byte length, up to 12 characters per scalar.
- `URL(string:)` now encodes invalid characters and accepts relative references. Validate scheme and host explicitly.
- Use `appending(component:)` or an encoded segment for data, and reject `.` and `..`, which `URLSession` sends and servers normalize.
- `URLComponents.queryItems` leaves `+` unencoded, and form decoders read it as a space. Encode values with the unreserved set and assign `percentEncodedQueryItems`.
- `URL` equality is string equality. Sort query items and normalize hosts before using URLs as keys.
- Compare hosts in their DNS form, `host(percentEncoded: false)`, against an allowlist.

## Exercise

Add support for repeated values to `buildURL`, using the `tag=a&tag=b` convention, and extend the round-trip test to send a random array of tags and verify that the server receives them in order. Then add a length check: compute the encoded length of the request target before building the URL, and switch to a `POST` with a form-encoded body when it would exceed 8,000 bytes. Use the $$12n$$ bound to decide which inputs your test must include to reach that limit.

## Further reading

- [RFC 3986: Uniform Resource Identifier (URI): Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986), especially §2 (characters), §3 (components), and §5 (reference resolution).
- The [WHATWG URL Standard](https://url.spec.whatwg.org/), which describes how browsers and most server frameworks actually parse URLs and form-encoded data.
- Apple's documentation for [`URLComponents`](https://developer.apple.com/documentation/foundation/urlcomponents) and [`URL`](https://developer.apple.com/documentation/foundation/url).

Previous: [HTTP Methods, Status Codes, and Headers](/swift-http-methods-status-codes-headers/). Next: [Choosing a `URLSession` Configuration](/swift-urlsession-configuration/).

Return to the [Networking roadmap](/swift-networking/).
