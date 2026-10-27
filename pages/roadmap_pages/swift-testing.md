---
layout: page
title: "Testing in Swift and iOS"
subtitle: "Eight guides to tests that catch meaningful failures and remain trustworthy"
permalink: /swift-testing/
hide: true
excluded: true
---

Good tests make a concrete claim, control the inputs relevant to that claim, and fail clearly when the behavior is wrong. This guide follows a path from your first unit test to asynchronous work, real adapter boundaries, UI journeys, and useful CI feedback.

The section contains eight articles. Start with the introduction, use FIRST to review test quality, then choose the boundary your next test needs to prove. Unit, integration, and UI tests provide different evidence; none replaces all the others.

Examples identify their Swift and framework requirements. Most use XCTest with a Swift 5.7 baseline. The coverage and CI article introduces Swift Testing from the Swift 6 toolchain after its September 2024 release. Within each article, read the Swift blocks in order unless a block explicitly names a separate app or test target.

{% include roadmap/legend.liquid %}

## 1. Foundations

- [Gentle Introduction to Unit Testing](/gentle-introduction-to-unit-testing/)
- [FIRST Principles: Fast, Independent, Repeatable, Self-Validating, and Timely](/swift-first-testing-principles/)
- [Test Doubles in Swift: Dummies, Fakes, Stubs, Spies, and Mocks](/test-doubles-in-swift/)
{: .roadmap-topics}

## 2. Time and Concurrency

- [Testing Asynchronous Swift Code](/swift-testing-asynchronous-code/)
- [Avoiding Flaky Tests](/swift-avoiding-flaky-tests/)
{: .roadmap-topics}

## 3. Real Boundaries and User Journeys

- [Integration Testing: Networking and Storage](/swift-integration-testing/)
- [Reliable UI Testing](/swift-ui-testing/)
{: .roadmap-topics}

## 4. Keeping the Suite Useful

- [Coverage, Test Plans, and Continuous Integration](/swift-test-coverage-and-ci/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-concurrency-roadmap/" next_title="Swift Concurrency" %}
