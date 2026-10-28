---
layout: post
hidden: true
title: "Single, Maybe, and Completable"
date: "2026-05-04"
last_modified_at: "2026-05-04"
permalink: /rxswift-single-maybe-completable/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, Reactive Programming, Concurrency]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
An `Observable<User>` returned by `fetchUser(id:)` says very little. It might emit one user and complete, which is what the author meant. It might also, as far as the type is concerned, emit three users, or none, or never finish. Every caller has to read the implementation, or trust a comment, to know what to handle.

RxSwift's **traits** narrow the grammar of an observable and put the narrowed version in the type. A `Single` emits exactly one element or an error. A `Maybe` emits one element, nothing, or an error. A `Completable` emits only completion or an error. They are the types for the most common shapes of asynchronous work: a request, a lookup that might find nothing, and a write that returns no data. This article measures what each one guarantees, what happens at the conversions between them and ordinary observables (including one that waits forever), how they compose, and how they bridge to `async`/`await`, where RxSwift's `values` turns out to keep every element that Combine's version drops.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift` of an executable target that depends on `RxSwift` and `RxBlocking`, together with the `record` helper from [Observables and Observers](/rxswift-observables-observers/).

<!-- check-uses: rx-record -->
```swift
@preconcurrency import RxSwift
import RxBlocking
import Foundation
import Synchronization
```

## Three narrower grammars

An ordinary observable follows the grammar from [Observables and Observers](/rxswift-observables-observers/#the-grammar). Each trait allows a subset of it:

$$
\begin{aligned}
\text{Observable} &:\; \text{next}^{*}\,(\text{error} \mid \text{completed})^{?} \\
\text{Single} &:\; \text{success} \mid \text{error} \\
\text{Maybe} &:\; \text{success} \mid \text{completed} \mid \text{error} \\
\text{Completable} &:\; \text{completed} \mid \text{error}
\end{aligned}
$$

A `Single`'s *success* is an element and a completion at once, delivered as one event. That is why a `Single` subscriber has `onSuccess` and `onFailure` instead of `onNext`, `onError`, and `onCompleted`, and why its event type is simply `Result<Element, Error>`:

```swift
let answer = Single.just(42)
var outcome = ""
let answerSubscription = answer.subscribe(
    onSuccess: { outcome = "success \($0)" },
    onFailure: { outcome = "failure \($0)" }
)
assert(outcome == "success 42")
```

All three traits are the same generic struct, `PrimitiveSequence<Trait, Element>`, with a marker type for the trait: `Single<Element>` is `PrimitiveSequence<SingleTrait, Element>`, and `Completable` is `PrimitiveSequence<CompletableTrait, Never>`. The struct wraps an ordinary observable, and each trait's `create` and `subscribe` only expose the events its grammar allows. Every trait converts back to an `Observable` with `asObservable()`:

```swift
assert(record(answer.asObservable()) == ["42", "|"])
assert(record(Maybe<Int>.empty().asObservable()) == ["|"])
assert(record(Completable.empty().asObservable()) == ["|"])
assert(record(Completable.error(DemoError.boom).asObservable()) == ["x(boom)"])
```

## `Single`: one element or an error

`Single.create` is the trait version of `Observable.create`, and it is the idiomatic way to wrap a callback-based request. The observer is a function that takes a `Result`-like event, and only the first event counts:

```swift
func fetchUsername(id: Int, completion: @escaping (Result<String, DemoError>) -> Void) {
    completion(id > 0 ? .success("user\(id)") : .failure(.boom))
}

func username(id: Int) -> Single<String> {
    Single.create { single in
        fetchUsername(id: id) { result in
            switch result {
            case .success(let name): single(.success(name))
            case .failure(let error): single(.failure(error))
            }
            single(.success("too late"))                   // ignored: a Single has one outcome
        }
        return Disposables.create()
    }
}

assert(record(username(id: 7).asObservable()) == ["user7", "|"])
assert(record(username(id: 0).asObservable()) == ["x(boom)"])
```

The second call to `single` was ignored, so a buggy callback API that calls its completion twice cannot produce two results downstream. Like `Observable.create`, `Single.create` runs once per subscription, so a `Single` that wraps a request is cold, and [`ReplaySubject`](/rxswift-replaysubject/#sharereplayscope-replay-as-a-sharing-mechanism) shows how to share one.

## `Maybe`: an element, nothing, or an error

A `Maybe` adds one outcome to `Single`: completion without an element. It is the type for a lookup that can legitimately find nothing, such as reading a cached value:

```swift
let cache = ["ada": "Ada Lovelace"]

func cachedName(for key: String) -> Maybe<String> {
    Maybe.create { maybe in
        if let name = cache[key] {
            maybe(.success(name))
        } else {
            maybe(.completed)                               // not found is not an error
        }
        return Disposables.create()
    }
}

assert(record(cachedName(for: "ada").asObservable()) == ["Ada Lovelace", "|"])
assert(record(cachedName(for: "bob").asObservable()) == ["|"])
```

Modeling "not found" as an empty `Maybe` instead of a `Single` that fails keeps errors for things that went wrong. A caller can then fall back to the network for an empty result with `ifEmpty(switchTo:)`, without catching and inspecting errors:

```swift
let nameWithFallback = cachedName(for: "bob")
    .ifEmpty(switchTo: username(id: 2))
assert(record(nameWithFallback.asObservable()) == ["user2", "|"])
```

## `Completable`: done, or failed

A `Completable` has no elements at all. It is the type for work whose only result is that it happened: saving a file, sending an analytics event, deleting a record:

```swift
var savedDrafts: [String] = []
@MainActor func save(draft: String) -> Completable {
    Completable.create { completable in
        if draft.isEmpty {
            completable(.error(DemoError.boom))
        } else {
            savedDrafts.append(draft)
            completable(.completed)
        }
        return Disposables.create()
    }
}

assert(record(save(draft: "hello").asObservable()) == ["|"])
assert(record(save(draft: "").asObservable()) == ["x(boom)"])
assert(savedDrafts == ["hello"])
```

`andThen` sequences a `Completable` with whatever should happen after it, starting the second piece of work only if the first one completed:

```swift
let saveThenFetch: Single<String> = save(draft: "second").andThen(username(id: 3))
assert(record(saveThenFetch.asObservable()) == ["user3", "|"])

let failedSave: Single<String> = save(draft: "").andThen(username(id: 4))
assert(record(failedSave.asObservable()) == ["x(boom)"])   // the fetch never started
```

## Converting observables into traits

Turning an ordinary observable into a trait is a runtime check, because the observable's type cannot prove it follows the narrower grammar. Each conversion decides what to do with sequences that do not fit, and the decisions are worth knowing exactly:

```swift
assert(record(Observable.just(1).asSingle().asObservable()) == ["1", "|"])

let empty = record(Observable<Int>.empty().asSingle().asObservable())
let tooMany = record(Observable.of(1, 2).asSingle().asObservable())
print(empty, tooMany)
assert(empty.count == 1 && empty[0].hasPrefix("x("))         // RxError.noElements
assert(tooMany.count == 1 && tooMany[0].hasPrefix("x("))     // RxError.moreThanOneElement
```

The run printed `["x(Sequence doesn\'t contain any elements.)"]` and `["x(Sequence contains more than one element.)"]`. `asMaybe()` accepts the empty case as completion and fails only on a second element, and `asCompletable()` accepts any number of elements and discards them.

The conversion with consequences is `asSingle()` applied to an observable that emits once and never completes. To know there is no second element, `asSingle()` has to wait for completion, so a source that never completes never produces a success:

```swift
let currentUser = BehaviorSubject(value: "ada")          // state: emits now, never completes
let neverResolves = currentUser.asSingle()
assert(record(neverResolves.asObservable()) == [])       // waiting for a completion that never comes

assert(record(currentUser.take(1).asSingle().asObservable()) == ["ada", "|"])
assert(record(currentUser.first().asObservable()) == ["Optional(\"ada\")", "|"])
```

This is a common bug when code converts a subject or a relay into a `Single` to "get the current value": it compiles, it has the right type, and it hangs. `take(1).asSingle()` takes the first element and completes, which is what was meant. `first()` does the same but returns `Single<Element?>`, succeeding with `nil` for an empty source instead of failing.

| Conversion | No elements | One element | Two or more | Never completes |
| --- | --- | --- | --- | --- |
| `asSingle()` | `RxError.noElements` | success after completion | `RxError.moreThanOneElement` | never resolves |
| `take(1).asSingle()` | `RxError.noElements` | success | first element | first element |
| `first()` | success `nil` | success | first element | first element |
| `asMaybe()` | completed | success after completion | `RxError.moreThanOneElement` | never resolves |
| `asCompletable()` | completed | completed | completed | never resolves |

## Composing traits

Traits have their own versions of the common operators, and the results stay in the trait when the grammar allows it. `map` and `flatMap` on a `Single` produce a `Single`; `zip` waits for several `Single`s and succeeds with all their results:

```swift
let profile = Single.zip(username(id: 1), username(id: 2))
    .map { "\($0) and \($1)" }
assert(record(profile.asObservable()) == ["user1 and user2", "|"])

let chained = username(id: 5)
    .flatMap { name in username(id: name.count) }          // a dependent second request
assert(record(chained.asObservable()) == ["user5", "|"])

let recovered = username(id: 0).catchAndReturn("anonymous")
assert(record(recovered.asObservable()) == ["anonymous", "|"])
```

`Single.zip` fails as soon as any of its inputs fails and disposes the others, which for requests means the remaining requests are cancelled. When partial results are acceptable, convert each input's failure into a value first, with `catchAndReturn` or by mapping to a `Result`.

## Bridging to `async`/`await`

Since RxSwift 6.5, each trait has an asynchronous `value` property, and `Single.create` accepts an `async` closure. They make traits the natural seam between RxSwift code and Swift concurrency.

### From traits to `async`

`try await single.value` subscribes, suspends until the outcome, and returns the element or throws the error. `Maybe.value` returns an optional, and `Completable.value` returns nothing:

```swift
nonisolated func awaitTraits() async throws -> [String] {
    var results: [String] = []
    results.append(try await Single.just("one").value)
    results.append(try await Maybe<String>.empty().value ?? "nothing")
    try await Completable.empty().value
    results.append("completed")
    do {
        _ = try await Single<String>.error(DemoError.timeout).value
    } catch {
        results.append("threw \(error)")
    }
    return results
}

let traitResults = try Single.create { try await awaitTraits() }.toBlocking().single()
assert(traitResults == ["one", "nothing", "completed", "threw timeout"])
```

The test runs the `async` function through `Single.create`, which is the other direction of the bridge, and waits for it with RxBlocking. Cancellation crosses the bridge in both directions. Cancelling the task that awaits `value` disposes the subscription, so a request wrapped in `Single.create` is cancelled too:

```swift
final class Flag: Sendable {
    private let state = Atomic(false)
    func set() { state.store(true, ordering: .relaxed) }
    var isSet: Bool { state.load(ordering: .relaxed) }
}

nonisolated func cancellationReachesTheSingle() async -> (disposed: Bool, threw: String) {
    let disposed = Flag()
    let slowRequest = Single<Int>.create { _ in
        Disposables.create { disposed.set() }               // stands in for cancelling a request
    }
    let task = Task { try await slowRequest.value }
    try? await Task.sleep(for: .milliseconds(50))
    task.cancel()
    do {
        _ = try await task.value
        return (disposed.isSet, "no error")
    } catch {
        return (disposed.isSet, "\(type(of: error))")
    }
}

let taskCancelled = try Single.create { await cancellationReachesTheSingle() }.toBlocking().single()
assert(taskCancelled.disposed && taskCancelled.threw == "CancellationError")
```

### From `async` to traits

`Single.create(work:)` runs an `async` closure in a `Task` per subscription and cancels the task when the subscription is disposed:

```swift
nonisolated func disposalCancelsTheTask() -> Bool {
    let sawCancellation = Flag()
    let finished = DispatchSemaphore(value: 0)
    let work = Single<Int>.create {
        do {
            try await Task.sleep(for: .seconds(10))
        } catch {
            sawCancellation.set()                           // Task.sleep throws when cancelled
        }
        finished.signal()
        return 0
    }
    let subscription = work.subscribe()
    Thread.sleep(forTimeInterval: 0.05)
    subscription.dispose()                                  // cancels the task
    _ = finished.wait(timeout: .now() + 2)
    return sawCancellation.isSet
}

assert(disposalCancelsTheTask())
```

The closure is `@Sendable`, and RxSwift creates the task inside its own non-isolated code, so the work does not run on the actor of the code around it. Measured separately, a closure written in top-level code or in a method of a `@MainActor` class ran off the main thread, and only a closure marked `{ @MainActor in ... }` ran on it. The `detached:` parameter chooses between `Task` and `Task.detached`, which only decides whether a surrounding task's priority and task-local values are inherited.

### Observables to `for await`: nothing is dropped

For an ordinary observable, the `values` property returns an `AsyncThrowingStream`. RxSwift creates the stream with the default, unbounded buffering policy, so a slow consumer never loses an element; the elements wait in the stream's buffer instead:

```swift
nonisolated func slowConsumer() async throws -> Int {
    let events = PublishSubject<Int>()
    let producer = Task.detached {
        try await Task.sleep(for: .milliseconds(20))       // let the consumer start iterating
        for value in 1...10 { events.onNext(value) }       // a burst of ten
        events.onCompleted()
    }
    var received = 0
    for try await _ in events.values {
        received += 1
        try await Task.sleep(for: .milliseconds(10))       // a consumer slower than the burst
    }
    try await producer.value
    return received
}

let receivedBySlowConsumer = try Single.create { try await slowConsumer() }.toBlocking().single()
assert(receivedBySlowConsumer == 10)
```

All ten elements arrived. The same experiment with Combine's `values` on a `PassthroughSubject` received 1 of 10, because Combine's bridge requests one element at a time and the subject drops elements nobody has asked for, as [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/) measured. RxSwift has no demand, so its bridge buffers instead. The trade-off is memory: a producer that permanently outpaces its consumer grows the buffer without limit, at the rate $$\lambda - \mu$$ from [Observables and Observers](/rxswift-observables-observers/#no-backpressure).

## Traits and Combine

Combine has no trait types. A Combine publisher that emits one value is just a publisher, and `Future` is the closest thing to a `Single`, with the eager, shared behavior described in [`AsyncSubject`](/rxswift-asyncsubject/#combines-future-is-an-asyncsubject-with-a-producer). Combine's typed failures cover part of what traits do: `Failure == Never` says "cannot fail" in the type, which RxSwift says with `Infallible`, `Driver`, and `Signal`, but nothing in Combine's types says "exactly one value". In Swift concurrency, a plain `async throws -> Value` function says it best of all, which is why `Single` is the trait that bridges most naturally to `async`/`await`.

```swift
withExtendedLifetime(answerSubscription) {}
```

## Summary

- Traits narrow the observable grammar: `Single` is success or error, `Maybe` adds completion without an element, `Completable` is completion or error. All three are `PrimitiveSequence` with a marker type.
- `Single.create` and `Maybe.create` deliver only their first outcome, so a callback called twice produces one result.
- `asSingle()` fails with `RxError.noElements` or `RxError.moreThanOneElement`, and on a source that never completes it never resolves; `take(1).asSingle()` or `first()` is usually what was meant.
- `Single.zip`, `flatMap`, `andThen`, and `catchAndReturn` compose traits while keeping their types.
- `try await trait.value` bridges to `async`, and `Single.create { async work }` bridges back; cancellation crosses in both directions.
- `Observable.values` buffers without limit: a slow consumer received 10 of 10 elements, where Combine's `.values` received 1.

## Exercise

Write `func firstResponse<Element>(_ requests: [Single<Element>]) -> Single<Element>` that subscribes to all requests at once, succeeds with the first success, ignores failures while any request is still running, fails with the last error only if all requests fail, and disposes the remaining requests as soon as one succeeds. Test it with requests built from `Single.create` that count their disposals, and then write the same function with `async`/`await` and a task group, and compare how each version cancels the losers.

## Further reading

- [Traits](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/Traits.md) in the RxSwift documentation, covering `Single`, `Completable`, `Maybe`, and the RxCocoa traits.
- [Swift Concurrency](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/SwiftConcurrency.md) in the RxSwift documentation, on `value`, `values`, and `asObservable()`.
- The [`PrimitiveSequence+Concurrency.swift`](https://github.com/ReactiveX/RxSwift/blob/main/RxSwift/Traits/PrimitiveSequence/PrimitiveSequence%2BConcurrency.swift) source, where the cancellation bridging is implemented.
- [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/) for the Combine side.

Previous: [Relays: `PublishRelay` and `BehaviorRelay`](/rxswift-relays/). Next: [`Driver` and `Signal`](/rxswift-driver-signal/).

Return to the [RxSwift roadmap](/rxswift/).
