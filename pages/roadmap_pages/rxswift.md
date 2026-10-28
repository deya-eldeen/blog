---
layout: page
title: "RxSwift"
subtitle: "The reactive library that powered a generation of iOS apps"
permalink: /rxswift/
hide: true
excluded: true
---

RxSwift is the Swift member of the ReactiveX family, the same reactive programming model available in many other languages, such as RxJava and RxJS. It treats events, user input, and network responses as **observable sequences** that you transform and combine with operators.

RxSwift came years before Apple's Combine, and it's still in many production apps. Even if you start new projects with Combine or Swift concurrency, knowing RxSwift will help you work with existing codebases, and the concepts transfer almost one to one.

Each article measures the behavior it describes and ends with an exercise. The examples use RxSwift 6.10.2 in Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26, so they also show where RxSwift, a library compiled without strict concurrency checking, meets Swift 6's actor isolation: which closures crash when a chain delivers on a background thread, and how to write chains that do not. Time-based behavior is measured on RxTest's virtual clock, set up in [the filtering article](/rxswift-filtering-operators/#a-clock-you-control); the RxCocoa and MVVM examples ran against real UIKit controls in the iOS simulator; and the testing article is a Swift package run with `swift test`.

{% include roadmap/legend.liquid %}

## 1. Observables

- [Observables and Observers](/rxswift-observables-observers/)
- [Creating Observables: `just`, `of`, `from`, and `create`](/rxswift-creating-observables/)
- [Subscribing](/rxswift-subscribing/)
- [Disposing and `DisposeBag`](/rxswift-disposebag/)
{: .roadmap-topics}

## 2. Subjects and Relays

- [`PublishSubject`](/rxswift-publishsubject/)
- [`BehaviorSubject`](/rxswift-behaviorsubject/)
- [`ReplaySubject`](/rxswift-replaysubject/)
- [`AsyncSubject`](/rxswift-asyncsubject/)
- [Relays: `PublishRelay` and `BehaviorRelay`](/rxswift-relays/)
{: .roadmap-topics}

## 3. Traits

- [`Single`, `Maybe`, and `Completable`](/rxswift-single-maybe-completable/)
- [`Driver` and `Signal` for the UI](/rxswift-driver-signal/)
{: .roadmap-topics}

## 4. Operators

- [Filtering: `filter`, `distinctUntilChanged`, `skip`, `take`](/rxswift-filtering-operators/)
- [Time: `debounce`, `throttle`, `delay`, `interval`, `timer`, `timeout`](/rxswift-time-operators/)
- [Transforming: `map`, `flatMap`, `flatMapLatest`, `concatMap`](/rxswift-transforming-operators/)
- [Combining: `combineLatest`, `zip`, `merge`, `concat`, `withLatestFrom`](/rxswift-combining-operators/)
{: .roadmap-topics}

## 5. Errors and Threading

- [Error Handling: `catch`, `catchAndReturn`, and `retry`](/rxswift-error-handling/)
- [Schedulers: `observe(on:)` and `subscribe(on:)`](/rxswift-schedulers/)
{: .roadmap-topics}

## 6. RxSwift in Apps

- [RxCocoa: Binding Observables to UIKit](/rxswift-rxcocoa-uikit/)
- [MVVM with RxSwift](/rxswift-mvvm/)
- [Writing Custom Reactive Extensions](/rxswift-custom-reactive-extensions/)
- [Testing with RxTest and RxBlocking](/rxswift-testing-rxtest-rxblocking/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-different-topics/" next_title="More Swift Topics" %}
