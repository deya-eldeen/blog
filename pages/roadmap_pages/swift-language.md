---
layout: page
title: "Swift Language"
subtitle: "The vocabulary you'll use in every line of code you write"
permalink: /swift-language/
hide: true
excluded: true
---

{% include roadmap/guide_header.liquid %}

Swift is Apple's modern programming language for iOS, iPadOS, macOS, watchOS, tvOS, and visionOS, and it also runs on Linux, Windows, and servers. Since its release in 2014, it has won developers over with clean syntax, strong safety guarantees, and great performance.

This guide walks through the language from the very first `let` to generics and opaque types. Go in order if you're new; every section builds on the ones before it.

{% include roadmap/legend.liquid %}

## 1. Meet Swift

- [What Is Swift?](/what-is-swift/)
- [Advantages of Swift Over Objective-C](/swift-pros-over-obj-c/)
- [Swift Lexical Structure](/swift-lexical-structure/)
- [Swift Reserved Keywords](/swift-keywords/)
- [Swift Style Guides](/swift-style-guides/)
{: .roadmap-topics}

## 2. Variables and Data Types

- [Variables and Constants](/swift-variables-and-constants/)
- [Basic Data Types & Type Inference](/swift-built-in-data-types/)
- [Never Use Floating-Point Types for Money!](/never-use-floating-point-double-data-types-for-monetary-calculations/)
- [Any, AnyObject, and AnyHashable](/swift-any-anyobject/)
- [Void vs. ()](/swift-void-and/)
- [Optionals](/swift-optionals/)
- [nil, Nil, NULL, and NSNull](/swift-the-difference-between-nil-nil-null-nsnull/)
{: .roadmap-topics}

## 3. Operators and Strings

- [Basic Operators](/swift-basics-operators/)
- [Bitwise Operators](/swift-bitwise-operators-with-real-examples/)
- [Strings and Characters](/swift-basics-strings-characters/)
- [Aligning Mixed Right-to-Left and Left-to-Right Text](/invisible-markers-ltr-0x200e-rtl200f-to-align-text-correctly/)
{: .roadmap-topics}

## 4. Collections and Control Flow

- Arrays and Dictionaries
- [Sets](/swift-set-data-structure-with-practical-example-pizza-cooking/)
- Control Flow: `if`, `guard`, `switch`, and loops
- Pattern Matching
{: .roadmap-topics}

## 5. Functions and Closures

- Functions
- Closures
- Escaping and Non-Escaping Closures
- Capture Lists and Avoiding Memory Leaks
{: .roadmap-topics}

## 6. Building Your Own Types

- Enumerations
- Structures and Classes: Value vs. Reference Types
- Properties
- Methods and `mutating`
- Subscripts
- Inheritance
- [The Root Class and NSObject](/swift-root-class-nsobject/)
{: .roadmap-topics}

## 7. Lifetime, Safety, and Errors

- Initialization
- Deinitialization
- Automatic Reference Counting (ARC)
- [Zombies: Use-After-Free Bugs](/swift-zombies/)
- Memory Safety
- Optional Chaining
- Error Handling
- Access Control
{: .roadmap-topics}

## 8. Advanced Features

- Protocols
- Extensions
- Generics
- [Phantom Types](/swift-phantom-types/)
- Opaque and Boxed Types (`some` and `any`)
- Type Casting
- Nested Types
- Property Wrappers
- Macros
- Advanced and Custom Operators
- Concurrency: `async`/`await`, Tasks, and Actors
{: .roadmap-topics}

## 9. Under the Hood

These topics come up in day-to-day work, in debugging sessions, and very often in interviews:

- Static vs. Dynamic Dispatch
- Method Swizzling
- Key-Value Observing (KVO)
- `defer`
- `stride`
- Reflection with `Mirror`
- Interoperability with Objective-C, C, and C++
- RunLoop
- Operation and OperationQueue
- ABI Stability
- Swift Package Manager
- Swift Evolution: How the Language Changes
- Address Sanitizer
- Clean Code in Swift
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-object-oriented-programming/" next_title="Object-Oriented Programming" %}
