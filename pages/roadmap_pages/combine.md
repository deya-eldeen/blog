---
layout: page
title: "Combine"
subtitle: "Apple's framework for processing values over time"
permalink: /combine/
hide: true
excluded: true
---

Apps are full of things that happen *over time*: a user types into a search field, a network request finishes, a timer fires, a setting changes. Combine, introduced in iOS 13, gives you one consistent way to handle all of them. Values flow from **publishers** through a chain of **operators** to **subscribers**, and you describe that pipeline declaratively instead of juggling callbacks.

Since Swift 5.5, `async`/`await` and `AsyncSequence` cover many of the same jobs, and since iOS 17 the Observation framework handles most SwiftUI data flow. Combine is still fully supported, though, and you'll find it in a huge number of codebases, especially those built between 2019 and 2023.

Each article measures the behavior it describes and ends with an exercise. The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26, so they also show where Combine, a framework compiled without strict concurrency checking, meets Swift 6's actor isolation: which closures crash when a publisher delivers on a background thread, and how to write pipelines that do not. Time-based behavior is pinned down with a virtual-time scheduler defined in [the time operators article](/combine-debounce-throttle-delay/#a-scheduler-whose-clock-you-control), the networking examples run against the loopback server from the [networking roadmap](/swift-networking/), the testing article is a Swift package run with `swift test`, and the SwiftUI comparisons count `body` evaluations in hosted views.

{% include roadmap/legend.liquid %}

## 1. The Core Ideas

- [Publishers, Subscribers, and Subscriptions](/combine-publishers-subscribers-subscriptions/)
- [`sink` and `assign`](/combine-sink-assign/)
- [Subjects: `PassthroughSubject` and `CurrentValueSubject`](/combine-subjects/)
- [`@Published` Properties](/combine-published-properties/)
- [`AnyCancellable` and Memory Management](/combine-anycancellable-memory/)
{: .roadmap-topics}

## 2. Operators

- [Transforming: `map`, `flatMap`, `scan`](/combine-map-flatmap-scan/)
- [Filtering: `filter`, `removeDuplicates`, `compactMap`](/combine-filter-removeduplicates-compactmap/)
- [Combining: `combineLatest`, `zip`, `merge`](/combine-combinelatest-zip-merge/)
- [Time: `debounce`, `throttle`, `delay`](/combine-debounce-throttle-delay/)
- [Sequence Operators: `first`, `last`, `collect`](/combine-first-last-collect/)
{: .roadmap-topics}

## 3. Real-World Combine

- [Networking with `URLSession` Publishers](/combine-urlsession-publishers/)
- [Timers](/combine-timers/)
- [Key-Value Observing (KVO) with Publishers](/combine-kvo-publishers/)
- [Notifications as Publishers](/combine-notification-publishers/)
{: .roadmap-topics}

## 4. Doing It Right

- [Error Handling: `catch`, `retry`, and `replaceError`](/combine-error-handling-catch-retry/)
- [Schedulers: `receive(on:)` and `subscribe(on:)`](/combine-schedulers-receive-subscribe-on/)
- [Managing Resources: `share` and Multicasting](/combine-share-multicasting/)
- [Debugging Pipelines with `print` and `handleEvents`](/combine-debugging-print-handleevents/)
- [Testing Publishers](/combine-testing-publishers/)
{: .roadmap-topics}

## 5. Combine Today

- [Combine vs. `async`/`await` and `AsyncSequence`](/combine-vs-async-await/)
- [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/)
- [Combine vs. the Observation Framework in SwiftUI](/combine-vs-observation-swiftui/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/rxswift/" next_title="RxSwift" %}
