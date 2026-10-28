---
layout: post
hidden: true
title: "Testing Publishers"
date: "2026-08-12"
last_modified_at: "2026-08-12"
permalink: /combine-testing-publishers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Testing, Swift Testing]
thumbnail: assets/img/article-placeholder.svg
---
A pipeline is a promise about the future: when the user stops typing for 300 ms, send one request; when a newer query arrives, discard the old response; when the request fails, show an error and keep listening. Testing that promise means controlling the future, and the three tools Combine code needs for it are already in this series. Synchronous publishers can be collected and asserted on directly. Asynchronous ones can be awaited through `.values`. And anything that involves time, debounce, delay, timeouts, the hop to the main queue, should run on a scheduler the test controls, so that 300 ms passes when the test says so and not a moment before.

This article builds a small Swift package around a search view model, the kind of pipeline that is easiest to get subtly wrong, and tests it with Swift Testing. The tests pin the exact debounce boundary, prove that a stale response is cancelled rather than merely hidden, check that a failure does not end the stream, assert that no request is made for an empty query, verify the model deallocates, and exercise a custom operator with parameterized cases. Each virtual-time test finished in about two milliseconds of real time, without a single `sleep`.

<!--more-->

The package was built with the Swift 6.4 toolchain from Xcode 27.1, in Swift 6 language mode, and `swift test` ran it on macOS 26. The library target holds the code under test; the test target holds the `VirtualTimeScheduler` and `TimelineRecorder` from [Time: `debounce`, `throttle`, and `delay`](/combine-debounce-throttle-delay/#a-scheduler-whose-clock-you-control), unchanged, in a file of its own. Each block below names the file it belongs to.

<!-- check-uses: virtual-scheduler -->

## The code under test

The view model takes its two dependencies in its initializer: the search itself, as a function returning a publisher, and the scheduler used for both the debounce and the hop to the main queue. The scheduler is the type-erased `AnyScheduler` from [Schedulers: `receive(on:)` and `subscribe(on:)`](/combine-schedulers-receive-subscribe-on/), made public here:

<!-- file: Sources/Library/AnyScheduler.swift -->
```swift
import Combine
import Foundation

/// A scheduler that forwards to any scheduler with the same time type, ignoring options.
public struct AnyScheduler<SchedulerTimeType: Strideable>: Scheduler
where SchedulerTimeType.Stride: SchedulerTimeIntervalConvertible {
    public typealias SchedulerOptions = Never

    private let currentTime: () -> SchedulerTimeType
    private let tolerance: () -> SchedulerTimeType.Stride
    private let scheduleNow: (@escaping () -> Void) -> Void
    private let scheduleAfter: (SchedulerTimeType, SchedulerTimeType.Stride, @escaping () -> Void) -> Void
    private let scheduleRepeating: (SchedulerTimeType, SchedulerTimeType.Stride, SchedulerTimeType.Stride,
                                    @escaping () -> Void) -> any Cancellable

    public init<S: Scheduler>(_ base: S) where S.SchedulerTimeType == SchedulerTimeType {
        currentTime = { base.now }
        tolerance = { base.minimumTolerance }
        scheduleNow = { base.schedule(options: nil, $0) }
        scheduleAfter = { base.schedule(after: $0, tolerance: $1, options: nil, $2) }
        scheduleRepeating = { base.schedule(after: $0, interval: $1, tolerance: $2, options: nil, $3) }
    }

    public var now: SchedulerTimeType { currentTime() }
    public var minimumTolerance: SchedulerTimeType.Stride { tolerance() }

    public func schedule(options: Never?, _ action: @escaping () -> Void) { scheduleNow(action) }

    public func schedule(after date: SchedulerTimeType, tolerance: SchedulerTimeType.Stride,
                         options: Never?, _ action: @escaping () -> Void) {
        scheduleAfter(date, tolerance, action)
    }

    public func schedule(after date: SchedulerTimeType, interval: SchedulerTimeType.Stride,
                         tolerance: SchedulerTimeType.Stride, options: Never?,
                         _ action: @escaping () -> Void) -> any Cancellable {
        scheduleRepeating(date, interval, tolerance, action)
    }
}

public typealias MainScheduler = AnyScheduler<DispatchQueue.SchedulerTimeType>
```

The model publishes a single `state`. Each debounced, non-empty query becomes an inner publisher that starts with `.loading`, ends with `.results` or `.failed`, and is replaced by the next query through `switchToLatest`:

<!-- file: Sources/Library/SearchViewModel.swift -->
```swift
import Combine
import Foundation

public enum SearchFailure: Error, Equatable, Sendable {
    case offline
    case server(status: Int)
}

public enum SearchState: Equatable, Sendable {
    case idle
    case loading(query: String)
    case results(query: String, items: [String])
    case failed(query: String, message: String)
}

@MainActor
public final class SearchViewModel: ObservableObject {
    public typealias Search = (String) -> AnyPublisher<[String], SearchFailure>

    @Published public private(set) var state: SearchState = .idle
    public let query = PassthroughSubject<String, Never>()
    private var cancellables = Set<AnyCancellable>()

    public init(search: @escaping Search,
                scheduler: MainScheduler = AnyScheduler(DispatchQueue.main),
                debounce: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(300)) {
        query
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .removeDuplicates()
            .debounce(for: debounce, scheduler: scheduler)
            .map { query in SearchViewModel.states(for: query, search: search) }
            .switchToLatest()
            .receive(on: scheduler)
            .sink { [weak self] in self?.state = $0 }
            .store(in: &cancellables)
    }

    /// The states one query moves through. Nonisolated, because the search may deliver on any thread.
    nonisolated static func states(for query: String, search: Search) -> AnyPublisher<SearchState, Never> {
        guard !query.isEmpty else { return Just(.idle).eraseToAnyPublisher() }
        return search(query)
            .map { SearchState.results(query: query, items: $0) }
            .catch { Just(SearchState.failed(query: query, message: message(for: $0))) }
            .prepend(.loading(query: query))
            .eraseToAnyPublisher()
    }

    nonisolated static func message(for failure: SearchFailure) -> String {
        switch failure {
        case .offline: "You're offline."
        case .server(let status): "The server returned \(status)."
        }
    }
}
```

The per-query states are built in a `nonisolated` static function. The closures inside it run on whatever thread the search delivers on, which in production is `URLSession`'s delegate queue, and in Swift 6 a closure written directly in the `@MainActor` initializer would be main-actor isolated and crash there, as the scheduler article explains. Only the final `sink`, after `receive(on: scheduler)`, touches the model.

The library also has the `debounceKeepingLast` operator from the time operators article, which emits the pending value when the upstream finishes; it gets its own parameterized tests below:

<!-- file: Sources/Library/DebounceKeepingLast.swift -->
```swift
import Combine

extension Publisher where Output: Equatable {
    /// Like `debounce`, but also emits the final value when the upstream finishes.
    public func debounceKeepingLast<S: Scheduler>(
        for interval: S.SchedulerTimeType.Stride, scheduler: S
    ) -> AnyPublisher<Output, Failure> {
        let shared = share()
        return shared.debounce(for: interval, scheduler: scheduler)
            .merge(with: shared.last())
            .removeDuplicates()
            .eraseToAnyPublisher()
    }
}
```

## A fake search the tests can inspect

The tests replace the network with a fake that records each query, delivers its result after a configurable latency on the test's scheduler, and records when a search is cancelled. Because every test runs on the main actor and the virtual scheduler runs its work on the calling thread, the fake can be a plain main-actor class:

<!-- file: Tests/LibraryTests/FakeSearch.swift -->
```swift
import Combine
import Foundation
@testable import Library

@MainActor
final class FakeSearch {
    private(set) var queries: [String] = []
    private(set) var cancelled: [String] = []
    var latency: [String: Int] = [:]                   // milliseconds, per query; default 100
    var failures: [String: SearchFailure] = [:]
    private let scheduler: VirtualTimeScheduler

    init(scheduler: VirtualTimeScheduler) { self.scheduler = scheduler }

    func callAsFunction(_ query: String) -> AnyPublisher<[String], SearchFailure> {
        queries.append(query)
        let result: AnyPublisher<[String], SearchFailure> = if let failure = failures[query] {
            Fail(error: failure).eraseToAnyPublisher()
        } else {
            Just(["\(query) 1", "\(query) 2"]).setFailureType(to: SearchFailure.self).eraseToAnyPublisher()
        }
        return Just(())
            .setFailureType(to: SearchFailure.self)
            .delay(for: .milliseconds(latency[query] ?? 100), scheduler: scheduler)
            .flatMap { result }
            .handleEvents(receiveCancel: { [weak self] in self?.cancelled.append(query) })
            .eraseToAnyPublisher()
    }

    /// A `Search` closure for the view model, which calls it on the main actor.
    var function: SearchViewModel.Search {
        { query in self(query) }
    }
}
```

The view model's `Search` type is a plain, non-`Sendable` function type, because the model calls it only from its own pipeline on the main actor; that is what lets a main-actor fake be passed in directly. A first draft of this package declared `Search` as `@Sendable` and wrapped the fake's call in `MainActor.assumeIsolated`, and the compiler rejected it: `assumeIsolated` must return a `Sendable` value, and `AnyPublisher` is not one. Combine's lack of `Sendable` annotations shapes test doubles as much as production code.

## Testing in virtual time

Every test creates a fresh `VirtualTimeScheduler`, injects it, sends input, and advances the clock to exact instants. The suite is `@MainActor` because the view model is:

<!-- file: Tests/LibraryTests/SearchViewModelTests.swift -->
```swift
import Combine
import Testing
@testable import Library

@MainActor
@Suite("SearchViewModel")
struct SearchViewModelTests {
    let clock = VirtualTimeScheduler()
    let search: FakeSearch
    let model: SearchViewModel

    init() {
        search = FakeSearch(scheduler: clock)
        model = SearchViewModel(search: search.function, scheduler: AnyScheduler(clock))
    }

    @Test("waits exactly 300 ms after the last keystroke, then searches once")
    func debounceBoundary() {
        model.query.send("sw")
        clock.advance(by: .milliseconds(100))
        model.query.send("swift")
        clock.advance(by: .milliseconds(299))
        #expect(search.queries.isEmpty)
        #expect(model.state == .idle)

        clock.advance(by: .milliseconds(1))             // 300 ms after "swift"
        #expect(search.queries == ["swift"])
        #expect(model.state == .loading(query: "swift"))

        clock.advance(by: .milliseconds(100))           // the fake's latency
        #expect(model.state == .results(query: "swift", items: ["swift 1", "swift 2"]))
    }

    @Test("ignores whitespace-only changes")
    func trimmedDuplicates() {
        model.query.send("swift")
        clock.advance(by: .milliseconds(200))
        model.query.send("swift ")                       // same query after trimming
        clock.advance(by: .seconds(1))
        #expect(search.queries == ["swift"])
    }

    @Test("does not search for an empty query")
    func emptyQuery() {
        model.query.send("swift")
        clock.advance(by: .seconds(1))
        model.query.send("   ")
        clock.advance(by: .seconds(1))
        #expect(search.queries == ["swift"])
        #expect(model.state == .idle)
    }

    @Test("cancels the request for a superseded query")
    func cancelsStaleRequest() {
        search.latency["slow"] = 500
        model.query.send("slow")
        clock.advance(by: .milliseconds(300))           // "slow" is searched, due at 800 ms
        model.query.send("fast")
        clock.advance(by: .milliseconds(300))           // "fast" is searched at 600 ms
        clock.advance(by: .seconds(1))

        #expect(search.queries == ["slow", "fast"])
        #expect(search.cancelled == ["slow"])          // cancelled, not merely ignored
        #expect(model.state == .results(query: "fast", items: ["fast 1", "fast 2"]))
    }

    @Test("shows a failure and keeps listening")
    func recoversAfterFailure() {
        search.failures["offline"] = .offline
        model.query.send("offline")
        clock.advance(by: .milliseconds(400))
        #expect(model.state == .failed(query: "offline", message: "You're offline."))

        model.query.send("swift")
        clock.advance(by: .milliseconds(400))
        #expect(model.state == .results(query: "swift", items: ["swift 1", "swift 2"]))
    }

    @Test("passes through each state exactly once, at exact times")
    func timeline() {
        let recorder = TimelineRecorder(model.$state.dropFirst(), scheduler: clock)
        model.query.send("swift")
        clock.advance(by: .seconds(1))
        #expect(recorder.events == [
            "loading(query: \"swift\")@300",
            "results(query: \"swift\", items: [\"swift 1\", \"swift 2\"])@400",
        ])
    }
}
```

The first test is the one that sleep-based tests cannot write. It asserts that nothing has happened at 299 ms and that the search starts at exactly 300 ms, a boundary that a test sleeping for 310 ms on a real clock cannot see, and that a test sleeping for 290 ms would get wrong on a slow machine. The cancellation test distinguishes two implementations that look identical on screen: a `flatMap` that lets the slow response arrive and be overwritten, and a `switchToLatest` that cancels it. Only the second saves the user's bandwidth, and only `search.cancelled` can tell them apart.

## Testing without controlling time

Some tests need the real schedulers, for example a smoke test of the default `DispatchQueue.main` path, or code that does not take a scheduler. `.values` turns a publisher into an `AsyncSequence`, and a Swift Testing time limit bounds the wait if the expected value never arrives:

<!-- file: Tests/LibraryTests/RealSchedulerTests.swift -->
```swift
import Combine
import Foundation
import Testing
@testable import Library

@MainActor
@Suite("Real schedulers")
struct RealSchedulerTests {
    @Test("the default main-queue scheduler delivers results", .timeLimit(.minutes(1)))
    func defaultScheduler() async {
        let model = SearchViewModel(
            search: { query in Just([query.uppercased()]).setFailureType(to: SearchFailure.self).eraseToAnyPublisher() },
            debounce: .milliseconds(10))
        model.query.send("combine")

        for await state in model.$state.values {
            if case .results(_, let items) = state {
                #expect(items == ["COMBINE"])
                break
            }
        }
    }

    @Test("results that arrive on a background queue are applied on the main actor")
    func backgroundDelivery() async throws {
        let model = SearchViewModel(
            search: { query in
                Just([query])
                    .setFailureType(to: SearchFailure.self)
                    .receive(on: DispatchQueue.global())     // like URLSession's delegate queue
                    .eraseToAnyPublisher()
            },
            debounce: .milliseconds(10))
        model.query.send("background")
        let deadline = ContinuousClock.now + .seconds(2)
        while model.state != .results(query: "background", items: ["background"]), ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect(model.state == .results(query: "background", items: ["background"]))
    }
}
```

The `for await` loop needs no timeout of its own: it ends when the expected state arrives, and the `.timeLimit` trait fails the test if it never does. Swift Testing's smallest time limit is one minute, which is a backstop rather than a measurement. The second test polls instead, with its own two-second deadline, because it is checking a property rather than waiting for an event; polling with `Task.sleep` suspends the main actor, which lets the main queue deliver. That test is also a regression test for the isolation rule. With the body of `states(for:search:)` pasted back into the `map` closure in the main-actor initializer, `swift test` reported that the test process "exited with unexpected signal code 5": the isolation check's `SIGTRAP`, on the first background delivery.

`.values` requests one value at a time. That is harmless on a `@Published` property, which is backed by a current value, and can lose values on a `PassthroughSubject`, as [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/) measures. For event streams, prefer a recorder that subscribes with `sink` and requests unlimited demand.

## Counting with `confirmation`

Swift Testing's `confirmation` checks that an event happens a given number of times, including zero, within its body. It suits synchronous pipelines, where everything happens before the body returns, and it reads better than a counter and an `#expect`:

<!-- file: Tests/LibraryTests/ConfirmationTests.swift -->
```swift
import Combine
import Testing
@testable import Library

@MainActor
@Suite("Confirmations")
struct ConfirmationTests {
    @Test("every value of a synchronous publisher is delivered once")
    func synchronousDelivery() async {
        await confirmation("value delivered", expectedCount: 3) { delivered in
            let handle = [1, 2, 3].publisher.sink { _ in delivered() }
            handle.cancel()
        }
    }

    @Test("an empty query never reaches the search")
    func noSearchForEmptyQuery() async {
        let clock = VirtualTimeScheduler()
        await confirmation("search called", expectedCount: 0) { searched in
            let model = SearchViewModel(
                search: { _ in
                    searched()
                    return Empty().eraseToAnyPublisher()
                },
                scheduler: AnyScheduler(clock))
            model.query.send("   ")
            clock.advance(by: .seconds(1))
        }
    }
}
```

## Testing that nothing leaks

A view model that leaks keeps its subscriptions alive, and with them its network requests and timers. The test holds the model weakly, drops the strong reference, and checks that it is gone, after doing enough work to have created every subscription:

<!-- file: Tests/LibraryTests/LeakTests.swift -->
```swift
import Combine
import Testing
@testable import Library

@MainActor
@Suite("Lifetime")
struct LeakTests {
    @Test("the view model deallocates after a search")
    func deallocates() {
        let clock = VirtualTimeScheduler()
        let search = FakeSearch(scheduler: clock)
        weak var weakModel: SearchViewModel?
        do {
            let model = SearchViewModel(search: search.function, scheduler: AnyScheduler(clock))
            weakModel = model
            model.query.send("swift")
            clock.advance(by: .milliseconds(350))       // a search is in flight
        }
        #expect(weakModel == nil)
        #expect(search.cancelled == ["swift"])         // deallocation cancelled the request
    }
}
```

The second expectation is the more interesting one: releasing the model released its `Set<AnyCancellable>`, which cancelled the in-flight search, as [`AnyCancellable` and Memory Management](/combine-anycancellable-memory/) described. Replacing `[weak self]` with a strong `self` capture in the view model's `sink` made both expectations fail: `Expectation failed: weakModel == nil` and `Expectation failed: search.cancelled == ["swift"]`.

## Parameterized tests for an operator

Operators are pure functions of an input timeline, which makes them natural candidates for parameterized tests: one test body, a table of scripts and expected outputs. Swift Testing reports each argument as its own case:

<!-- file: Tests/LibraryTests/DebounceKeepingLastTests.swift -->
```swift
import Combine
import Testing
@testable import Library

struct DebounceCase: Sendable, CustomTestStringConvertible {
    let name: String
    let script: [(at: Int, value: String?)]           // nil finishes the stream
    let expected: [String]
    var testDescription: String { name }
}

@MainActor
@Suite("debounceKeepingLast")
struct DebounceKeepingLastTests {
    nonisolated static let cases = [
        DebounceCase(name: "burst then pause",
                     script: [(0, "a"), (100, "ab"), (200, "abc"), (900, nil)],
                     expected: ["abc@500", "|@900"]),
        DebounceCase(name: "finish during the window keeps the last value",
                     script: [(0, "a"), (100, "ab"), (150, nil)],
                     expected: ["ab@150", "|@150"]),
        DebounceCase(name: "finish after a pause does not repeat the value",
                     script: [(0, "done"), (500, nil)],
                     expected: ["done@300", "|@500"]),
        DebounceCase(name: "no values",
                     script: [(100, nil)],
                     expected: ["|@100"]),
    ]

    @Test(arguments: cases)
    func emits(_ testCase: DebounceCase) {
        let clock = VirtualTimeScheduler()
        let input = PassthroughSubject<String, Never>()
        let recorder = TimelineRecorder(input.debounceKeepingLast(for: .milliseconds(300), scheduler: clock),
                                        scheduler: clock)
        clock.perform(testCase.script.map { step in
            (step.at, { if let value = step.value { input.send(value) } else { input.send(completion: .finished) } })
        }, until: 2_000)
        #expect(recorder.events == testCase.expected)
    }
}
```

## Running the suite

`swift test` built the package and ran every test:

```text
✔ Test "waits exactly 300 ms after the last keystroke, then searches once" passed after 0.002 seconds.
✔ Test "cancels the request for a superseded query" passed after 0.002 seconds.
✔ Test emits(_:) with 4 test cases passed after 0.002 seconds.
✔ Test "the default main-queue scheduler delivers results" passed after 0.013 seconds.
✔ Test "results that arrive on a background queue are applied on the main actor" passed after 0.016 seconds.
✔ Test run with 12 tests in 5 suites passed after 0.016 seconds.
```

Each virtual-time test simulated up to two seconds of user time and finished in about two milliseconds of real time; the two real-scheduler tests took 13 and 16 ms, the length of their debounce and delivery. That proportion is the goal: test the logic in virtual time, and keep a few real-time tests to check the wiring.

## Summary

- Inject every scheduler a pipeline uses, through `AnyScheduler`, so tests can substitute a `VirtualTimeScheduler` and production keeps `DispatchQueue.main`.
- Virtual time pins exact boundaries: nothing at 299 ms, a search at 300 ms. Assert on cancellations as well as on outputs to tell `switchToLatest` from `flatMap`.
- Build per-request publishers in nonisolated code so a background delivery cannot crash the main-actor model; a test with a background search guards that.
- Use `.values` with a `.timeLimit` trait, or a bounded polling loop, for the few tests that need real schedulers; `.values` requests one value at a time.
- `confirmation` with an expected count, including zero, checks synchronous events; a `weak` reference checks that the model and its requests go away.
- Parameterized `@Test(arguments:)` cases turn an operator's behavior into a table of timelines.

## Exercise

Add a retry with backoff, from [Error Handling](/combine-error-handling-catch-retry/), to the view model's search, retrying `.offline` twice with delays of 200 and 400 ms but not retrying `.server`. Write virtual-time tests that assert the exact times of the three attempts, that a new query during a backoff wait cancels the pending retry rather than letting it fire later, and that the state shows `.loading` throughout the retries and `.failed` only after the last one. Then make one test fail on purpose by removing `switchToLatest`, and read the message Swift Testing prints for the cancellation expectation.

## Further reading

- Apple's [Swift Testing](https://developer.apple.com/documentation/testing) documentation, including [`confirmation`](https://developer.apple.com/documentation/testing/confirmation(_:expectedcount:isolation:sourcelocation:_:)-5mqz2) and parameterized tests.
- [Meet Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10179/) and [Go further with Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10195/), WWDC24.
- The networking roadmap's [Testing Network Failures](/swift-testing-network-failures/), which tests the HTTP layer underneath a pipeline like this one.

Previous: [Debugging Pipelines with `print` and `handleEvents`](/combine-debugging-print-handleevents/). Next: [Combine vs. `async`/`await` and `AsyncSequence`](/combine-vs-async-await/).

Return to the [Combine roadmap](/combine/).
