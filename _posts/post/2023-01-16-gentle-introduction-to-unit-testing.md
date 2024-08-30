---
layout: post
title: "Gentle Introduction To Unit Testing."
date: "2023-01-16"
permalink: /gentle-introduction-to-unit-testing
excerpt_separator: <!--more-->
thumbnail: "images/covers/unit_testing_intro.jpg"

---

One Monday morning, some new developer (Penguin 🐧) started their first new job as a software engineer, the chat between two developers **(Penguin 🐧)** and their team leader **(Rex 🦖)** went like this.  
<!--more-->
![](images/covers/unit_testing_intro_full.jpg)

_**(Penguin 🐧)**:_ I have noticed that we have test cases written for almost all features in our mobile app, why would we write unit tests if we have QA team that does the testing and quality assurance?  
  
_**(Rex 🦖)**:_ Yes, writing unit tests does not only guarantee that features behave correctly just after being developed / shipped, it also guarantees that when someone write any relevant code of new feature, it does not break any existing or any piece of code.  

the QA team can never test everything all over again when some new feature is introduced, it's like an investment, you spend extra time writing unit tests during developing a feature, but prevent any potential bugs from happening in the future.  
  
A CI/CD job running all tests will prevent any developer from merging a code that breaks an existing feature (in case that feature has well written tests), there are other benefits, like tests can be a good documentation too for anyone intending to read your code.  
  
_**(Penguin 🐧)**:_ my first function I wrote is about (application force update) checking, it compares a string that resembles an application version like **1.0.2**, and compares it with another version like **1.1.2** to check if the app needs force update or not.  
  
so my responsibility would be checking against all the values of minimum value 000.000.000 up to 999.999.999 value, for both target and current versions, so my test function should iterate through all possible cases, right?  
  
**(**_**Rex 🦖)**:_ No!!, the idea of test cases, is that covers edge cases, and maybe un-expected cases like minus numbers in this example, and maybe few random usual cases, maybe have these test functions...  
  
**_`testWhenCurrentVersionIsLessThanRequiredVersionRequiresUpdate   testWhenRequiredVersionIsEqualToCurrentVersionRequiresNoUpdate   testMaximumMajorNumberComparesCorrectly   testMaximumMinorNumberComparesCorrectly   testMinimumPatchNumberComparesCorrectly   testMinimumMajorNumberComparesCorrectly   testMinimumMinorNumberComparesCorrectly   testMinimumPatchNumberComparesCorrectly   testMinimumNumbersComparesCorrectly`_**  
.... + some random normal cases...  
  
keep in mind, the naming convention should show the intention of the developer, even if the test function name becomes lengthy.  
  
covering all the cases, will cause tests to take long time, maybe few minutes in your case, you must totally avoid that, remember the unit tests criteria? the way you do it will break the first criteria **"Fast"**, the normal time for tests is something like 50ms or something.  
  
_Unit Tests Criteria “F.I.R.S.T”:_  
`**Fast**: we can run dozens of them in a second, if not more   **Isolated**: should not depend on each other, or any external state.   **Repeatable**: they should always give the same result when they are run, like a pure function.   **Self-Verifying**: the test must unambiguously say whether it passed or failed, with no room for interpretation.   **Timely**: they should be written before or alongside the production code that you are testing.`

  
_**(Penguin 🐧)**:_ But we must have high test coverage, like 100% coverage to cover all cases, don't we?  
  
**_(Rex 🦖)_**: Test coverage means coverage on the code logic itself, like the percentage of lines tested, not on the "possible values coverage", and by the way, test coverage is a flawed metric, it only means we have test functions that call our code, it does not mean that the test functions are good.  
  
_**(Penguin 🐧)**:_ Good, yeah, any other benefits for having unit tests?  
  
_**(Rex 🦖)**:_ Testing reduces **maintenance costs** and therefore **quantity of bugs**, there are also other costs to consider like customer impact, the longer an issue goes undiscovered, the more expensive it is, which can result in negative reviews & lost trust, and of course lost money!  
  
_**(Penguin 🐧)**:_ But why follow TDD (Test Driven Development) methodology? why write the tests before writing the feature itself?  
  
_**(Rex 🦖)**:_ There are a lot of other development methodologies, like TDD, ATDD, DDD, BDD, .. these are lengthy topic, I encourage you to read about them quickly, and the RGR lifecycle of TDD.  
  
_**(Penguin 🐧)**:_ That's really cool, how can I make sure my code is testable? and what makes it not?  
  
_**(Rex 🦖)**:_ You may consider architectural patterns, that make code more separated and easily tested, like MVVM, VIPER, VIP, ..., FRP may make your code easier to test, using dependency injection, and coordinator pattern, using pure functions, etc...  
  
_**(Penguin 🐧)**:_ So I always need to mock stuff when testing, right?  
  
_**(Rex 🦖)**:_ No, **Mocks** are type of test doubles, there are also **Fakes**, **Stubs**, **Spies**, **Dummies**, look them up, and know when to use each, they are so confusing at first.

<figure>

![](images/test_doubles.jpg)

<figcaption>

When we say test doubles, the name is derived from stunt doubles

</figcaption>

</figure>

```
(Penguin 🐧): what other tips do you have?

(Rex 🦖): yes, there are a few on top of my head

- In network testing for mobile in general, no HTTP request should be made, you test the networking feature it self.

- tests run alphabetically, you should not rename your tests to change their order of running, remember that tests should be independent, changing the order intentionally will break this criteria.

- Xcode provides performance tests, that compares between previous runs, where you can also change the baseline, it also gives nicely formatted test coverage markers.

- Writing no tests is better than writing flaky tests!


```
