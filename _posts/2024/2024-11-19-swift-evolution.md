---
layout: post
hidden: true
title: "Swift Evolution: How the Language Changes"
date: "2024-11-19"
last_modified_at: "2024-11-19"
permalink: /swift-evolution/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Swift Evolution"
  - "Open Source"
thumbnail: "images/covers/swift_evolution_thumbnail.webp"
thumbnail_ready: true
---

Every Swift feature you use, from `async`/`await` to `if` expressions to macros, went through a public process before it shipped. That process is **Swift Evolution**. Anyone can read the proposals, follow the debates, try the implementations, and take part. Knowing how it works pays off in very practical ways: proposals are the most precise documentation a feature has, their "alternatives considered" sections answer most "why didn't they just…?" questions, and upcoming feature flags let you prepare your code for the next language mode years before it arrives. This article covers the process, its history, how to read a proposal, and how to use what's coming in your own projects.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_evolution_thumbnail.webp"
 alt_text="A language proposal progressing through discussion, review and implementation"
 caption="Swift Evolution: How the Language Changes"
 width="640"
 height="400"
%}

## Where it happens

- **The swift-evolution repository** on GitHub (`swiftlang/swift-evolution`) holds every proposal as a Markdown file, numbered `SE-0001`, `SE-0002`, and so on, with its current status.
- **The Swift Forums** (forums.swift.org) host the discussions: early ideas under *Evolution → Pitches*, formal reviews under *Evolution → Proposal Reviews*, and the decisions, with their rationale, as announcements.
- **swift.org/swift-evolution** offers a searchable dashboard of all proposals, filterable by status and by the Swift version that implemented them.

## The life of a proposal

1. **Pitch.** Someone posts an idea on the forums. The community discusses whether the problem is real and the direction is right. Most ideas are refined, merged with others, or dropped at this stage, and that's the stage working well.
2. **Proposal.** The idea is written up from the official template: motivation, proposed solution, detailed design, source compatibility, ABI compatibility, implications on adoption, and alternatives considered.
3. **Implementation.** A working implementation is required before review, usually as a pull request against the compiler or standard library, often behind an experimental flag and available in a toolchain snapshot. That rule keeps reviews grounded: people can try the feature on real code, instead of debating a hypothetical.
4. **Review.** The proposal is scheduled for a public review, typically around two weeks, run by a **review manager** from the group that owns the area. Anyone can post feedback. Reviewers are asked a few standard questions: Is the problem significant enough? Does the proposal fit the feel and direction of Swift? How does it compare with similar features in other languages? How much effort did you put into your review?
5. **Decision.** The owning group announces one of: **accepted**, **accepted with modifications**, **returned for revision** (often followed by a second review), or **rejected**, always with a written rationale.
6. **Release.** Accepted proposals ship in a future Swift version, and the status changes to "Implemented (Swift 5.9)", for example.

Big features are usually split into several proposals. Swift concurrency, for example, was more than a dozen: `async`/`await` (SE-0296), structured concurrency (SE-0304), actors (SE-0306), `Sendable` (SE-0302), `async let` (SE-0317), and more, each reviewed separately, with **vision documents** describing how the pieces fit together.

## A short history, told through proposals

Swift Evolution started when Swift went open source in **December 2015**, and its history explains a lot about the language's priorities.

- **Swift 3 (2016): the great break.** Early proposals made sweeping, source-breaking changes: removing `++` and `--` (SE-0004), C-style `for` loops (SE-0007), and currying syntax (SE-0002), and renaming much of the Objective-C API surface (SE-0005, the "Grand Renaming"). The result was a much better language, and a painful migration for everyone.
- **Swift 4 and later: source compatibility.** After Swift 3, source compatibility became a hard requirement. Breaking changes need an exceptionally strong reason and are grouped into **language modes** that each module adopts on its own schedule.
- **Swift 5 (2019): ABI stability**, and module stability in 5.1, letting apps use the system's Swift runtime instead of bundling their own; see [ABI Stability](/swift-abi-stability/).
- **Swift 5.5 to 5.10: concurrency**, a multi-year series of proposals, delivered incrementally with warnings before errors.
- **Swift 6 (2024): data-race safety** as a new language mode, the first major source-breaking change since Swift 3, and a fully opt-in one.

Some ideas don't make it, and those decisions are just as instructive. SE-0217 proposed a `!!` "unwrap or die" operator; it was rejected, with the rationale that `?? fatalError("…")` already expresses it in existing terms. Reading rejection rationales is one of the best ways to absorb what "Swifty" means to the people who design the language.

## Reading a proposal

A proposal is useful long after the decision:

- **Motivation** shows the problem, usually with the awkward code people had to write before. It's the best way to understand **when** to use a feature.
- **Detailed design** is the precise specification, more exact than most documentation: every rule, every edge case, and the grammar.
- **Source compatibility** and **ABI compatibility** tell you whether you can adopt the feature in a library without breaking clients, and whether it needs a newer OS.
- **Alternatives considered** explains rejected designs, which usually answers "why didn't they just…?"
- **Future directions** hints at what may come next.

Proposals worth reading alongside the features they describe, including the articles on this blog:

| Proposal | Feature | Read with |
|---|---|---|
| SE-0258 | Property wrappers | [Property Wrappers](/swift-property-wrappers/) |
| SE-0296, SE-0306 | `async`/`await`, actors | [Swift Concurrency](/swift-concurrency/) |
| SE-0335 | Existential `any` | [Opaque and Boxed Types](/swift-opaque-and-boxed-types/) |
| SE-0380 | `if` and `switch` expressions | [Control Flow](/swift-control-flow/) |
| SE-0382, SE-0389 | Expression and attached macros | [Macros in Swift](/swift-macros/) |
| SE-0386 | The `package` access level | [Swift Package Manager](/swift-package-manager/) |
| SE-0404 | Nested protocols | [Nested Types](/swift-nested-types/) |
| SE-0413 | Typed throws | [Error Handling](/swift-error-handling/) |
| SE-0414, SE-0430 | Region-based isolation, `sending` | [Swift Concurrency](/swift-concurrency/) |

## Language modes and source compatibility

A **language mode** is a set of source-breaking changes adopted together. A Swift 6 compiler supports Swift 4, 4.2, 5, and 6 modes, and you choose **per module**, so an app in Swift 6 mode can depend on a library still in Swift 5 mode, and vice versa:

```swift
// Package.swift
// .target(name: "LegacyKit", swiftSettings: [.swiftLanguageMode(.v5)])
//
// Xcode: Build Settings → Swift Language Version
// Command line: swiftc -swift-version 6
```

The **compiler version** and the **language mode** are different things, and conditional compilation can test both:

```swift
#if swift(>=6.0)
let languageModeNote = "Compiled in Swift 6 language mode or later"
#else
let languageModeNote = "Compiled in an older language mode"
#endif

#if compiler(>=6.0)
let compilerNote = "Built with a Swift 6 or newer compiler"
#else
let compilerNote = "Built with an older compiler"
#endif

print(languageModeNote)
print(compilerNote)
```

Built with a Swift 6 compiler in Swift 5 mode, this prints "older language mode" but "Swift 6 or newer compiler". Library authors use `#if compiler(>=…)` to adopt new syntax while still supporting older toolchains, because `#if swift` only reflects the mode.

## Upcoming features: the next mode, one change at a time

Every source-breaking change accepted for a future language mode gets an **upcoming feature flag**, so you can adopt it today, one change at a time, instead of all at once on migration day.

```swift
// Package.swift
// .target(
//     name: "App",
//     swiftSettings: [
//         .enableUpcomingFeature("ExistentialAny"),          // SE-0335
//         .enableUpcomingFeature("InternalImportsByDefault"), // SE-0409
//     ]
// )
//
// Xcode: Build Settings → "Upcoming Features", or Other Swift Flags:
//   -enable-upcoming-feature ExistentialAny
```

Code can check whether a feature is enabled with `#if hasFeature(…)`:

```swift
#if hasFeature(ConciseMagicFile)
let fileNote = "#file is short, like Module/File.swift"
#else
let fileNote = "#file is a full path"
#endif
print(fileNote)
```

Here's what some of these flags do. In Swift 5 mode, each is off unless you enable it; Swift 6 mode turns on most of them:

| Flag | Proposal | What changes | On in Swift 6 mode? |
|---|---|---|---|
| `ConciseMagicFile` | SE-0274 | `#file` becomes `Module/File.swift` instead of a full path (which leaked into binaries) | Yes |
| `BareSlashRegexLiterals` | SE-0354 | `/\d+/` is a regex literal | Yes |
| `StrictConcurrency` | SE-0337 | Complete data-race checking | Yes |
| `ExistentialAny` | SE-0335 | Using a protocol as a type must be spelled `any P` | No (still upcoming) |
| `InternalImportsByDefault` | SE-0409 | `import` is internal unless marked `public import` | No (still upcoming) |

For example, `let digits = /\d+/` fails to compile in Swift 5 mode ("'/' is not a prefix unary operator"), and compiles once `BareSlashRegexLiterals` is enabled. With `ExistentialAny` enabled, `let value: CustomStringConvertible = 42` is flagged: "use of protocol 'CustomStringConvertible' as a type must be written 'any CustomStringConvertible'".

A practical migration strategy for a new language mode:

1. Enable the upcoming features one at a time, starting with the ones that produce the fewest diagnostics.
2. Fix the code, commit, repeat.
3. Switch the module to the new mode, which is now a small step.
4. Do it module by module, leaf modules first.

**Experimental features** (`.enableExperimentalFeature("…")`) are different: they gate unfinished implementations that may change or disappear, and many only work with development toolchains. Don't ship code that depends on them.

## Who decides?

Swift is an open-source project with a published governance structure. The **Core Team** oversees the project as a whole and sets its strategy. Since 2022, specific areas belong to dedicated groups: a language steering group decides language and standard library proposals, and other workgroups and steering groups cover areas like the package ecosystem, platforms, documentation, and testing. Many members work at Apple, but reviews are public, decisions come with written rationales, and many accepted proposals are authored by community members.

## How to take part

- **Read and follow** proposals in areas you care about, and try them with a toolchain snapshot from swift.org or an Xcode beta.
- **Give feedback during reviews**, especially concrete experience: "I tried this on a 200,000-line codebase, and here's what happened" carries far more weight than opinions on syntax.
- **Pitch** when you have a well-understood problem. Start with the problem and real-world examples, not the syntax, and search the forums first: many ideas were discussed before, and the "Commonly Rejected Changes" document lists the ones that keep coming back.
- **Contribute code or documentation.** The Swift repositories label good first issues, and a proposal with an implementation moves much faster than one waiting for someone to build it.

## Interview questions

**What's the difference between a Swift compiler version and a language mode?**
The compiler version is the toolchain (for example, Swift 6.0); the language mode is the set of source rules a module is compiled with. A Swift 6 compiler can build modules in Swift 5 mode. `#if compiler` tests the first, `#if swift` the second.

**What are upcoming feature flags for?**
They let you adopt individual source-breaking changes planned for a future language mode ahead of time, making migration gradual.

**Why does Swift group breaking changes into language modes?**
After the costly migrations of the Swift 3 era, source compatibility became a priority. Language modes let each module opt in on its own schedule, and modules in different modes work together.

**Where would you look to understand why a Swift feature works the way it does?**
Its Swift Evolution proposal, especially the motivation, detailed design, and alternatives considered, plus the review thread and decision rationale on the forums.

## Summary

- Swift Evolution is the public process every language and standard library change goes through: pitch, proposal, implementation, review, decision.
- Proposals live on GitHub as numbered SE documents and are reviewed on the Swift Forums; read them as precise documentation.
- Since Swift 3, source compatibility is a priority: breaking changes are grouped into per-module language modes.
- Upcoming feature flags and `#if hasFeature` let you adopt the next mode one change at a time; `#if compiler` and `#if swift` test different things.
- Anyone can read, review, pitch, and contribute.
