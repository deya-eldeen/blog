---
layout: post
hidden: true
title: "Common Object-Oriented Anti-Patterns in Swift"
date: "2024-03-07"
last_modified_at: "2024-03-07"
permalink: /swift-oop-anti-patterns/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Anti-Patterns", "Refactoring"]
thumbnail: assets/img/article-placeholder.svg
---
An object-oriented design becomes difficult to change when responsibilities and ownership stop matching the feature's behavior. The symptoms often appear before the class becomes enormous: tests need global setup, overrides disable inherited methods, or a simple request passes through several managers.

Here are concrete patterns to recognize and small ways to improve them.

<!--more-->

## The object that owns every decision

A `ProfileManager` that loads data, parses responses, caches images, formats names, and controls navigation has several unrelated reasons to change. Its name offers little guidance about what belongs there next.

Extract one responsibility at a time. Formatting a display name is an easy boundary because it can often be a pure function or a small value type. Networking and cache ownership may need separate collaborators. Keep the workflow readable rather than distributing each line into its own class.

[Single Responsibility](/swift-solid-principles/) provides a useful review question: which independent policy changes force edits here?

## Global mutable configuration

A singleton that supplies the active account, time, locale, and network client makes every caller's dependencies implicit. Tests can pass alone and fail in a suite because one test leaves a setting behind.

An immutable constant is not the same problem as shared mutable state. For varying configuration, pass the relevant value into the feature. For side effects, inject the collaborator that performs them.

```swift
struct GreetingPolicy {
    let prefix: String

    func message(for name: String) -> String {
        prefix + ", " + name
    }
}

final class WelcomeFeature {
    private let policy: GreetingPolicy

    init(policy: GreetingPolicy) {
        self.policy = policy
    }

    func title(for name: String) -> String {
        policy.message(for: name)
    }
}

let formal = WelcomeFeature(policy: GreetingPolicy(prefix: "Welcome"))
let casual = WelcomeFeature(policy: GreetingPolicy(prefix: "Hi"))
assert(formal.title(for: "Maya") == "Welcome, Maya")
assert(casual.title(for: "Maya") == "Hi, Maya")
```

Each feature has explicit configuration. No test must reset a process-wide prefix, and the two behaviors can coexist.

## Subclasses that reject their inheritance

A subclass that inherits `save` but implements it as `fatalError("Unsupported")` is a warning. If callers using the parent are allowed to save, the child is not a behavioral replacement.

Split reading and writing capabilities, use composition, or reconsider the hierarchy. Merely documenting “never call this inherited method” moves a design inconsistency onto every caller.

Not every crash is wrong: a precondition can enforce a documented programmer requirement. The problem is adding a stronger restriction that the parent's contract did not permit.

## Property bags with no protected rules

A model with publicly mutable fields can be appropriate as a simple transfer value. It is riskier when a dozen consumers must independently remember that `end` cannot precede `start`, or that a confirmed booking must have a seat.

Place transitions behind methods that preserve those rules, or use a value representation whose construction validates them. See [Encapsulation](/swift-encapsulation/) for an example. Swift's [access control](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/) helps express the boundary; it does not choose the invariant for you.

## Abstractions with no consumer need

A protocol for every concrete class can make navigation and maintenance harder without creating meaningful substitution. Likewise, several wrappers that only forward calls may obscure the actual side effect.

Introduce a boundary when it isolates a source of change, makes an important failure controllable, or expresses a useful shared capability. A concrete pure type is often already easy to test directly.

## Refactor from an observed symptom

Choose one difficult change or unreliable test. Identify the hidden dependency, invalid transition, or excessive responsibility that caused it, then improve that boundary. Keep behavior stable and verify the use case that exposed the problem.

A smaller model with explicit ownership is a better goal than maximizing the number of patterns present in the codebase.

## Diagnose a symptom before naming a pattern

A pattern name is useful only if it points to a concrete problem. “God object” should mean that unrelated changes and tests converge on one object, not merely that a file is long. “Overengineering” should mean that indirection adds cost without isolating a useful decision, not merely that protocols exist.

| Observed symptom | Likely design pressure | Focused first change |
|---|---|---|
| Tests pass alone but fail together | Shared mutable state | Make one varying input explicit |
| A subclass disables inherited methods | Broken substitutability | Split capabilities or remove inheritance |
| Every screen repeats validation | Leaking invariant | Put one transition beside its state |
| A tiny feature needs a huge fake | Oversized consumer contract | Narrow the dependency at that use site |
| Objects survive screen dismissal | Unclear ownership | Trace strong edges and task lifetimes |
| A model has contradictory flags | Poor state representation | Enumerate meaningful states |

Use the table to select an investigation, not as an automatic rewrite rule. One symptom can have several causes, and the smallest useful fix depends on the actual behavior.

## Replace contradictory flags with an explicit state

A screen with `isLoading`, `hasError`, `hasContent`, and `isEmpty` can represent combinations that make no sense. Every rendering branch must then decide which flag wins.

```swift
struct ProfileSummary: Equatable {
    let name: String
}

enum ProfileScreenState: Equatable {
    case idle
    case loading
    case loaded(ProfileSummary)
    case failed(message: String)
}

func profileHeading(for state: ProfileScreenState) -> String {
    switch state {
    case .idle:
        return "Profile"
    case .loading:
        return "Loading profile"
    case let .loaded(profile):
        return profile.name
    case let .failed(message):
        return "Could not load: " + message
    }
}

assert(profileHeading(for: .loaded(ProfileSummary(name: "Maya"))) == "Maya")
assert(profileHeading(for: .failed(message: "Offline")) == "Could not load: Offline")
```

The representation prevents “loading and failed” from occurring simultaneously unless you deliberately model that product behavior. If the UI must show old content while refreshing, add a state or state structure that explicitly carries both the content and refresh status. Do not force legitimate behavior into an oversimplified four-case enum.

This change is about making allowed combinations intentional. It does not solve stale asynchronous responses or decide who starts requests; those are separate workflow responsibilities.

## Constructors with hidden work make lifetimes surprising

An initializer that starts a request, registers observers, and navigates elsewhere creates observable behavior before the caller has finished connecting the feature. Tests may need to intercept effects during construction, and failures may arrive before a delegate is assigned.

Prefer construction that establishes valid state and an explicit activation operation when external work needs a lifecycle boundary. Document whether activation is idempotent and how stopping affects pending callbacks. For a simple value or fully local object, extra `start` and `stop` methods may be unnecessary ceremony.

See [Initializers and Deinitializers](/swift-initializers-and-deinitializers/) for the difference between application completion and memory cleanup. Saving only from `deinit` does not provide a reliable user-visible completion contract.

## Temporal coupling hides in apparently simple APIs

An API requiring `configure`, then `authenticate`, then `load`, then `attachDelegate` has a state machine whether it represents one or not. If the methods can be called in any order syntactically, callers must memorize a hidden protocol.

Some ordering is unavoidable. Make required collaborators constructor arguments where possible, represent meaningful states, and report invalid operations deliberately. A fluent builder can help assemble configuration, but it should produce an object that is valid when returned rather than another partially configured object.

When refactoring, write down valid sequences first. Moving methods into separate classes without preserving that sequence can distribute the same temporal coupling across a larger object graph.

## Service locators can hide a large dependency surface

A feature that accepts a container but resolves twelve unrelated services internally looks easy to construct while retaining twelve real dependencies. A reader cannot see those requirements in the initializer, and tests must know which runtime lookups will occur.

Pass the consumer's actual collaborators directly, or use a coherent feature-facing facade if several operations genuinely form one capability. Do not create a facade solely to conceal an arbitrary collection of unrelated services. Its contract should have a purpose understandable without opening the container registration code.

This distinction separates convenient assembly from hidden dependency discovery. A container can be useful at the composition root while remaining absent from feature logic.

## Refactor with a small behavioral safety net

Choose one use case whose current behavior is understood. Record the important inputs, outputs, failures, and effects. Then extract one boundary and verify the same observations through the public API.

Avoid asserting every private call order unless that order is itself a contract, such as writing a file before reporting completion. Tests coupled to incidental helper calls can make a safe restructuring look like a regression and encourage keeping a poor design merely to preserve mocks.

For state transitions, check rejected operations leave state unchanged. For ownership, observe that expected objects are released. For dependency changes, verify the feature can run with a small controlled collaborator rather than global setup.

## Exercise: improve one overloaded manager

Take a manager responsible for loading a profile, formatting its greeting, saving preferences, and choosing navigation. Pick the most troublesome behavior, such as greeting formatting that requires a live account service in tests.

Extract only the data and calculation required for that behavior. Keep the manager coordinating the remaining workflow until another observed problem justifies a further boundary. After the change, explain which tests got simpler and which future change became more local.

That evidence is stronger than a claim that the code now contains more design patterns. The goal is a system whose rules, effects, and ownership can be understood with less guesswork.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
