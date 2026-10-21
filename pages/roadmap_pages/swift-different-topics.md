---
layout: page
title: "More Swift Topics"
subtitle: "The tools and skills that turn a Swift coder into an iOS engineer"
permalink: /swift-different-topics/
hide: true
excluded: true
---

Some of the most valuable skills in iOS development don't fit neatly into a single category. Debugging a crash at 2 a.m., reading a memory graph, setting up a build pipeline, or figuring out why a tiny image eats 10 MB of RAM: none of it is "the Swift language", but all of it makes you a much better developer.

This guide collects those topics. Dip in wherever you're curious; there's no required order.

{% include roadmap/legend.liquid %}

## 1. Debugging and Diagnostics

- [LLDB Survival Guide](/lldb-survival-guide/)
- Breakpoints and Debugging in Xcode
- Logging: `print`, `Logger`, and `NSLog`
- Instruments and Performance Profiling
- [Zombies: Use-After-Free Bugs](/swift-zombies/)
{: .roadmap-topics}

## 2. Memory and Performance

- [Why a 0.3 MB Image Takes Around 10 MB of RAM](/why-my-0-3-mb-image-takes-14-mb-on-ram/)
- Avoiding Memory Leaks with Capture Lists
- Caching Strategies
- Persistence: Files, UserDefaults, SwiftData, and Core Data
{: .roadmap-topics}

## 3. Going Low-Level

- Core Foundation and Toll-Free Bridging
- Unsafe Pointers and Memory Layout
- Objective-C Basics for Swift Developers
- [GPS Hardware Basics](/gps-hardware-basics-for-software-engineers/)
{: .roadmap-topics}

## 4. Security

- [iOS and Android Security Basics](/ios-android-developer-security-basics/)
- Reverse Engineering iOS Apps
- Protecting Your App Against Tampering
{: .roadmap-topics}

Want to go further? My book, [*iOS Security Through Defensive Techniques*](/books/), covers app security in depth.

## 5. Tools and Workflow

- [Setting Up Your Mac for Development](/mac-setup/)
- The Terminal and Shell Scripting
- [Git: Why I Prefer the Command Line](/this-is-why-i-dont-use-git-gui-tools/)
- Regular Expressions and Swift Regex
- Continuous Integration and Delivery (CI/CD)
{: .roadmap-topics}

## 6. Building and Shipping

- Build Configurations and Schemes
- Static vs. Dynamic Frameworks
- Swift Package Manager
- CocoaPods
- [Interface Builder Tricks: Tiling Images Without Code](/easily-tiling-images-in-interface-builder-without-code/)
{: .roadmap-topics}

For new projects, prefer Swift Package Manager. CocoaPods is in maintenance mode, though you'll still meet it in many existing apps.

## 7. Writing Better Code

- State Machines
- Refactoring Techniques
- [Testing with Test Doubles](/test-doubles-in-swift/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-road-map/" next_title="Back to the Roadmaps" %}
