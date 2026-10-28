---
layout: post
hidden: true
title: "Networking with URLSession Publishers"
date: "2026-07-24"
last_modified_at: "2026-07-24"
permalink: /combine-urlsession-publishers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Networking, URLSession]
thumbnail: assets/img/article-placeholder.svg
---
`URLSession.dataTaskPublisher(for:)` turns an HTTP request into a publisher that emits one `(data, response)` pair and finishes, or fails with a `URLError`. It arrived with Combine in iOS 13, two years before `async`/`await`, and a large share of networking code written between 2019 and 2022 is built on it: a request publisher, a `tryMap` to check the status, a `decode`, a `receive(on:)`, and a `sink` or `assign` at the end.

Each of those steps has a rule that the compact chain hides. The publisher sends nothing until it is subscribed to, and sends a new request for every subscriber. A `404` is not a failure. `retry` resends the request only for failures, so its position relative to status validation decides whether a `503` is retried at all. Releasing the cancellable cancels the underlying task. And the values arrive on `URLSession`'s delegate queue, which in Swift 6 turns the most natural way of writing the chain, inside a `@MainActor` view model, into a crash on the first response. This article measures each rule against a local HTTP server and ends with a small typed client and a view model that uses it safely.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. They send requests to `LocalServer`, the loopback HTTP server from the networking roadmap's [appendix of the first article](/swift-http-methods-status-codes-headers/#appendix-the-local-server-used-in-this-series); paste that code first, then the blocks below in order, into one `main.swift`. The networking roadmap covers the HTTP side of everything here in depth, starting with [Requests and Responses with `async` and `await`](/swift-urlsession-async-await/).

<!-- check-uses: local-server -->

## Waiting for a publisher in a test

The examples need to wait for a request to finish. This helper subscribes, collects every value, and resumes when the publisher completes. It is `nonisolated` on purpose: its closures are called on `URLSession`'s delegate queue, and the section on threads below explains why closures written in main-actor code must not be.

```swift
import Combine
import Foundation
import Synchronization

/// Subscribes, waits for the publisher to complete, and returns its values or its failure.
nonisolated func outcome<P: Publisher>(of publisher: P) async -> Result<[P.Output], P.Failure>
where P.Output: Sendable {
    await withCheckedContinuation { continuation in
        let state = Mutex<(values: [P.Output], handle: AnyCancellable?, done: Bool)>(([], nil, false))
        let handle = publisher.sink(
            receiveCompletion: { @Sendable completion in
                let values = state.withLock { state in
                    state.done = true
                    state.handle = nil
                    return state.values
                }
                switch completion {
                case .finished: continuation.resume(returning: .success(values))
                case .failure(let error): continuation.resume(returning: .failure(error))
                }
            },
            receiveValue: { @Sendable value in state.withLock { $0.values.append(value) } }
        )
        state.withLock { if !$0.done { $0.handle = handle } }   // keep it alive until completion
    }
}
```

The server answers a handful of routes, including a slow one, a missing one, one that always reports that it is overloaded, and one that returns malformed JSON:

```swift
let server = try await LocalServer.start { request in
    switch request.path {
    case "/users/1":
        return .json(#"{"id": 1, "name": "Ada Lovelace"}"#)
    case "/users/2":
        return .json(#"{"error": "no such user"}"#, status: 404)
    case "/busy":
        return .json(#"{"error": "try later"}"#, status: 503)
    case "/broken":
        return .json(#"{"id": "one""#)
    case "/slow":
        var response = HTTPResponse.json(#"{"id": 3, "name": "Slow Sam"}"#)
        response.delay = .seconds(2)
        return response
    default:
        return .text("not found", status: 404)
    }
}

let session = URLSession(configuration: .ephemeral)
func requestCount(_ path: String) -> Int { server.requests.filter { $0.path == path }.count }
```

## Nothing happens until you subscribe

Creating a data task publisher does not create a task. The request is made when a subscriber attaches, and each subscriber gets its own request:

```swift
let userURL = server.baseURL.appending(path: "/users/1")
let userPublisher = session.dataTaskPublisher(for: userURL)
try await Task.sleep(for: .milliseconds(100))
assert(requestCount("/users/1") == 0)          // created, not started

_ = await outcome(of: userPublisher)
assert(requestCount("/users/1") == 1)

async let firstSubscriber = outcome(of: userPublisher)
async let secondSubscriber = outcome(of: userPublisher)
_ = await (firstSubscriber, secondSubscriber)
assert(requestCount("/users/1") == 3)          // two more subscribers, two more requests
```

That is the cold-publisher behavior from [Publishers, Subscribers, and Subscriptions](/combine-publishers-subscribers-subscriptions/), and it cuts both ways. It is why a publisher can be created in an initializer and stored without side effects, and why `retry` can work at all. It is also why a screen that binds two views to the same request publisher sends it twice. `share()` turns those two subscriptions into one request:

```swift
final class DeliveryCounter: Sendable {
    private let valuesSeen = Atomic<Int>(0)
    private let completionsSeen = Atomic<Int>(0)
    var values: Int { valuesSeen.load(ordering: .relaxed) }
    var completions: Int { completionsSeen.load(ordering: .relaxed) }
    func value() { valuesSeen.wrappingAdd(1, ordering: .relaxed) }
    func completion() { completionsSeen.wrappingAdd(1, ordering: .relaxed) }
}

let sharedPublisher = session.dataTaskPublisher(
    for: userURL.appending(queryItems: [URLQueryItem(name: "shared", value: "1")]))
    .share()
let sharedDeliveries = DeliveryCounter()
let sharedA = sharedPublisher.sink(receiveCompletion: { @Sendable _ in sharedDeliveries.completion() },
                                   receiveValue: { @Sendable _ in sharedDeliveries.value() })
let sharedB = sharedPublisher.sink(receiveCompletion: { @Sendable _ in sharedDeliveries.completion() },
                                   receiveValue: { @Sendable _ in sharedDeliveries.value() })
while sharedDeliveries.completions < 2 { try await Task.sleep(for: .milliseconds(10)) }
assert(server.requests.filter { $0.target == "/users/1?shared=1" }.count == 1)   // one request
assert(sharedDeliveries.values == 2)                                             // two deliveries
```

Both subscribers received the response here because they subscribed before it arrived. A subscriber that arrives after the shared request has finished does not get the response replayed; [Managing Resources: `share` and Multicasting](/combine-share-multicasting/) measures that and shows how to cache the result instead.

## A `404` is a value

The publisher's failure type is `URLError`, which covers transport problems: no connection, a timeout, a TLS failure, a cancelled task. An HTTP error status is a successful transport of a response, so it arrives as a value:

```swift
nonisolated func statusCode(of publisher: URLSession.DataTaskPublisher) -> AnyPublisher<Int, URLError> {
    publisher
        .map { @Sendable output in (output.response as? HTTPURLResponse)?.statusCode ?? 0 }
        .eraseToAnyPublisher()
}

let missingStatus = await outcome(of: statusCode(of: session.dataTaskPublisher(for: server.baseURL.appending(path: "/users/2"))))
assert((try? missingStatus.get()) == [404])     // delivered as a value; the stream finished normally
```

A pipeline that decodes `data` without checking the status will try to decode the server's error body as a `User`, fail with a `DecodingError`, and report a decoding problem for what was actually a missing user. The networking roadmap's [Separating Transport Errors from Application Failures](/swift-transport-vs-application-errors/) makes the case for treating these as different kinds of failure, and the client below does.

## Validating, decoding, and typed errors

Combine has no built-in status validation, so it belongs in an operator of your own. An extension on `Publisher` is the natural place, and it has a second advantage under Swift 6 that the threads section explains: closures written in an extension like this are not isolated to any actor.

```swift
struct User: Decodable, Equatable, Sendable {
    let id: Int
    let name: String
}

enum APIError: Error, Equatable {
    case transport(URLError.Code)
    case status(Int)
    case decoding
}

extension Publisher where Output == URLSession.DataTaskPublisher.Output, Failure == URLError {
    /// Fails with `.status` for any response outside 200..<300, and maps transport errors.
    func validatingStatus() -> AnyPublisher<Data, APIError> {
        mapError { APIError.transport($0.code) }
            .flatMap { data, response -> AnyPublisher<Data, APIError> in
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    return Fail(error: .status(status)).eraseToAnyPublisher()
                }
                return Just(data).setFailureType(to: APIError.self).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
}

extension Publisher where Output == Data, Failure == APIError {
    /// Decodes the body, mapping decoding failures to `.decoding`.
    func decoding<T: Decodable>(_ type: T.Type, with decoder: JSONDecoder = JSONDecoder()) -> AnyPublisher<T, APIError> {
        decode(type: type, decoder: decoder)
            .mapError { $0 as? APIError ?? .decoding }
            .eraseToAnyPublisher()
    }
}

nonisolated func fetchUser(_ path: String, session: URLSession, baseURL: URL) -> AnyPublisher<User, APIError> {
    session.dataTaskPublisher(for: baseURL.appending(path: path))
        .validatingStatus()
        .decoding(User.self)
}

let found = await outcome(of: fetchUser("/users/1", session: session, baseURL: server.baseURL))
let missing = await outcome(of: fetchUser("/users/2", session: session, baseURL: server.baseURL))
let broken = await outcome(of: fetchUser("/broken", session: session, baseURL: server.baseURL))
assert(found == .success([User(id: 1, name: "Ada Lovelace")]))
assert(missing == .failure(.status(404)))
assert(broken == .failure(.decoding))
```

Using `flatMap` with `Fail` and `Just` keeps the error type concrete all the way through, instead of `tryMap` erasing it to `any Error` and a later `mapError` casting it back. Combine's `decode(type:decoder:)` has no typed version, so its `mapError` is the one place a cast is unavoidable; the `as? APIError` keeps an upstream `APIError` intact and labels everything else, which can only be a decoding error at that point, as `.decoding`.

## `retry` sees only failures

`retry(_:)` resubscribes to its upstream when it receives a failure, and resubscribing to a data task publisher sends the request again. Because a `503` is a value, `retry` placed *before* validation never fires:

```swift
let busyURL = server.baseURL.appending(path: "/busy")

let before = requestCount("/busy")
let retryFirst = await outcome(of: statusCode(of: session.dataTaskPublisher(for: busyURL)).retry(2))
assert((try? retryFirst.get()) == [503])
assert(requestCount("/busy") - before == 1)     // never retried

let beforeValidated = requestCount("/busy")
let validatedRetry = await outcome(of: session.dataTaskPublisher(for: busyURL).validatingStatus().retry(2))
assert(validatedRetry == .failure(.status(503)))
assert(requestCount("/busy") - beforeValidated == 3)   // the original request and two retries
```

Placed after validation, `retry(2)` sent the request three times, immediately, one after the other, and retried a `.status(404)` just as eagerly as a `.status(503)`. Real retry policies need to choose which failures are worth retrying, wait between attempts, and refuse to resend requests that are not idempotent; [Error Handling: `catch`, `retry`, and `replaceError`](/combine-error-handling-catch-retry/) builds a retry operator with backoff in Combine, and the networking roadmap's [Retry Policies, Backoff, and Idempotency](/swift-retry-backoff-idempotency/) explains which requests are safe to repeat.

## Cancelling the cancellable cancels the task

The subscription owns the `URLSessionDataTask`. Releasing or cancelling the handle cancels the task, and the session forgets it:

```swift
let slowHandle = session.dataTaskPublisher(for: server.baseURL.appending(path: "/slow"))
    .sink(receiveCompletion: { @Sendable _ in }, receiveValue: { @Sendable _ in })
try await Task.sleep(for: .milliseconds(200))
let tasksWhileRunning = await session.allTasks
assert(tasksWhileRunning.map(\.state) == [.running])
assert(requestCount("/slow") == 1)              // the server has the request

slowHandle.cancel()
try await Task.sleep(for: .milliseconds(200))
let tasksAfterCancel = await session.allTasks
assert(tasksAfterCancel.isEmpty)                // the task was cancelled and removed
```

This is the behavior a screen wants when it disappears mid-request, and it falls out of keeping the handle in the screen's `Set<AnyCancellable>`, as [`AnyCancellable` and Memory Management](/combine-anycancellable-memory/) describes. The server did receive the request, though, so cancellation saves the client's bandwidth and work, not the server's; a cancelled `POST` may still have taken effect.

## Threads, and the Swift 6 crash

`URLSession` calls its delegate, and therefore the data task publisher's subscriber, on its delegate queue, a background serial queue. Every operator after the publisher runs there too, until a `receive(on:)` moves delivery elsewhere:

```swift
nonisolated func deliveredOnMainThread(_ publisher: URLSession.DataTaskPublisher) -> AnyPublisher<Bool, URLError> {
    publisher.map { @Sendable _ in Thread.isMainThread }.eraseToAnyPublisher()
}

let deliveryThread = await outcome(of: deliveredOnMainThread(session.dataTaskPublisher(for: userURL)))
assert((try? deliveryThread.get()) == [false])
```

In Swift 5 that was a warning in the Main Thread Checker if a `sink` touched UI. In Swift 6 language mode it is a crash in a place most people do not expect. A closure written inside a `@MainActor` type, which every view model is, is inferred to be isolated to the main actor, and because Combine is a Swift 5 module, the compiler inserts a run-time isolation check into the closure instead of rejecting the call. This view model compiles without a warning:

```swift
// Crashes in Swift 6 language mode on the first response
@MainActor
final class CrashingProfileModel: ObservableObject {
    @Published var name = ""
    private var cancellables = Set<AnyCancellable>()

    func load(from url: URL) {
        URLSession.shared.dataTaskPublisher(for: url)
            .map { output in output.data }                     // main-actor closure, run on the delegate queue
            .decode(type: User.self, decoder: JSONDecoder())
            .map(\.name)
            .replaceError(with: "")
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.name = $0 }
            .store(in: &cancellables)
    }
}
```

When this class was compiled on its own and pointed at the local server, the process stopped with `EXC_BREAKPOINT` on the thread whose queue is `com.apple.NSURLSession-delegate`, inside `_swift_task_checkIsolatedSwift`, called from `closure #1 in CrashingProfileModel.load(from:)`: the first `map`. The `receive(on: DispatchQueue.main)` came too late: every closure *before* it runs on the delegate queue, and the first one, though it touches nothing on the main actor, carries the main actor's isolation and its check. The `sink` after `receive(on:)` is fine.

There are three fixes, in order of preference:

1. **Build the pipeline outside the main actor.** The `fetchUser` function and the extensions above are not isolated to any actor, so their closures have no isolation check. The view model calls the function and only subscribes on the main actor.
2. **Mark the closures `@Sendable`.** A `@Sendable` closure is not isolated to the context it is written in, as the helpers in this article do with `{ @Sendable output in ... }`. The compiler then also checks that the closure captures nothing it should not.
3. **Use key paths instead of closures** where possible, such as `.map(\.data)`, since a key path carries no isolation.

The safe view model looks like this:

```swift
@MainActor
final class ProfileModel: ObservableObject {
    @Published private(set) var user: User?
    @Published private(set) var error: APIError?
    private var cancellables = Set<AnyCancellable>()
    private let session: URLSession
    private let baseURL: URL

    init(session: URLSession, baseURL: URL) {
        self.session = session
        self.baseURL = baseURL
    }

    func load(userID: Int) {
        fetchUser("/users/\(userID)", session: session, baseURL: baseURL)   // built off the main actor
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion { self?.error = error }
            }, receiveValue: { [weak self] user in
                self?.user = user
            })
            .store(in: &cancellables)
    }
}

let profile = ProfileModel(session: session, baseURL: server.baseURL)
profile.load(userID: 1)
profile.load(userID: 2)
while profile.user == nil || profile.error == nil {
    try await Task.sleep(for: .milliseconds(10))   // lets the main queue deliver
}
assert(profile.user == User(id: 1, name: "Ada Lovelace"))
assert(profile.error == .status(404))
```

The `sink` closures are main-actor isolated, and their check passes because `receive(on: DispatchQueue.main)` delivers on the main queue. [Schedulers: `receive(on:)` and `subscribe(on:)`](/combine-schedulers-receive-subscribe-on/) explains why `DispatchQueue.main` rather than `RunLoop.main` is the right scheduler here.

This model also has a bug that the test above hides: calling `load` twice in a row runs both requests, and whichever finishes last wins. For a profile screen that switches between users, the fix is a single `AnyCancellable?` that each `load` replaces, or a subject of user IDs feeding `map` and `switchToLatest`, as in [Transforming: `map`, `flatMap`, and `scan`](/combine-map-flatmap-scan/).

```swift
withExtendedLifetime((sharedA, sharedB, slowHandle)) {}
server.stop()
```

## Publishers or `async`/`await`

For a single request in new code, `try await session.data(for:)` is shorter, propagates cancellation through tasks, and throws a typed status error as easily as the operators above produce one. The publisher form earns its place when the request is one step in a stream: a search field whose queries become requests through `debounce` and `switchToLatest`, a refresh triggered by a timer and a notification merged together, or an existing Combine codebase where every other dependency is already a publisher. [Combine vs. `async`/`await` and `AsyncSequence`](/combine-vs-async-await/) compares the two in detail, and [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/) shows how to call one from the other.

## Summary

- `dataTaskPublisher(for:)` is cold: no request until subscription, and a new request for each subscriber; three subscriptions sent three requests. `share()` made two concurrent subscribers send one.
- HTTP error statuses arrive as values; only transport problems are `URLError` failures. Validate with an operator that keeps a typed error, using `flatMap` with `Fail` and `Just` rather than `tryMap`.
- `retry` placed before validation never retried a `503`; placed after, it sent three requests back to back, for any status. Retry only what is worth retrying.
- Cancelling the handle cancelled the `URLSessionDataTask`, and the session dropped it; the server had already received the request.
- Values arrive on `URLSession`'s delegate queue. In Swift 6, any closure before `receive(on:)` that is written in main-actor code crashes there; build pipelines in nonisolated functions or extensions, or mark closures `@Sendable`.

## Exercise

Add an `ETag`-aware `fetchUser` that stores the last response's `ETag` and body, sends `If-None-Match` on the next request, and maps a `304 Not Modified` to the cached `User` instead of a failure. Extend `LocalServer`'s handler to return `304` when the tag matches, and test that the second request returns the cached value without decoding. Then put the function behind a `PassthroughSubject` of refresh triggers with `map` and `switchToLatest`, and assert that three rapid triggers produce three requests on the server but only one decoded update in the view model.

## Further reading

- Apple's documentation for [`dataTaskPublisher(for:)`](https://developer.apple.com/documentation/foundation/urlsession/datataskpublisher(for:)-5kiir) and [`decode(type:decoder:)`](https://developer.apple.com/documentation/combine/publisher/decode(type:decoder:)).
- [Advances in Networking, Part 1](https://developer.apple.com/videos/play/wwdc2019/712/), WWDC19, which introduced `URLSession`'s Combine support.
- The networking roadmap's [Designing an API Client Around Consumer Needs](/swift-api-client-design/), which designs the client around `async` functions; the publisher-returning functions in this article fit the same shape.

Previous: [Sequence Operators: `first`, `last`, and `collect`](/combine-first-last-collect/). Next: [Timers](/combine-timers/).

Return to the [Combine roadmap](/combine/).
