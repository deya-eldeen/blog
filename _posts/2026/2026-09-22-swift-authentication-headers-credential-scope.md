---
layout: post
hidden: true
title: "Authentication Headers and Credential Scope"
date: "2026-09-22"
last_modified_at: "2026-09-22"
permalink: /swift-authentication-headers-credential-scope/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Security, Authentication]
thumbnail: assets/img/article-placeholder.svg
---
A credential is only as safe as the set of requests it is attached to. An access token that the app sends to its own API over HTTPS is protected by TLS and the API's checks. The same token attached to a request that follows a redirect to a CDN, an analytics host, or an attacker's server is simply handed over. Most credential leaks in mobile apps are not cryptographic failures. They are scope failures: the right secret in the wrong request.

This article covers how credentials travel in HTTP, the `Authorization` header and its common schemes, API keys, and URLs, and then measures what `URLSession` does with each of them when a redirect sends a request somewhere else. The results are not uniform, and one of them leaks a credential to another origin by default. It ends with a transport that attaches credentials only to the origins that should receive them, and a redirect policy that enforces the same rule.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. They send requests to `LocalServer`, the loopback HTTP server from the [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`. Plain HTTP on the loopback interface stands in for HTTPS here so that the server can be read; real credentials must only ever travel over HTTPS.

<!-- check-uses: local-server -->

## How credentials travel

HTTP's authentication framework, defined in [RFC 9110 §11](https://www.rfc-editor.org/rfc/rfc9110#section-11), has a server send a `401 Unauthorized` with a `WWW-Authenticate` header naming one or more **schemes**, and a client answer with an `Authorization` header in one of them:

```text
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="library", error="invalid_token"

GET /me/loans HTTP/1.1
Authorization: Bearer eyJhbGciOiJFUzI1NiJ9...
```

Three schemes cover almost all app traffic:

| Scheme | Header value | Defined in | Notes |
|---|---|---|---|
| Basic | `Basic base64(user:password)` | [RFC 7617](https://www.rfc-editor.org/rfc/rfc7617) | The password itself, encoded, not encrypted, on every request |
| Bearer | `Bearer <token>` | [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) | Whoever holds the token is authorized; OAuth 2.0 access tokens |
| API key | a custom header such as `X-API-Key: <key>` | none | Identifies the app or project, often not the user |

Bearer tokens are the norm for app APIs because they can be short-lived, scoped to specific permissions, and revoked without changing a password. The name states the risk exactly: the *bearer* of the token is authorized. There is no proof that the sender is the client the token was issued to, unless the server adds [sender-constrained tokens](https://www.rfc-editor.org/rfc/rfc9449) such as DPoP. Anything that reads the header can use the token.

Two other places credentials end up should be avoided:

- **In the URL**, as `?access_token=...`. URLs are logged by servers, proxies, CDNs, and crash reporters, and they are shown in debugging tools. RFC 6750 permits the query form only as a last resort, and [URLs, Query Parameters, and Percent Encoding](/swift-urls-query-percent-encoding/) covered why URL userinfo is no better.
- **In cookies**, for an API that is not a website. Cookies are attached automatically to every request to the domain by the session's cookie storage, which is the opposite of a narrow scope. Web views and APIs that share a domain are where this matters.

## Basic authentication and the challenge flow

For Basic authentication, `URLSession` implements the challenge flow itself. When a response is a `401` with `WWW-Authenticate: Basic`, the session asks its delegate for a credential, then repeats the request with the `Authorization` header:

```swift
import Foundation
import Synchronization

let api = try await LocalServer.start { request in
    switch request.path {
    case "/basic":
        guard let header = request.header("Authorization") else {
            return HTTPResponse(status: 401, headers: [("WWW-Authenticate", #"Basic realm="library""#)])
        }
        return .text(header)
    case "/bearer-only":
        return HTTPResponse(status: 401, headers: [("WWW-Authenticate", #"Bearer realm="library", error="invalid_token""#)])
    default:
        return .text("auth=\(request.header("Authorization") ?? "none") key=\(request.header("X-API-Key") ?? "none")")
    }
}

final class BasicCredentials: NSObject, URLSessionTaskDelegate, Sendable {
    let challenges = Mutex<[String]>([])

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        let space = challenge.protectionSpace
        challenges.withLock { $0.append("\(space.authenticationMethod) realm=\(space.realm ?? "") secure=\(space.receivesCredentialSecurely)") }
        guard space.authenticationMethod == NSURLAuthenticationMethodHTTPBasic, challenge.previousFailureCount == 0 else {
            return (.performDefaultHandling, nil)
        }
        return (.useCredential, URLCredential(user: "reader", password: "pä:ss", persistence: .forSession))
    }
}

let basicDelegate = BasicCredentials()
let before = api.requests.count
let (basicData, _) = try await URLSession.shared.data(from: api.baseURL.appending(path: "basic"), delegate: basicDelegate)
let sentHeader = String(decoding: basicData, as: UTF8.self)

assert(api.requests.count - before == 2)  // the 401, then the authenticated retry
assert(sentHeader == "Basic cmVhZGVyOnDDpDpzcw==")
assert(String(decoding: Data(base64Encoded: "cmVhZGVyOnDDpDpzcw==")!, as: UTF8.self) == "reader:pä:ss")
assert(basicDelegate.challenges.withLock { $0 } == ["NSURLAuthenticationMethodHTTPBasic realm=library secure=false"])
```

Three details from that run:

- The header is the password in base64, nothing more. Base64 is an encoding, so anyone who sees the header has the password. Basic authentication is acceptable only over TLS, which is what `receivesCredentialSecurely` reports. It is `false` here because the server uses plain HTTP; a delegate should refuse to answer a Basic challenge when it is `false`.
- The password contains a colon and a non-ASCII character, and both survive: RFC 7617 splits at the *first* colon, so only the user name must not contain one, and modern servers decode the bytes as UTF-8.
- Checking `previousFailureCount` stops an infinite loop with a server that keeps rejecting the credential.

`URLSession` does not run this flow for Bearer tokens. A `401` with `WWW-Authenticate: Bearer` is returned to the caller without a delegate callback, because only the app knows how to obtain a new token:

```swift
let (_, bearerResponse) = try await URLSession.shared.data(from: api.baseURL.appending(path: "bearer-only"), delegate: basicDelegate)
assert((bearerResponse as! HTTPURLResponse).statusCode == 401)
assert(basicDelegate.challenges.withLock { $0.count } == 1)  // no new challenge for Bearer
```

That is the job of [Refreshing Credentials Without Duplicate Requests](/swift-token-refresh/). The rest of this article is about where the header goes once the app has a token.

## What a redirect does with each credential

A redirect asks the client to send a new request to a new URL. If that URL is on another **origin**, the new request should not carry credentials meant for the first one. An origin, as defined in [RFC 6454](https://www.rfc-editor.org/rfc/rfc6454), is the triple of scheme, host, and port: `https://api.library.example` and `https://cdn.library.example` are different origins, and so are `http://` and `https://` versions of the same host, or the same host on two ports.

The experiment uses two servers, so the two ports are two origins. The main server redirects to the other one, and also to a path on itself, and the other server reports the credentials it received:

```swift
let other = try await LocalServer.start { request in
    .text("auth=\(request.header("Authorization") ?? "none") key=\(request.header("X-API-Key") ?? "none")")
}

let redirecting = try await LocalServer.start { request in
    switch request.path {
    case "/to-self": HTTPResponse(status: 302, headers: [("Location", "/echo")])
    case "/to-other": HTTPResponse(status: 302, headers: [("Location", other.baseURL.appending(path: "steal").absoluteString)])
    case "/to-other-307": HTTPResponse(status: 307, headers: [("Location", other.baseURL.appending(path: "steal").absoluteString)])
    default: .text("auth=\(request.header("Authorization") ?? "none") key=\(request.header("X-API-Key") ?? "none")")
    }
}

func received(_ path: String, session: URLSession = .shared, headers: [String: String]) async throws -> String {
    var request = URLRequest(url: redirecting.baseURL.appending(path: path))
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    let (data, _) = try await session.data(for: request)
    return String(decoding: data, as: UTF8.self)
}

let credentials = ["Authorization": "Bearer secret-token", "X-API-Key": "key-123"]
let toSelf = try await received("to-self", headers: credentials)
let toOther = try await received("to-other", headers: credentials)
let toOther307 = try await received("to-other-307", headers: credentials)

let sessionConfiguration = URLSessionConfiguration.ephemeral
sessionConfiguration.httpAdditionalHeaders = ["Authorization": "Bearer session-token"]
let headerSession = URLSession(configuration: sessionConfiguration)
let sessionToOther = try await received("to-other", session: headerSession, headers: [:])

assert(toSelf == "auth=none key=key-123")
assert(toOther == "auth=none key=key-123")
assert(toOther307 == "auth=none key=key-123")
assert(sessionToOther == "auth=Bearer session-token key=none")
```

| Where the credential was set | Redirect to the same origin | Redirect to another origin |
|---|---|---|
| `Authorization` on the `URLRequest` | **Dropped** | Dropped |
| Custom header (`X-API-Key`) on the `URLRequest` | Kept | **Kept: leaked** |
| `Authorization` in `httpAdditionalHeaders` | Kept | **Kept: leaked** |

The behavior is consistent in its own terms. `URLSession` removes `Authorization` from a redirected request because it is a reserved header, and it cannot know which custom headers are secrets, so it copies them all. Session-level headers are applied to every request the session sends, including redirected ones.

The consequences are not consistent with what an app wants:

- An API key in a custom header **follows a redirect to any host**. A compromised or misconfigured server that redirects to an attacker-controlled host collects the key. So does an open redirect anywhere on the API's domain, a common web vulnerability.
- A token in `httpAdditionalHeaders` **follows a redirect to any host**, for the same reason. This is one more reason, beyond those in [Choosing a `URLSession` Configuration](/swift-urlsession-configuration/), not to put credentials there.
- A token set on the request is **lost even on a same-origin redirect**, so an API that redirects `/me` to `/users/42` answers the redirected request with `401`. Apps work around that, often by moving the token into a custom header or session headers, which converts a functional bug into a security bug.

## Attaching credentials by origin

The fix has two parts that enforce one rule: a credential is attached only to requests whose origin is on its list, and that check runs again for every redirect.

First, a value type for an origin, normalized so that `https://API.example` and `https://api.example:443` compare equal:

```swift
struct Origin: Hashable, Sendable, CustomStringConvertible {
    let scheme: String
    let host: String
    let port: Int

    init?(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), let host = url.host(percentEncoded: false)?.lowercased(),
              !host.isEmpty else { return nil }
        let defaultPort = ["https": 443, "http": 80, "wss": 443, "ws": 80][scheme]
        guard let port = url.port ?? defaultPort else { return nil }
        (self.scheme, self.host, self.port) = (scheme, host, port)
    }

    var description: String { "\(scheme)://\(host):\(port)" }
}

assert(Origin(URL(string: "https://API.Library.example/v1")!) == Origin(URL(string: "https://api.library.example:443/v2")!))
assert(Origin(URL(string: "https://api.library.example")!) != Origin(URL(string: "http://api.library.example")!))
assert(Origin(URL(string: "https://api.library.example")!) != Origin(URL(string: "https://cdn.library.example")!))
```

Second, a credential type that knows its own scope. The token is fetched through a closure, so the transport always uses the current one:

```swift
struct ScopedCredential: Sendable {
    let headerName: String
    let origins: Set<Origin>
    let requireHTTPS: Bool
    let value: @Sendable () async throws -> String?

    func applies(to url: URL?) -> Bool {
        guard let url, let origin = Origin(url), origins.contains(origin) else { return false }
        return !requireHTTPS || origin.scheme == "https"
    }

    static let sensitiveHeaders: Set<String> = ["authorization", "x-api-key", "cookie", "proxy-authorization"]
}
```

The transport attaches the credential when the scope matches. It also handles redirects through a per-task delegate, which re-evaluates every redirected request: credentials are stripped when the new origin is out of scope, and restored when it is in scope, which fixes the same-origin case as well:

```swift
final class ScopedRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    let credentials: [ScopedCredential]
    let decisions = Mutex<[String]>([])

    init(credentials: [ScopedCredential]) { self.credentials = credentials }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest) async -> URLRequest? {
        var request = request
        for name in (request.allHTTPHeaderFields ?? [:]).keys
        where ScopedCredential.sensitiveHeaders.contains(name.lowercased()) {
            request.setValue(nil, forHTTPHeaderField: name)
        }
        for credential in credentials where credential.applies(to: request.url) {
            if let value = try? await credential.value() {
                request.setValue(value, forHTTPHeaderField: credential.headerName)
            }
        }
        let attached = credentials.filter { request.value(forHTTPHeaderField: $0.headerName) != nil }.map(\.headerName)
        decisions.withLock { $0.append("\(request.url.flatMap(Origin.init)?.description ?? "?") gets \(attached)") }
        return request
    }
}

struct ScopedAuthTransport: Sendable {
    let session: URLSession
    let credentials: [ScopedCredential]

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse, [String]) {
        var request = request
        for credential in credentials where credential.applies(to: request.url) {
            if let value = try await credential.value() {
                request.setValue(value, forHTTPHeaderField: credential.headerName)
            }
        }
        let redirects = ScopedRedirects(credentials: credentials)
        let (data, response) = try await session.data(for: request, delegate: redirects)
        return (data, response as! HTTPURLResponse, redirects.decisions.withLock { $0 })
    }
}
```

The redirect handler strips by a fixed list of sensitive header names, not just the ones this transport added. A caller that set a secret header directly, bypassing the transport, is still protected. Running the same three redirects through the transport:

```swift
let apiOrigin = Origin(redirecting.baseURL)!
let scoped = ScopedAuthTransport(session: URLSession(configuration: .ephemeral), credentials: [
    ScopedCredential(headerName: "Authorization", origins: [apiOrigin], requireHTTPS: false,
                     value: { "Bearer secret-token" }),
    ScopedCredential(headerName: "X-API-Key", origins: [apiOrigin], requireHTTPS: false,
                     value: { "key-123" }),
])

func scopedResult(_ path: String) async throws -> (String, [String]) {
    let (data, _, decisions) = try await scoped.send(URLRequest(url: redirecting.baseURL.appending(path: path)))
    return (String(decoding: data, as: UTF8.self), decisions)
}

let (scopedSelf, selfDecisions) = try await scopedResult("to-self")
let (scopedOther, otherDecisions) = try await scopedResult("to-other")
let (scopedOther307, _) = try await scopedResult("to-other-307")

assert(scopedSelf == "auth=Bearer secret-token key=key-123")  // restored on the same origin
assert(scopedOther == "auth=none key=none")                   // nothing leaves the origin
assert(scopedOther307 == "auth=none key=none")
assert(selfDecisions == ["\(apiOrigin) gets [\"Authorization\", \"X-API-Key\"]"])
assert(otherDecisions == ["\(Origin(other.baseURL)!) gets []"])
```

The `requireHTTPS: false` exists only because the example's server is plain HTTP. In an app it is always `true`, and the origin list contains only `https` origins, so a redirect from `https` to `http`, a **downgrade**, also loses its credentials. App Transport Security blocks most plain HTTP anyway, as [App Transport Security and TLS Trust](/swift-ats-tls-trust/) explains, but the scope check should not depend on it.

## Scope is more than origin

Origin scoping limits *where* a credential is sent. The credential's own scope limits *what it can do* once it gets there, and an app controls more of that than it might seem:

- **Request narrow OAuth scopes.** A token that can read loans should not be able to change the account's email address. If the token leaks, the scope limits the damage.
- **Keep access tokens short-lived.** Minutes, not days. The refresh token, which can mint new access tokens, is the high-value secret, and it is sent to exactly one endpoint, the token endpoint, which deserves its own `ScopedCredential` with a one-element origin set.
- **Separate app identity from user identity.** An API key identifies the app build and can be extracted from the binary by anyone who downloads it. It must never grant access to user data on its own, and server-side abuse controls should assume it is public.
- **Bind tokens to the user session that obtained them.** When the user signs out, every token and every request in flight on their behalf should become useless. [Handling Logout During an In-Flight Request](/swift-logout-in-flight-requests/) shows why that is harder than deleting the token.

## Storing the secret

Tokens belong in the Keychain, not in `UserDefaults` or a file. The accessibility class decides when the item can be read: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` allows background refreshes after the device has been unlocked once since boot, and the `ThisDeviceOnly` suffix keeps the item out of backups and device migrations, so a restored backup does not carry a live session to another device. The functions below compile with the example but are not called by it, because running them would write to the login keychain of the machine running the example:

```swift
enum TokenStore {
    static let service = "com.example.library.auth"

    static func save(_ token: String, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = Data(token.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    static func load(account: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }
}
```

The Keychain protects the token at rest. It does nothing for the token in transit or in memory, which is why scope and lifetime matter as much as storage.

## Summary

- Credentials travel in `Authorization` (Basic, Bearer), in custom headers (API keys), and unfortunately in URLs and cookies. Keep them out of URLs.
- `URLSession` runs the challenge flow for Basic but not for Bearer. Basic sends the password in base64 and is acceptable only over TLS; check `receivesCredentialSecurely`.
- Measured redirect behavior: `Authorization` set on a request is dropped on every redirect, even to the same origin. Custom headers and `httpAdditionalHeaders` are kept on every redirect, including to other origins, which leaks them.
- An origin is scheme, host, and port. Attach each credential only to its origins, over HTTPS, and re-check on every redirect with a delegate that strips sensitive headers by name.
- Limit what a leaked credential can do: narrow scopes, short lifetimes, a separately scoped refresh token, and API keys that grant nothing on their own.
- Store tokens in the Keychain with a `ThisDeviceOnly` accessibility class.

## Exercise

Add a `cdn` server to the redirect experiment that should receive a *different* credential, a signed-URL token in a header, and extend `ScopedAuthTransport` so that a redirect from the API to the CDN swaps the API token for the CDN token instead of dropping both. Then add a test for a redirect chain that goes API → CDN → attacker and assert that the attacker receives neither credential. Finally, write a test that fails if anyone adds `Authorization` or `X-API-Key` to a session's `httpAdditionalHeaders`.

## Further reading

- [RFC 6750: The OAuth 2.0 Authorization Framework: Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750) and [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700).
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252), on how apps should obtain tokens.
- [RFC 6454: The Web Origin Concept](https://www.rfc-editor.org/rfc/rfc6454).
- Apple's [Handling an authentication challenge](https://developer.apple.com/documentation/foundation/handling-an-authentication-challenge) and [Storing keys in the keychain](https://developer.apple.com/documentation/security/storing-keys-in-the-keychain).

Previous: [Designing an API Client Around Consumer Needs](/swift-api-client-design/). Next: [Refreshing Credentials Without Duplicate Requests](/swift-token-refresh/).

Return to the [Networking roadmap](/swift-networking/).
