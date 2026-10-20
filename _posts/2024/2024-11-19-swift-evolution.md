---
layout: post
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
  - "Open Source"
  - "Community"
---

Every Swift feature you use, from `async`/`await` to `if` expressions to macros, went through a public process before it shipped. That process is **Swift Evolution**. Anyone can read the proposals, follow the discussions, and take part. Knowing how it works helps you understand *why* Swift is designed the way it is, and what's coming next.

<!--more-->

## Where it happens

- **The swift-evolution repository** on GitHub (`swiftlang/swift-evolution`) holds every proposal, numbered `SE-0001`, `SE-0002`, and so on.
- **The Swift Forums** (forums.swift.org) host the discussions: early ideas in *Pitches*, formal reviews in *Proposal Reviews*.
- **swift.org/swift-evolution** offers a searchable dashboard of all proposals and their status.

## The life of a proposal

1. **Pitch.** Someone posts an idea on the forums. The community discusses whether the problem is real and the direction is right. Most ideas are refined, merged with others, or dropped here.
2. **Proposal.** The idea is written up from the official template: motivation, proposed solution, detailed design, source and ABI compatibility, and alternatives considered.
3. **Implementation.** A working implementation in the compiler or standard library is required before review, often available behind an experimental flag or in a toolchain snapshot.
4. **Review.** The proposal is scheduled for a public review, usually about two weeks, managed by a **review manager** from the relevant workgroup. Anyone can post feedback.
5. **Decision.** The Language Steering Group (or another workgroup, depending on the area) decides: **accepted**, **accepted with modifications**, **returned for revision**, or **rejected**.
6. **Release.** Accepted proposals ship in a future Swift version. The proposal status shows which one, for example "Implemented (Swift 5.9)".

## Reading a proposal

A proposal's sections are useful well beyond the decision:

- **Motivation** explains the problem, often with the code people had to write before.
- **Detailed design** is the precise specification, more exact than most documentation.
- **Source compatibility** says whether existing code keeps compiling.
- **Alternatives considered** explains rejected designs, which is often the best answer to "why didn't they just…?"

For example, `SE-0296 async/await`, `SE-0306 Actors`, `SE-0335 Introduce existential any`, `SE-0380 if and switch expressions`, and `SE-0382 Expression Macros` are worth reading alongside the features themselves.

## Trying features early

Many features can be tried before they're final:

- **Upcoming feature flags** enable source-breaking changes ahead of a new language mode, one at a time:

```swift
// In Package.swift:
// .target(
//     name: "App",
//     swiftSettings: [
//         .enableUpcomingFeature("ExistentialAny"),
//     ]
// )
```

- **Experimental features** (`.enableExperimentalFeature("…")`) gate work-in-progress implementations. Don't ship code that depends on them.
- **Toolchain snapshots** from swift.org include the latest compiler from `main`.

## Language modes and source compatibility

Swift takes source compatibility seriously. Most changes are additive, and existing code keeps compiling. Source-breaking changes are grouped into **language modes**: Swift 6 mode, for example, turns on full data-race safety checking. A newer compiler still supports older modes, so each module can migrate when it's ready, even within the same project.

```swift
// swiftSettings: [.swiftLanguageMode(.v5)]   // keep a target on Swift 5 mode for now
```

You can check the compiler and language mode in code:

```swift
#if swift(>=6.0)
let languageModeNote = "Compiled in Swift 6 language mode or later"
#else
let languageModeNote = "Compiled in an older language mode"
#endif

#if compiler(>=6.0)
let compilerNote = "Built with a Swift 6 or newer compiler"
#endif
```

## Who decides?

Swift is an open-source project with a published governance structure. The **Core Team** oversees the project as a whole, and **steering groups and workgroups** own specific areas: the Language Steering Group for the language and standard library, plus groups for areas like the ecosystem, platforms, and documentation. Many members work at Apple, but the process is public, and proposals regularly come from the community.

## How to take part

- **Read and follow** proposals in areas you care about, and try them on real code.
- **Give feedback during reviews**, especially concrete experience: "I tried this in my codebase, and here's what happened" is the most valuable kind.
- **Pitch** when you have a well-understood problem; start with the problem, not the syntax.
- **Contribute** to the compiler, standard library, or documentation. The Swift repositories label good first issues.

## Summary

- Swift Evolution is the public process every language change goes through: pitch, proposal, implementation, review, decision.
- Proposals live on GitHub as numbered SE documents and are discussed on the Swift Forums.
- Upcoming feature flags and toolchain snapshots let you try changes early; language modes group source-breaking changes.
- Anyone can read, review, and contribute.
