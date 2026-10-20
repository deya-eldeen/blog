---
layout: page
title: "RxSwift"
subtitle: "The reactive library that powered a generation of iOS apps"
permalink: /rxswift/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

RxSwift is the Swift member of the ReactiveX family, the same reactive programming model available in many other languages, such as RxJava and RxJS. It treats events, user input, and network responses as **observable sequences** that you transform and combine with operators.

RxSwift came years before Apple's Combine, and it's still in many production apps. Even if you start new projects with Combine or Swift concurrency, knowing RxSwift will help you work with existing codebases, and the concepts transfer almost one to one.

{% include roadmap/legend.liquid %}

## 1. Observables

- Observables and Observers
- Creating Observables: `just`, `of`, `from`, and `create`
- Subscribing
- Disposing and `DisposeBag`
{: .roadmap-topics}

## 2. Subjects and Relays

- `PublishSubject`
- `BehaviorSubject`
- `ReplaySubject`
- `AsyncSubject`
- Relays: `PublishRelay` and `BehaviorRelay`
{: .roadmap-topics}

## 3. Traits

- `Single`, `Maybe`, and `Completable`
- `Driver` and `Signal` for the UI
{: .roadmap-topics}

## 4. Operators

- Filtering: `filter`, `distinctUntilChanged`, `skip`, `take`
- Time: `debounce`, `throttle`, `delay`, `interval`, `timer`, `timeout`
- Transforming: `map`, `flatMap`, `flatMapLatest`, `concatMap`
- Combining: `combineLatest`, `zip`, `merge`, `concat`, `withLatestFrom`
{: .roadmap-topics}

## 5. Errors and Threading

- Error Handling: `catch`, `catchAndReturn`, and `retry`
- Schedulers: `observe(on:)` and `subscribe(on:)`
{: .roadmap-topics}

## 6. RxSwift in Apps

- RxCocoa: Binding Observables to UIKit
- MVVM with RxSwift
- Writing Custom Reactive Extensions
- Testing with RxTest and RxBlocking
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-different-topics/" next_title="More Swift Topics" %}
