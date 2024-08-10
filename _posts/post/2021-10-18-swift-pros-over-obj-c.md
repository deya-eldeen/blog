---
layout: post
title: "Swift Pros over Obj-C"
date: "2021-10-18"
categories: 
  - "development"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "programming"
  - "swift"
---

![](images/ideas.png)

Obj-C development dates back to 1980s, Swift came with a lot of significant improvements in clarity, performance, safety, and more.

**1- Swift is easier to read and maintain**  
Swift drops legacy conventions, using semicolons to end lines are not needed, also parenthesis are not needed around (conditional expressions), no bracket hell needed for method calls, two-file requirement is dropped by swift, the LLVM compiler can figure out dependencies automatically...  
  
for example, swift adopts modern programming language features like concatenation of two strings together with a "+" operator, along with string interpolation which makes things easier and safer, instead of memorizing special tokens  (`%s`, `%d`, `%@`), that can be a source of crashes!

**2- Swift is more safe, and have better memory management**  
in Obj-C nothing happens if you call a method with a nil pointer variable, not crashing may look like a benefit, but actually this is a source of bugs and unexpected behavior, optional types in swift solves this problem, this means any bug will be fixed sooner or avoided at all in swift code.  
  
In contrast to swift, in Objective-C, ARC is not available for procedural C and other APIs like CoreGraphcis, swift saves the developer brain power for better things, like writing the app's main logic, instead of handling memory management.  
  
**3- Swift is faster, and is less prone to name collisions**  
  
A lot of people made benchmarks, concluding swift being faster and more performant than Obj-C.

<figure>

![](images/speed.jpeg)

<figcaption>

a benchmark made by apple.

</figcaption>

</figure>

Obj-C lacked name-spacing, to overcome this issue, a common practice was using a few letters as a prefix, for example NSArray (after NextStep, a company by Steve Jobs), or NSString, ... etc.  
  
In swift, namespaces are based on the target that a file relies in, for example, both apple frameworks and google frameworks can have a file called Authentication.swift  
  
**4- Swift Supports Dynamic libraries  
**  
Obj-C only support static libraries, this is a big downside, swift support dynamic libraries, that can be loaded into the app’s memory directly, this reduces the app total size, and reduces the load time of (on demand) new content.  
  
**5- Swift is open-source and has bigger community  
**Swift has a big community that are actively contributing, hence open-source, it started running in other environments like linux. for example of swift outside of the apple ecosystem, see [vapor](https://vapor.codes),  a web framework for Swift.

> The Swift language is developed in the open, and all technical or administrative topics about the language or community processes should be directed to the Swift public forums. Public conversations are encouraged, and active developers of the Swift language should monitor the relevant forum categories.
> 
> Swift.org
