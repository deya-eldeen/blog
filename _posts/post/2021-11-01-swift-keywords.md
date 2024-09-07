---
layout: post
title: "Swift Reserved Keywords, with brief explanations."
date: "2021-11-01"
last_modified_at: "2024-09-08"
permalink: /swift-keywords
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/keywords.jpg"
categories: 
  - "Development"
  - "Programming"
  - "Swift"
tags: 
  - "Development"
  - "Programming"
  - "Swift"
---

A reserved word is **a term designated by the programming language that cannot be used as an identifier**. This restriction is a syntactic rule that helps prevent conflicts and ambiguities in the code. 

<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/keywords_full.jpg"
 alt_text="" 
 caption=""
%}

As detailed in [Swift Lexical Structure](https://swiftbydeya.com/swift-lexical-structure/), these reserved words are integral to the language's syntax and functionality. For convenience, all lists of reserved words provided below are arranged alphabetically, facilitating quick and easy reference.

## Keywords used in declarations
Keywords for defining types, methods, and essential elements in `Swift`, including classes, structs, enums, protocols, and properties, along with access control and initialization behavior.

| Reserved Word | Details |
| --- | --- |
| `associatedtype` | Associated types are a powerful way of making protocols generic, it gives a placeholder name to a type that’s used as part of the protocol. |
| `class` | One of swift's general purpose, flexible constructs also see **struct** |
| `deinit` | A method that gets automatically called when an object is freed up from memory by ARC. |
| `enum` | Enums let's you define a custom kind of value in Swift, with predefined possible values. |
| `extension` | Extensions add new functionality to an existing class, structure, enumeration, or protocol type. |
| `fileprivate` | One of swift's access modifiers. |
| `func` | Used for creating functions. |
| `import` | A declaration used for importing modules and submodules |
| `init` | as per swift documentation, "Initialization is the process of preparing an instance of a class, structure, or enumeration for use." |
| `inout` | inout allows parameters to be changed outside of the function scope. |
| `internal` | One of swift's access modifiers. |
| `let` | A keyword used for declaring a constant |
| `open` | One of swift's access modifiers. |
| `operator` | A special symbol/ phrase that you use to check, change, or combine values. |
| `private` | One of swift's access modifiers. |
| `precedencegroup` | defining precedence groups to use for our custom operators. |
| `protocol` | as per swift's official documentation "A protocol defines a blueprint of methods, properties, and other requirements that suit a particular task or piece of functionality." |
| `public` | One of swift's access modifiers. |
| `rethrows` | rethrows keyword is used with function that accepts a throwing function as a parameter. |
| `static` | defines a static scope. |
| `struct` | complex value-types. |
| `subscript` | Subscripts allow you to write shortcuts to elements from collections, Sequences in classes, structures and enumerations. |
| `typealias` | Defines an alias for an existing type. |
| `var` | A keyword used for declaring a variable. |

## Keywords used in statements
Keywords that control the flow of execution in `Swift`, managing loops, conditionals, error handling, and control transfer within code blocks.

| Reserved Word | Details |
| --- | --- |
| `break` | One of the control transfer statements, ends execution of a loop, an if statement, or a switch statement. |
| `case` | Used for pattern testing. |
| `catch` | Used for handling any potential errors caused by a function that throws. |
| `continue` | One of the control transfer statements, ends execution of the current iteration of a loop statement but does not stop execution of the loop statement. |
| `default` | Used for default cases in switch. |
| `defer` | Used for making a block to execute just before a function exits. |
| `do` | Used for creating do blocks, for example (do-while, do-catch) |
| `else` | Used for executing a block when a condition is not satisfied. |
| `fallthrough` | One of the control transfer statements |
| `for` | Used for iterating over a sequence. |
| `guard` | Used in control transfer statement and optional unwrapping. |
| `if` | Used for condition evaluation. |
| `in` | In is a keyword defined in the Swift closure syntax as a separator between the function type and the function body in a closure, and used in checking if an object is in a sequence. |
| `repeat` | A control flow statement, similar to while loop |
| `return` | One of the control transfer statements |
| `throw` | Used for throwing an error in a function that throws. |
| `switch` | A switch statement considers a value and compares it against several possible matching patterns. |
| `where` | Used to filter out values, in statements like switch, for, protocol extension, first, contains, initializers. |
| `while` | A control flow statement, it performs a set of statements until a condition becomes false |

## Keywords used in expressions and types
Keywords for type casting, handling optional values, and managing Boolean literals, aiding in type checking and error handling.

| Reserved Word | Details |
| --- | --- |
| `Any` | Any can represent an instance of any type at all, including function types. |
| `as` | Used for type casting. |
| `catch` | Used in error handling, when an error is thrown, it’s matched against the catch clauses. |
| `false` | A literal used to express booleans. |
| `is` | Used to check whether an object is of a certain class type |
| `nil` | A valueless state that could be assigned to optionals. |
| `rethrows` | allows forwarding a thrown error by a given function parameter |
| `self` | “self” refers to the current object within a class or struct. |
| `Self` | Refers to a type – usually the current type in the current context. |
| `super` | super is used to call up to your superclass. |
| `throw` | Used for throwing an error in a function that throws. |
| `throws` | To mark a function throwing. |
| `true` | A literal used to express booleans. |
| `try` | The try keyword is used to indicate that a method can throw an error. To catch and handle an error, the throwing method call needs to be wrapped in a do-catch statement. |

## Keywords used in patterns
Keywords for pattern matching and destructuring values, used in control flow statements and variable assignments.

| Reserved Word |
| --- |
| `\_` |
| `.` |

## Keywords that begin with a number sign (`#`), literals expressions
Compile-time literals and directives providing information about the source code, such as file names and line numbers, and controlling runtime behavior.

| Reserved Word | Details |
| --- | --- |
| `#available` | Used to determine the availability of APIs at runtime |
| `#colorLiteral` | Used to make the XCode IDE to display a color swatch 🟥 |
| `#column` | column number of the line where it is being run. |
| `#dsohandle` | Represents the dynamic shared object handle, which is used in low-level programming contexts, particularly when dealing with dynamic libraries. It is not commonly used in everyday Swift development. |
| `#elseif` | Literal conditional statement |
| `#else` | Literal else statement. |
| `#endif` | Literal marker for closing an a literal if statement |
| `#error` | Creates a red compiler error & prevents code from compiling |
| `#fileID` | Generates concise file string in all language modes. |
| `#fileLiteral` | Used to make the XCode IDE link to a local file. |
| `#filePath` | Outputs the file path of in which code is being run. |
| `#file` | Outputs the name of the file in which code is being run. |
| `#function` | Outputs the name of the function where code belongs. |
| `#if` | Literal if statement. |
| `#imageLiteral` | Used to make the XCode IDE to display an image. |
| `#keyPath` | Used to refer to properties in a type-safe manner, allowing for dynamic key paths in Swift. This is particularly useful in conjunction with KVO (Key-Value Observing) and other reactive programming paradigms. |
| `#line` | line number where it is being run. |
| `#selector` | Used to refer to a method that can be called by Objective-C runtime. This is essential for methods that are intended to be used as selectors in target-action patterns or notifications. |
| `#sourceLocation` | Allows developers to specify the source location for logging purposes, which can be helpful in tracing back to the original source of a log message. This can be particularly useful in large projects. |
| `#warning` | will cause Xcode to display a warning with the given message.  |

## Keywords reserved in particular contexts
Keywords with specific meanings in certain contexts, such as defining operator behaviors, property observers, and type properties.

| Reserved Word | Details |
| --- | --- |
| `associativity` | defines how operators of the same precedence are grouped together. |
| `convenience` | Convenience modifier placed before the init keyword. |
| `didSet` | A property observer |
| `dynamic` | A declaration modifier used to make use of Objective-C's dynamism. |
| `final` | One of Swift's access modifiers. |
| `get` | Used when getting a computed property. |
| `indirect` | Used for recursive Enums |
| `infix` | Used when creating custom operators. |
| `lazy` | Used for just-in-time calculation. |
| `left` | Used to specify the associativity of a custom operator |
| `mutating` | Functions marked as mutating can change any property within its enclosing value |
| `none` | Used to specify the associativity of a custom operator |
| `nonmutating` | Indicates that a method does not modify the instance it belongs to. This is important for maintaining immutability in certain contexts. |
| `optional` | Indicates that a value may be absent, allowing for the representation of the absence of a value in a type-safe manner. This is a core feature of Swift's type system. |
| `override` | Used for overriding child classes. |
| `postfix` | Used in creating custom functions, it's mathematical notation in which operators follow operands. |
| `precedence` | Operator precedence is a set of rules that determine which operator is executed before another. |
| `prefix` | Used in creating custom functions, it's mathematical notation in which operators follow operands. |
| `Protocol` | A protocol defines a blueprint of methods, properties, and other requirements that suit a particular task or piece of functionality. |
| `required` | Required keyword means that inheriting classes must provide an implementation of the method. |
| `right` | Used to specify the associativity of a custom operator |
| `set` | Used when getting a computed property. |
| `some` | denotes an opaque type. |
| `Type` | A metatype type refers to the type of any type, including class types, structure types, enumeration types, and protocol types. |
| `unowned` | A reference type, used for memory management. |
| `weak` | A reference type, used for memory management. |
| `willSet` | A property observer |

- Outside the context in which they appear in the grammar, they can be used as identifiers.

The following tokens are reserved as punctuation and can’t be used as custom operators: 

<table><tbody><tr><td><code>(</code>,&nbsp;<code>)</code></td><th><code>{</code>,&nbsp;<code>}</code></th><th>&nbsp;<code>[</code>,&nbsp;<code>]</code></th></tr><tr><td>&nbsp;<code>.</code></td><td>,</td><td>:</td></tr><tr><td>;</td><td>=</td><td>@</td></tr><tr><td>#</td><td><code>&amp;</code>&nbsp;(as a prefix operator)</td><td>-&gt;</td></tr><tr><td>`</td><td>?</td><td><code>!</code>&nbsp;(as a postfix operator)</td></tr></tbody></table>

## Bitwise Operators in Swift
Operators for performing bit-level operations on integers, useful for low-level programming and efficient data manipulation.

| Operator | Description |
| --- | --- |
| `&` | **(Bitwise AND)**: Performs a bitwise AND operation between two integers. Each bit in the result is set to 1 if the corresponding bits of both operands are 1. |
| `|` | **(Bitwise OR)**: Performs a bitwise OR operation between two integers. Each bit in the result is set to 1 if at least one of the corresponding bits of either operand is 1. |
| `^` | **(Bitwise XOR)**: Performs a bitwise XOR operation between two integers. Each bit in the result is set to 1 if the corresponding bits of the operands are different. |
| `~` | **(Bitwise NOT)**: Performs a bitwise NOT operation on a single integer. This operator inverts all the bits of the operand, turning 0s into 1s and 1s into 0s. |
| `<<` | **(Left Shift)**: Shifts the bits of an integer to the left by a specified number of positions. This operation effectively multiplies the integer by 2 for each position shifted. |
| `>>` | **(Right Shift)**: Shifts the bits of an integer to the right by a specified number of positions. This operation effectively divides the integer by 2 for each position shifted. |
| `&=` | **(Bitwise AND Assignment)**: Combines the bitwise AND operation with assignment. It updates the variable by performing a bitwise AND between its current value and another value. |
| `|=` | **(Bitwise OR Assignment)**: Combines the bitwise OR operation with assignment. It updates the variable by performing a bitwise OR between its current value and another value. |
| `^=` | **(Bitwise XOR Assignment)**: Combines the bitwise XOR operation with assignment. It updates the variable by performing a bitwise XOR between its current value and another value. |

These operators are applied to integer types (`Int`, `UInt`, etc.) and provide a way to perform efficient, low-level bit manipulation in Swift. They are especially useful in scenarios where performance and direct hardware interaction are critical.
