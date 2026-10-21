---
layout: page
title: "Swift Language"
subtitle: "The vocabulary you'll use in every line of code you write"
permalink: /swift-language/
hide: true
excluded: true
---

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

- [Arrays and Dictionaries](/swift-arrays-and-dictionaries/)
- [Sets](/swift-set-data-structure-with-practical-example-pizza-cooking/)
- [Control Flow: `if`, `guard`, `switch`, and Loops](/swift-control-flow/)
- [Pattern Matching](/swift-pattern-matching/)
{: .roadmap-topics}

## 5. Functions and Closures

- [Functions](/swift-functions/)
- [Closures](/swift-closures/)
- [Escaping and Non-Escaping Closures](/swift-escaping-closures/)
- [Capture Lists](/swift-capture-lists/)
{: .roadmap-topics}

## 6. Building Your Own Types

- [Enumerations](/swift-enumerations/)
- [Structures and Classes: Value vs. Reference Types](/swift-structures-and-classes/)
- [Properties](/swift-properties/)
- [Methods and `mutating`](/swift-methods-and-mutating/)
- [Subscripts](/swift-subscripts/)
- [Inheritance](/swift-inheritance/)
- [The Root Class and NSObject](/swift-root-class-nsobject/)
{: .roadmap-topics}

## 7. Lifetime, Safety, and Errors

- [Initialization](/swift-initialization/)
- [Deinitialization](/swift-deinitialization/)
- [Automatic Reference Counting (ARC)](/swift-automatic-reference-counting/)
- [Zombies: Use-After-Free Bugs](/swift-zombies/)
- [Memory Safety](/swift-memory-safety/)
- [Optional Chaining](/swift-optional-chaining/)
- [Error Handling](/swift-error-handling/)
- [Access Control](/swift-access-control/)
{: .roadmap-topics}

## 8. Advanced Features

- [Protocols](/swift-protocols/)
- [Extensions](/swift-extensions/)
- [Generics](/swift-generics/)
- [Phantom Types](/swift-phantom-types/)
- [Opaque and Boxed Types (`some` and `any`)](/swift-opaque-and-boxed-types/)
- [Type Casting](/swift-type-casting/)
- [Nested Types](/swift-nested-types/)
- [Property Wrappers](/swift-property-wrappers/)
- [Macros](/swift-macros/)
- [Advanced and Custom Operators](/swift-advanced-and-custom-operators/)
- [Concurrency: `async`/`await`, Tasks, and Actors](/swift-concurrency/)
{: .roadmap-topics}

## 9. Under the Hood

These topics come up in day-to-day work, in debugging sessions, and very often in interviews:

- [Static vs. Dynamic Dispatch](/swift-static-vs-dynamic-dispatch/)
- [Method Swizzling](/swift-method-swizzling/)
- [Key-Value Observing (KVO)](/swift-key-value-observing/)
- [`defer`](/swift-defer/)
- [`stride`](/swift-stride/)
- [Reflection with `Mirror`](/swift-reflection-with-mirror/)
- [Interoperability with Objective-C, C, and C++](/swift-interoperability/)
- [RunLoop](/swift-runloop/)
- [Operation and OperationQueue](/swift-operation-and-operationqueue/)
- [ABI Stability](/swift-abi-stability/)
- [Swift Package Manager](/swift-package-manager/)
- [Swift Evolution: How the Language Changes](/swift-evolution/)
- [Address Sanitizer](/swift-address-sanitizer/)
- [Clean Code in Swift](/swift-clean-code/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/swift-object-oriented-programming/" next_title="Object-Oriented Programming" %}
