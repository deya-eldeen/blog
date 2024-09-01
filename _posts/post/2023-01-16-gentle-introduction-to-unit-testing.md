---
layout: post
title: "Gentle Introduction To Unit Testing."
date: "2023-01-16"
permalink: /gentle-introduction-to-unit-testing
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/unit_testing_intro.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

One Monday morning, a new developer, nicknamed Penguin 🐧, started their first job as a software engineer. A conversation between Penguin and their team leader, Rex 🦖, unfolded like this:

<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/unit_testing_intro_full.jpg"
 alt_text="" 
 caption=""
%}

**Penguin 🐧:** I've noticed that we have test cases written for almost all features in our mobile app. Why would we write unit tests if we have a QA team that does testing and quality assurance?

**Rex 🦖:** Writing unit tests doesn't just ensure that features behave correctly after being developed or shipped; it also ensures that when someone writes new code, it doesn't break any existing code. The QA team can't test everything all over again when a new feature is introduced. It's like an investment: you spend extra time writing unit tests while developing a feature, but you prevent potential bugs from happening in the future.

A CI/CD job running all tests will prevent any developer from merging code that breaks an existing feature, provided that the feature has well-written tests. Tests can also serve as good documentation for anyone intending to read your code.

**Penguin 🐧:** My first function checks if the application needs a force update by comparing two version strings, like 1.0.2 and 1.1.2. Should my test function iterate through all possible cases, from the minimum value 000.000.000 to the maximum 999.999.999?

**Rex 🦖:** No! The idea of test cases is to cover edge cases and unexpected scenarios, like negative numbers in this example, along with a few random usual cases. You might consider writing test functions like:

```swift
testWhenCurrentVersionIsLessThanRequiredVersionRequiresUpdate
testWhenRequiredVersionIsEqualToCurrentVersionRequiresNoUpdate
testMaximumMajorNumberComparesCorrectly
testMaximumMinorNumberComparesCorrectly
testMinimumPatchNumberComparesCorrectly
testMinimumMajorNumberComparesCorrectly
testMinimumMinorNumberComparesCorrectly
testMinimumPatchNumberComparesCorrectly
testMinimumNumbersComparesCorrectly
```

...plus some random normal cases.

Remember, the naming convention should show the developer's intention, even if the test function name becomes lengthy. Covering all cases will make tests take a long time, possibly minutes in your case. You must avoid that. Unit tests need to be fast, ideally running in 50ms or less.

### Unit Tests Criteria "F.I.R.S.T":

The F.I.R.S.T criteria for unit tests is a set of principles designed to promote effective testing practices. It stands for Fast (tests should run quickly), Independent (tests should be self-contained), Repeatable (tests should yield consistent results), Self-Validating (tests should automatically determine pass or fail), and Timely (tests should be written alongside production code). These principles help ensure robust unit tests that improve code quality and simplify maintenance.

- **Fast:** We can run dozens of them in a second, if not more.
- **Isolated:** Should not depend on each other or any external state.
- **Repeatable:** They should always give the same result when they are run, like a pure function.
- **Self-Verifying:** The test must unambiguously say whether it passed or failed, with no room for interpretation.
- **Timely:** They should be written before or alongside the production code that you are testing.

**Penguin 🐧:** But we must have high test coverage, like 100% coverage to cover all cases, right?

**Rex 🦖:** Test coverage refers to the percentage of code logic that is tested, not the "possible values coverage." By the way, test coverage is a flawed metric; it only means we have test functions that call our code. It doesn't guarantee that the test functions are good.

**Penguin 🐧:** Got it. Are there any other benefits to having unit tests?

**Rex 🦖:** Testing reduces maintenance costs and the number of bugs. There are also other costs to consider, like customer impact. The longer an issue goes undiscovered, the more expensive it is, which can result in negative reviews, lost trust, and, of course, lost revenue!

**Penguin 🐧:** Why follow TDD (Test Driven Development) methodology? Why write the tests before writing the feature itself?

**Rex 🦖:** There are many development methodologies, like TDD, ATDD, DDD, BDD... These are lengthy topics, and I encourage you to read about them. While TDD is a popular approach that includes the RGR (Red, Green, Refactor) lifecycle, it's important to note that it's not always the best choice for every situation. Consider the context of your project when choosing a methodology.

**Penguin 🐧:** That's cool! How can I make sure my code is testable, and what makes it not testable?

**Rex 🦖:** You may consider architectural patterns that make code more modular and easier to test, like MVVM, VIPER, VIP, or even Functional Reactive Programming (FRP). Dependency injection, coordinator patterns, and pure functions also help make your code more testable.

**Penguin 🐧:** So I always need to mock stuff when testing, right?

**Rex 🦖:** There are various types of test doubles out there, not just mocks. You’ve got fakes, stubs, spies, and dummies too! It might feel a bit overwhelming at first, but I encourage you to look into each one and learn when to use them effectively. Understanding their differences will really help you in your testing journey!

{%
 include centered-image.html 
 image_path="images/test_doubles.jpg"
 alt_text="" 
 caption="(test doubles) term is derived from (stunt doubles)"
%}

**Penguin 🐧:** What other tips do you have?

**Rex 🦖:** Here are a few:

- In network testing for mobile apps, no HTTP request should be made. You test the networking feature itself.
- Tests run alphabetically, so you shouldn't rename your tests to change their order of execution. Remember, tests should be independent; changing the order intentionally will break this criterion.
- Xcode provides performance tests that compare previous runs. You can also change the baseline, and it gives nicely formatted test coverage markers.
- Writing no tests is better than writing flaky tests!
