---
layout: page
title: "Combine"
subtitle: "Apple's framework for processing values over time"
permalink: /combine/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

Apps are full of things that happen *over time*: a user types into a search field, a network request finishes, a timer fires, a setting changes. Combine, introduced in iOS 13, gives you one consistent way to handle all of them. Values flow from **publishers** through a chain of **operators** to **subscribers**, and you describe that pipeline declaratively instead of juggling callbacks.

Since Swift 5.5, `async`/`await` and `AsyncSequence` cover many of the same jobs, and since iOS 17 the Observation framework handles most SwiftUI data flow. Combine is still fully supported, though, and you'll find it in a huge number of codebases, especially those built between 2019 and 2023.

{% include roadmap/legend.liquid %}

## 1. The Core Ideas

- Publishers, Subscribers, and Subscriptions
- `sink` and `assign`
- Subjects: `PassthroughSubject` and `CurrentValueSubject`
- `@Published` Properties
- `AnyCancellable` and Memory Management
{: .roadmap-topics}

## 2. Operators

- Transforming: `map`, `flatMap`, `scan`
- Filtering: `filter`, `removeDuplicates`, `compactMap`
- Combining: `combineLatest`, `zip`, `merge`
- Time: `debounce`, `throttle`, `delay`
- Sequence Operators: `first`, `last`, `collect`
{: .roadmap-topics}

## 3. Real-World Combine

- Networking with `URLSession` Publishers
- Timers
- Key-Value Observing (KVO) with Publishers
- Notifications as Publishers
{: .roadmap-topics}

## 4. Doing It Right

- Error Handling: `catch`, `retry`, and `replaceError`
- Schedulers: `receive(on:)` and `subscribe(on:)`
- Managing Resources: `share` and Multicasting
- Debugging Pipelines with `print` and `handleEvents`
- Testing Publishers
{: .roadmap-topics}

## 5. Combine Today

- Combine vs. `async`/`await` and `AsyncSequence`
- Bridging Publishers to `async`/`await` with `.values`
- Combine vs. the Observation Framework in SwiftUI
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/rxswift/" next_title="RxSwift" %}
