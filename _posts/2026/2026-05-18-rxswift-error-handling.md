---
layout: post
hidden: true
title: "Error Handling: catch, catchAndReturn, and retry"
date: "2026-05-18"
last_modified_at: "2026-05-18"
permalink: /rxswift-error-handling/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming, Error Handling]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
An error in RxSwift is not an exception that a caller can catch and move past. It is the last event of a sequence. When a network request fails inside a chain, the chain ends: the subscriber's `onError` runs, the subscription is disposed, and nothing that chain would have done later will happen. Every earlier article has run into a version of this. A failed search ended searching for good in [Driver and Signal](/rxswift-driver-signal/#a-driver-that-cannot-fail-can-still-end), and a failed request cancelled a healthy one in [Transforming Operators](/rxswift-transforming-operators/#errors-inside-a-flattening-operator).

Error handling in RxSwift is therefore about *where* a sequence is allowed to end, and what replaces it. This article covers the three families of operators for that: `catch` and `catchAndReturn`, which replace a failed sequence with another one; `retry` and `retry(when:)`, which subscribe again; and `materialize`, which turns errors into ordinary elements. It measures each on a virtual clock, derives the total waiting time of an exponential backoff, and shows two retries that look correct and do nothing: retrying a subject, and retrying a cached failure.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift` and `RxTest`, together with `record` from [Observables and Observers](/rxswift-observables-observers/) and `timeline` and `millisecondScheduler` from [Filtering Operators](/rxswift-filtering-operators/#a-clock-you-control).

<!-- check-uses: rx-record -->
<!-- check-uses: rx-timeline -->
```swift
import RxSwift
import RxTest
import Foundation
```

The examples use a request that fails a given number of times before it succeeds, counting its attempts. It is cold, built with `create`, so each subscription is a new attempt, which is exactly what makes retrying meaningful:

```swift
final class FlakyEndpoint {
    private(set) var attempts = 0
    private let failuresBeforeSuccess: Int

    init(failuresBeforeSuccess: Int) { self.failuresBeforeSuccess = failuresBeforeSuccess }

    func fetch() -> Observable<String> {
        Observable.create { observer in
            self.attempts += 1
            if self.attempts <= self.failuresBeforeSuccess {
                observer.onError(DemoError.timeout)
            } else {
                observer.onNext("data on attempt \(self.attempts)")
                observer.onCompleted()
            }
            return Disposables.create()
        }
    }
}
```

## An error ends the sequence

Elements after an error never arrive, and the operators above the failure point are disposed:

```swift
var upstreamDisposed = false
let interrupted = Observable.concat(.of(1, 2), .error(DemoError.boom), .of(3, 4))
    .do(onDispose: { upstreamDisposed = true })
assert(record(interrupted) == ["1", "2", "x(boom)"])
assert(upstreamDisposed)
```

So the question for each chain is not "how do I continue after the error?" (you cannot) but "which sequence should take the failed one's place?"

## `catch`: replace the failed sequence

`catch` subscribes to a fallback observable, chosen by a closure that receives the error, and forwards it in place of the failed source. Elements before the error are kept:

```swift
let withFallback = Observable.concat(.of("live 1", "live 2"), .error(DemoError.timeout))
    .catch { error in
        error as? DemoError == .timeout ? .just("cached") : .error(error)
    }
assert(record(withFallback) == ["live 1", "live 2", "cached", "|"])
```

The closure decides per error. Returning `.error(error)` passes an error through unchanged, which is how to handle only the errors a fallback can fix, and returning `.empty()` swallows the error and completes.

`catchAndReturn` is the common special case of a single fallback element:

```swift
let withDefault = FlakyEndpoint(failuresBeforeSuccess: 1).fetch().catchAndReturn("placeholder")
assert(record(withDefault) == ["placeholder", "|"])
```

Both *complete* after the fallback. The failed source is gone, and the fallback is finite, so the whole chain is now finished. That is fine for a one-shot request and is the trap measured in [Driver and Signal](/rxswift-driver-signal/#a-driver-that-cannot-fail-can-still-end) for long-lived chains: `asDriver(onErrorJustReturn:)` is `catchAndReturn` with main-thread delivery.

### Catch where ending is acceptable

The rule that falls out is to catch at the level where ending is harmless. For a stream of requests, that is *inside* the flattening operator, so each request ends on its own and the stream of triggers lives on. Here three refresh taps each start a request; the second fails:

```swift
let outcomes = ["first": true, "second": false, "third": true]
@MainActor func refresh(_ name: String) -> Observable<String> {
    outcomes[name]! ? .just("\(name) refreshed") : .error(DemoError.timeout)
}

let taps = Observable.of("first", "second", "third")

let caughtOutside = taps.flatMap { refresh($0) }.catchAndReturn("refresh failed")
assert(record(caughtOutside) == ["first refreshed", "refresh failed", "|"])   // "third" never ran

let caughtInside = taps.flatMap { refresh($0).catchAndReturn("\($0) failed") }
assert(record(caughtInside) == ["first refreshed", "second failed", "third refreshed", "|"])
```

With the `catch` outside, one failure ended refreshing; with it inside, the failure became one element and the third refresh ran. In UI code this is the single most important error-handling decision.

## `retry`: subscribe again

`retry(_:)` resubscribes to the source when it fails, up to a maximum number of *attempts* (not retries), and forwards the last error if every attempt fails. Because the request is cold, each subscription makes a new attempt:

```swift
let flaky = FlakyEndpoint(failuresBeforeSuccess: 2)
assert(record(flaky.fetch().retry(3)) == ["data on attempt 3", "|"])
assert(flaky.attempts == 3)

let broken = FlakyEndpoint(failuresBeforeSuccess: 10)
assert(record(broken.fetch().retry(3)) == ["x(timeout)"])
assert(broken.attempts == 3)                               // three attempts, then the error
```

`retry(3)` made three attempts in total, so it allows two retries. `retry()` with no argument retries forever, which with a permanent failure and a synchronous source is an infinite loop on the current thread.

Retrying repeats *everything* between the source and the `retry`, including side effects. A `do(onNext:)` that logs, or elements already emitted before the failure, are produced again on each attempt:

```swift
var partialAttempts = 0
let partial = Observable<Int>.create { observer in
    partialAttempts += 1
    observer.onNext(1)
    observer.onNext(2)
    if partialAttempts < 2 { observer.onError(DemoError.boom) } else { observer.onCompleted() }
    return Disposables.create()
}
assert(record(partial.retry(2)) == ["1", "2", "1", "2", "|"])  // the subscriber saw 1 and 2 twice
```

For a paginated download, that is a duplicated page. Either make the retried unit produce nothing until it has succeeded, typically by retrying a `Single`, or deduplicate downstream.

### Retries that do nothing

Retrying works by subscribing again, so it only helps when subscribing again does new work. Two common sources do not.

A subject remembers its error and delivers it to every new subscriber immediately, as [`PublishSubject`](/rxswift-publishsubject/#completion-is-remembered) measured. Retrying a subject just collects the same error again, instantly:

```swift
let socketMessages = PublishSubject<String>()
socketMessages.onError(DemoError.timeout)

var resubscriptions = 0
let retriedSubject = socketMessages.do(onSubscribe: { resubscriptions += 1 }).retry(3)
assert(record(retriedSubject) == ["x(timeout)"])
assert(resubscriptions == 3)                                // three attempts, no new work
```

To retry a connection, retry the *operation that creates it*, such as a `create` that opens a socket and feeds a fresh subject, not the subject.

A shared sequence with `share(replay: 1, scope: .forever)` caches its failure, as [`ReplaySubject`](/rxswift-replaysubject/#sharereplayscope-replay-as-a-sharing-mechanism) measured, so a `retry` after it resubscribes to the cache:

```swift
let cachedFlaky = FlakyEndpoint(failuresBeforeSuccess: 1)
let cachedRequest = cachedFlaky.fetch().share(replay: 1, scope: .forever)
assert(record(cachedRequest.retry(3)) == ["x(timeout)"])
assert(cachedFlaky.attempts == 1)                          // one real attempt; two retries hit the cache

let retriedThenShared = cachedFlaky.fetch().retry(3).share(replay: 1, scope: .forever)
assert(record(retriedThenShared) == ["data on attempt 2", "|"])
```

Put `retry` *before* `share`, so the retries happen against the real source and only the final outcome is shared.

## `retry(when:)`: retry with a delay

Retrying instantly is rarely right for a network request. If the server is overloaded, an immediate retry adds load at the worst moment. `retry(when:)` gives control over *when* to resubscribe: it passes a closure an observable of the errors, and resubscribes each time the observable the closure returns emits an element. Returning an error from it gives up.

Exponential backoff waits $$b$$, then $$2b$$, then $$4b$$, and so on before each retry. In virtual time with a base of 100 milliseconds and at most three retries:

```swift
func exponentialBackoff(
    base: Int, maxRetries: Int, scheduler: SchedulerType
) -> (Observable<Error>) -> Observable<Int> {
    { errors in
        errors.enumerated().flatMap { attempt, error -> Observable<Int> in
            guard attempt < maxRetries else { return .error(error) }
            let delay = base * (1 << attempt)                    // base, 2 base, 4 base, ...
            return Observable<Int>.timer(.milliseconds(delay), scheduler: scheduler)
        }
    }
}

let backoffClock = millisecondScheduler()
let backoffEndpoint = FlakyEndpoint(failuresBeforeSuccess: 3)
var attemptTimes: [Int] = []
let backedOff = backoffClock.start(created: 0, subscribed: 0, disposed: 10_000) {
    backoffEndpoint.fetch()
        .do(onSubscribe: { attemptTimes.append(backoffClock.clock) })
        .retry(when: exponentialBackoff(base: 100, maxRetries: 3, scheduler: backoffClock))
}
assert(attemptTimes == [0, 100, 300, 700])
assert(timeline(backedOff.events) == ["data on attempt 4@700", "|@700"])
```

The attempts started at 0, 100, 300, and 700 milliseconds: waits of 100, 200, and 400. After $$n$$ retries with base $$b$$ and factor 2, the total time spent waiting is a geometric series,

$$
\sum_{k=0}^{n-1} b \cdot 2^{k} = b\,(2^{n} - 1),
$$

which is $$100 \times (2^3 - 1) = 700$$ milliseconds here, matching the measured time of the fourth attempt. The formula is what sets the limits in practice: with a base of one second, five retries already wait $$31$$ seconds in total, longer than most users will look at a spinner, and ten retries wait 17 minutes.

### Jitter

When a server fails, every client that was using it fails at nearly the same moment, and identical backoff schedules make them all retry at the same moments too. Randomizing each wait spreads them out. With "full jitter", each wait is drawn uniformly between zero and the exponential value, which halves the expected total to $$b(2^n - 1)/2$$ while breaking the synchronization. It is a one-line change to the delay above, using a random number generator that you inject so tests stay reproducible.

### Giving up

When the closure returns an error, the retrying stops and that error is forwarded. With four failures and three retries allowed:

```swift
let giveUpClock = millisecondScheduler()
let hopeless = FlakyEndpoint(failuresBeforeSuccess: 4)
let gaveUp = giveUpClock.start(created: 0, subscribed: 0, disposed: 10_000) {
    hopeless.fetch().retry(when: exponentialBackoff(base: 100, maxRetries: 3, scheduler: giveUpClock))
}
assert(timeline(gaveUp.events) == ["x(timeout)@700"])
assert(hopeless.attempts == 4)
```

A retry policy should also decide *which* errors to retry. A timeout or a 503 is worth retrying; a 401 or a decoding error will fail the same way every time. Checking the error inside the `flatMap` and returning `.error(error)` immediately for permanent failures keeps the app from waiting 700 milliseconds to report something it knew at once.

## `materialize`: errors as elements

`materialize()` turns every event into an element of type `Event<Element>`. When the source fails, the error becomes the last element and the materialized sequence then completes normally; when the source completes, a `.completed` element is emitted before the completion. The sequence can never fail, and the error becomes data that later operators can inspect:

```swift
let materialized = Observable.concat(.of(1), .error(DemoError.boom)).materialize()
assert(record(materialized) == ["next(1)", "error(boom)", "|"])     // the error is now an element
assert(record(Observable.of(1).materialize()) == ["next(1)", "completed", "|"])
```

The more readable variant for app code maps each request to a `Result` and catches into the failure case, which keeps the error and lets a long-lived chain show it without ending:

```swift
let results = Observable.of("first", "second", "third")
    .flatMap { name in
        refresh(name)
            .map { Result<String, Error>.success($0) }
            .catch { .just(.failure($0)) }
    }
    .map { result -> String in
        switch result {
        case .success(let message): message
        case .failure(let error): "failed: \(error)"
        }
    }
assert(record(results) == ["first refreshed", "failed: timeout", "third refreshed", "|"])
```

`dematerialize()` reverses `materialize()`, turning `Event` elements back into real events, which is occasionally useful to carry errors through a section of a chain that must not fail, such as a `Relay`.

## Observing errors without handling them

`do(onError:)` runs a closure when an error passes, without changing the sequence. It is the place to log, before a `catch` replaces the error:

```swift
var logged: [String] = []
let logThenRecover = FlakyEndpoint(failuresBeforeSuccess: 1).fetch()
    .do(onError: { logged.append("request failed: \($0)") })
    .catchAndReturn("offline")
assert(record(logThenRecover) == ["offline", "|"])
assert(logged == ["request failed: timeout"])
```

Errors that reach a subscriber without an `onError` closure go to `Hooks.defaultErrorHandler`, which [Subscribing](/rxswift-subscribing/#unhandled-errors) recommends replacing at launch.

## Names in older code

RxSwift 6 renamed the error operators. Code written for RxSwift 5 uses `catchError(_:)` for `catch(_:)`, `catchErrorJustReturn(_:)` for `catchAndReturn(_:)`, and `retryWhen(_:)` for `retry(when:)`. The old names still compile with deprecation warnings.

| RxSwift 6 | Combine |
| --- | --- |
| `catch` | `catch`, `tryCatch` |
| `catchAndReturn` | `replaceError(with:)` |
| `retry(n)` | `retry(n - 1)` (Combine counts retries, RxSwift counts attempts) |
| `retry(when:)` | no built-in equivalent |
| `materialize`, `dematerialize` | no built-in equivalent |
| `do(onError:)` | `handleEvents(receiveCompletion:)` |

The `retry` row is worth a second look when porting code: RxSwift's `retry(3)` makes three attempts in total, while Combine's `retry(3)` makes four. [Error Handling: `catch`, `retry`, and `replaceError`](/combine-error-handling-catch-retry/) builds exponential backoff for Combine, which has no `retry(when:)`.

## Summary

- An error ends the sequence and disposes everything above it; error handling chooses what replaces it.
- `catch` and `catchAndReturn` keep earlier elements, switch to a fallback, and complete. Catch inside `flatMap` so each request ends on its own: measured, catching outside lost the third refresh.
- `retry(n)` makes `n` attempts in total and repeats every side effect and element before the failure on each attempt.
- Retrying a subject or a `share(replay:scope: .forever)` cache resubscribes to a remembered error: three attempts, one real request. Put `retry` before `share`.
- `retry(when:)` with exponential backoff waited 100, 200, and 400 ms, for a total of $$b(2^n - 1) = 700$$ ms; full jitter halves the expected total.
- `materialize` or a `Result` mapping turns errors into elements, so a long-lived chain can show them without ending.

## Exercise

Write `retry(maxAttempts:baseDelay:isRetriable:scheduler:)`, an exponential backoff with full jitter, a cap of 5 seconds on any single wait, and a predicate that stops immediately for errors it considers permanent. Test it in virtual time with a seeded random generator: check that a permanent error is forwarded at the time of the first failure, that the waits never exceed the cap, and that across 10,000 simulated runs the mean total wait for four retries with a 100 ms base is close to $$b(2^n - 1)/2 = 750$$ ms.

## Further reading

- [Error handling](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/GettingStarted.md#error-handling) in RxSwift's Getting Started guide.
- [Catch](https://reactivex.io/documentation/operators/catch.html), [Retry](https://reactivex.io/documentation/operators/retry.html), and [Materialize](https://reactivex.io/documentation/operators/materialize-dematerialize.html) on ReactiveX.io.
- Marc Brooker, [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), AWS Architecture Blog, the analysis behind full jitter.
- [Error Handling: `catch`, `retry`, and `replaceError`](/combine-error-handling-catch-retry/) for the Combine side.

Previous: [Combining Operators](/rxswift-combining-operators/). Next: [Schedulers: `observe(on:)` and `subscribe(on:)`](/rxswift-schedulers/).

Return to the [RxSwift roadmap](/rxswift/).
