---
layout: page
show_hero: true
hero_image: /assets/img/hero/deya-roadmap.webp
hero_image_alt: "A clay-style developer holding an unfolded paper map and looking down at its marked route"
title: Roadmaps
hide_title: true
permalink: /ios-road-map/
position: 0
tags:
  - "Roadmap"
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

## Find Your Way Around Swift and iOS 🗺️

Learning iOS development can feel like being dropped into a huge city without a map. There's a new framework around every corner, three ways to do everything, and a fresh WWDC every June.

These roadmaps are that map. They break the journey into stages, put the topics in a sensible order, and link each one to a guide or article on this blog, so you always know what to learn next and *why* it matters.

## How to Use These Roadmaps 🧭

If you're new, follow the stages in order, since each builds on the one before it. If you're comfortable with the basics, jump to a topic that challenges you. Build a small project at each stage to put what you learn into practice, and focus on knowing where to look rather than memorizing everything. Topics marked **Coming soon** don't have a guide yet, but they're included so you know what to explore next.

## The Swift Roadmap 🐦

Swift is the foundation everything else stands on. A solid grasp of the language makes every framework easier, and the questions you get in interviews are mostly about this part.

### Stage 1: Speak the Language

<div class="roadmap-grid">
{% include roadmap/card.liquid art="language" title="Swift Language" url="/swift-language/" text="Types, optionals, collections, functions, closures, and memory management: the vocabulary you'll use every day." %}
{% include roadmap/card.liquid art="oop" title="Object-Oriented Programming" url="/swift-object-oriented-programming/" text="Classes, objects, inheritance, polymorphism, and the core principles of OOP." %}
{% include roadmap/card.liquid art="pop" title="Protocol-Oriented Programming" url="/swift-protocol-oriented-programming/" text="Protocols, extensions, and generics: the Swift way to share behavior." %}
{% include roadmap/card.liquid art="functional" title="Functional Programming" url="/swift-functional-programming/" text="Thinking functionally: map, filter, reduce, immutability, and purely functional data structures." %}
</div>

### Stage 2: Write Better Code

<div class="roadmap-grid">
{% include roadmap/card.liquid art="algorithms" title="Data Structures & Algorithms" url="/swift-data-structures-and-algorithms/" text="Elementary data structures, sorting, trees, graphs, and Big O notation for reasoning about performance." %}
{% include roadmap/card.liquid art="patterns" title="Design Patterns" url="/swift-design-patterns/" text="Creational, structural, and behavioral patterns: proven solutions to problems you'll meet again and again." %}
{% include roadmap/card.liquid art="architecture" title="Architectures" url="/swift-architectures/" text="MVC, MVP, MVVM, VIPER, Redux, and more: how to organize an app so it stays easy to change." %}
{% include roadmap/card.liquid art="testing" title="Testing" url="/swift-testing/" text="Eight guides covering unit testing, FIRST principles, test doubles, async code, flaky tests, integration, UI testing, and CI." %}
</div>

### Stage 3: Work With Time and Data

<div class="roadmap-grid">
{% include roadmap/card.liquid art="concurrency" title="Concurrency" text="async/await, tasks, actors, and keeping your app responsive and free of data races." %}
{% include roadmap/card.liquid art="networking" title="Networking" text="Calling APIs with URLSession, decoding JSON with Codable, and handling errors gracefully." %}
{% include roadmap/card.liquid art="combine" title="Combine" url="/combine/" text="Apple's framework for processing values over time with publishers and subscribers." %}
{% include roadmap/card.liquid art="rx" title="RxSwift" url="/rxswift/" text="The popular open-source reactive library, plus RxCocoa. You'll still find it in many existing codebases." %}
</div>

### Stage 4: Keep Exploring

<div class="roadmap-grid">
{% include roadmap/card.liquid art="topics" title="More Swift Topics" url="/swift-different-topics/" text="Debugging, reverse engineering, source control, regex, the terminal, Objective-C basics, and more." %}
</div>

## The iOS Roadmap 📱

Knowing Swift is half the story. The other half is Apple's frameworks: how to build screens, store data, draw, animate, and talk to the hardware. This roadmap walks through them in the order you'll usually need them.

### Stage 1: Get to Know Your Tools

<div class="roadmap-grid">
{% include roadmap/card.liquid art="xcode" title="Xcode" text="Projects, schemes, the debugger, previews, and Instruments for finding performance problems." %}
</div>

### Stage 2: Build Interfaces

<div class="roadmap-grid">
{% include roadmap/card.liquid art="swiftui" title="SwiftUI" url="/swiftui-views-are-values-and-not-objects-overlooking-this-can-lead-to-bugs/" text="Apple's modern, declarative UI framework. Start by understanding why views are values." %}
{% include roadmap/card.liquid art="uikit" title="UIKit" text="The original iOS UI framework: view controllers, Auto Layout, and Interface Builder. Still everywhere in real apps." %}
</div>

### Stage 3: Handle Data

<div class="roadmap-grid">
{% include roadmap/card.liquid art="networking" title="Networking" text="Fetching data from the internet with URLSession, and keeping the UI up to date while you wait." %}
{% include roadmap/card.liquid art="persistence" title="Persistence" text="Saving data on the device with SwiftData, Core Data, files, and UserDefaults, and when to use which." %}
</div>

### Stage 4: Bring It to Life

<div class="roadmap-grid">
{% include roadmap/card.liquid art="graphics" title="Core Graphics" text="Drawing paths, shapes, gradients, and images in 2D." %}
{% include roadmap/card.liquid art="animation" title="Core Animation" text="Layers, transforms, and smooth animations that run at full frame rate." %}
{% include roadmap/card.liquid art="media" title="Audio & Video" text="Playing, recording, and editing media with AVFoundation and AVKit." %}
{% include roadmap/card.liquid art="sensors" title="Sensors" text="Motion, location, and more with Core Motion and Core Location." %}
</div>

### Stage 5: Ship Something People Trust

<div class="roadmap-grid">
{% include roadmap/card.liquid art="accessibility" title="Accessibility" url="/ios-accessibility/" text="VoiceOver, Dynamic Type, and building apps everyone can use." %}
{% include roadmap/card.liquid art="security" title="Security" url="/ios-android-developer-security-basics/" text="Protecting your users' data, from secure storage to network security. Want to go deeper? See my book." %}
{% include roadmap/card.liquid art="testing" title="Testing" url="/swift-testing/" text="Build confidence across unit, integration, and UI tests, with deterministic fixtures and reliable CI feedback." %}
</div>

## Keep Going 🚀

These roadmaps grow along with the blog: as new articles are published, they're added here and the "Coming soon" badges disappear. If there's a topic you'd love to see next, [let me know](/about-me/). Your requests help decide what gets written first.

Happy learning, and enjoy the journey!
