---
layout: post
title: "Swift: The Difference Between Void and ()"
date: "2021-11-29"
last_modified_at: "2024-09-08"
permalink: /swift-void-and/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/void.webp"
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

`Void` is a concept familiar across many programming languages. In Swift, `Void` has a unique and specific meaning, rooted in the language's type system. 

<!--more-->

This post explores the intricacies of `Void` in Swift, how it relates to the empty tuple `()`, and how it is used in functions, methods, and closures.

{%
 include centered-image.html 
 image_path="../images/covers/void_full.webp"
 alt_text="" 
 caption=""
%}

## What is Void in Swift?

In Swift's standard library, `Void` is simply a typealias for an empty tuple `()`. This is important because Swift, unlike many other languages, treats `Void` as a type, which is crucial in a language that emphasizes type safety.

```swift
public typealias Void = ()
```

The above definition means that `Void` is nothing more than a convenient way to refer to an empty tuple. When a function doesn't return any value, Swift allows you to specify the return type as `Void`. However, if you omit the return type, Swift implicitly assumes the function returns `Void`.

### Void and Type Safety

In Swift, type safety is a core principle. The concept of `Void` as an empty tuple fits neatly into this system, ensuring that functions, methods, and closures that don't return a value still conform to Swift's type system.

Consider the following function:

```swift
func doSomething() -> Void {
    print("Doing something")
}
```

This is functionally equivalent to:

```swift
func doSomething() {
    print("Doing something")
}
```

In both cases, `doSomething` returns `Void`, but the explicit version makes it clear that no value is expected from the function.

## The Empty Tuple ()

In Swift, `()` can represent both a type and a value.

- **As a type**: `()` is the empty tuple type, which is equivalent to `Void`.
- **As a value**: `()` is an empty tuple, which is equivalent to `Void()`.

This dual role can sometimes cause confusion, especially for developers coming from other programming languages where `Void` is a keyword rather than a type.

### Practical Uses of Void

Understanding `Void` as a type opens up some practical applications in Swift, particularly in generic programming and higher-order functions.

#### Example: Using Void in a Closure

```swift
let completionHandler: () -> Void = {
    print("Task completed")
}
completionHandler()
```

Here, the closure `completionHandler` takes no parameters and returns `Void`. This pattern is common in asynchronous programming, where closures often signal the completion of a task.

### Void and () in Swift

1. **Optional Void**: You can have an `Optional<Void>` in Swift, which can be useful when you want to represent the presence or absence of a side-effect without returning an actual value.
   
```swift
var action: (() -> Void)?
action = {
    print("Action performed!")
}
// Executing the action if it exists
action?()
```

2. **Higher-Order Functions**: `Void` can be used in higher-order functions where you need to define a function that takes a function as a parameter and returns `Void`.

   ```swift
   func executeTask(task: () -> Void) {
       task()
   }
   
   executeTask {
       print("Executing task")
   }
   ```

## Void is Not the Same as void

In languages like C, C++, and Objective-C, `void` is a keyword that indicates a function doesn't return a value. In Swift, `Void` is a type, which means you can do things with `Void` that you couldn't do with `void` in other languages, such as using `Void` in type constraints or as a generic parameter.

This function works with any type and explicitly states that it returns `Void`.

## Summary

In Swift, `Void` is more than just a synonym for "no return value"; it is a type that integrates smoothly with Swift's emphasis on type safety and flexibility. Understanding `Void` as an empty tuple `()` provides deeper insights into how Swift handles functions, closures, and type constraints. 

By leveraging `Void`, you can write more expressive, safer, and more flexible Swift code, whether you're working on simple functions or complex generic algorithms.

> Keep in mind: `Void` is not just an absence of a return type—it's an integral part of Swift's type system that enables type-safe, expressive code.
