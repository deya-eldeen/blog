---
layout: post
title: "Swift Lexical Structure"
date: "2021-11-01"
last_modified_at: "2024-09-08"
permalink: /swift-lexical-structure/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/lexical.jpg"
categories: 
  - "Development"
  - "Programming"
  - "Swift"
  - "Syntax"
tags: 
  - "Development"
  - "Programming"
  - "Swift"
  - "Syntax"
---

The Swift lexical structure consists of valid tokens (the lowest-level building blocks) that form the structure of any Swift program. These tokens describe the entirety of the Swift language.

A token consists of an identifier, keyword, punctuation, literal, or operator.
<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/lexical_full.jpg"
 alt_text="" 
 caption=""
%}

## Swift Lexical Structure

### Identifiers 
**An example of an identifier is a variable name, for example here "pet" is an identifier.  
  
```swift
let pet = "Happy Dinosaur 🦖"
```

Identifiers support unicode characters, you can name you variable in you native language, and as in other programming languages, you cannot use keywords as identifiers, this is still possible if you surrounding a keyword with back-ticks,

```swift
var `var` = "var"
```

examples of unicode identifiers are

```swift
var _latitude = 32.0
var アップル = "apple"
```
  
The list of basic keywords in Swift is shown below. For a comprehensive list and details, see the [Swift Reserved Keywords](https://swiftbydeya.com/swift-keywords/).

| Keywords         | Keywords         | Keywords         |
|------------------|------------------|------------------|
| `class`          | `deinit`         | `enum`           |
| `extension`      | `func`           | `import`         |
| `init`           | `let`            | `protocol`       |
| `static`         | `struct`         | `subscript`      |
| `typealias`      | `var`            | `break`          |
| `continue`       | `default`        | `do`             |
| `else`           | `fallthrough`    | `if`             |
| `in`             | `for`            | `return`         |
| `switch`         | `where`          | `while`          |
| `as`             | `dynamicType`    | `is`             |
| `new`            | `super`          | `self`           |
| `Self`           | `Type`           | `__COLUMN__`     |
| `__FILE__`       | `__FUNCTION__`   | `__LINE__`       |
| `associativity`  | `didSet`         | `get`            |
| `infix`          | `inout`          | `left`           |
| `mutating`       | `none`           | `nonmutating`    |
| `override`       | `precedence`     | `prefix`         |
| `right`          | `set`            | `unowned`        |
| `unowned(safe)`  | `unowned(unsafe)`| `weak`           |
| `willSet`        |                  |                  |

### Literals

Literals in Swift fall into three categories: integer literals, floating-point literals, and string literals.

#### Integer Literals

```swift
var a = 10  
var b = 00010100b //Binary
var c = 14x //Hexadecimal
var d = 24o //Octal 
```
  
leading zeros will be ignored by the compiler, and the use of underscores is possible to increase readability.  
  
```swift
var a = 100_000_000
```  

#### Floating Point Literals
```swift
var a = 10.7 //Simple floating point number   
var b = 10.6e2 //Exponent floating point number 
var c = 10.1e-2 //Exponent floating point number 
var d = 0xAp2 //Hexa decimal exponent 
var d = 0xAp-2 //Hexa decimal exponent 
```

#### String Literals  

String literals are characters are enclosed within double quotes. Strings can contain escape sequences to represent characters like qoutes. 

Example for string literal is shown below:

```swift
var a = "test"  
var a = "Hello\\nWorld"
```

Common escape sequences include:

| Escape Sequence | Description       |
|-----------------|-------------------|
| `\\0`           | Null Character    |
| `\\`            | Backslash         |
| `\\t`           | Horizontal Tab    |
| `\\n`           | New Line          |
| `\\r`           | Carriage Return   |
| `\\"`           | Double Quote      |
| `\\'`           | Single Quote      |


### Operators:
Swift supports various operators, including:

| Operator | Description            |
|----------|------------------------|
| `+`      | Addition               |
| `-`      | Subtraction            |
| `*`      | Multiplication         |
| `/`      | Division               |
| `%`      | Remainder              |
| `^`      | Exponent               |
| `&`      | Bitwise And            |
| `&&`     | Logical And            |
| `|`      | Bitwise Or             |
| `||`     | Logical Or             |
| `++`     | Increment Operator     |
| `--`     | Decrement Operator     |
| `~`      | Bitwise Not            |
| `<`      | Less Than              |
| `>`      | Greater Than           |
| `...`    | Etc.                   |


Remember, some punctuation is reserved in Swift and cannot be used as custom operators:

| Punctuation | Restrictions          |
|-------------|-----------------------|
| `(`, `)`    | Cannot be used as custom operators |
| `{`, `}`    | Cannot be used as custom operators |
| `[`, `]`    | Cannot be used as custom operators |
| `.`, `,`    | Cannot be used as custom operators |
| `:`, `;`    | Cannot be used as custom operators |
| `=`         | Cannot be used as custom operators |
| `@`, `#`    | Cannot be used as custom operators |
| `&`         | Cannot be used as a prefix operator |
| `->`        | Cannot be used as custom operators |
| `` ` ``     | Cannot be used as custom operators |
| `?`, `!`    | Cannot be used as postfix operators |


### Swift Whitespace

Whitespace in Swift plays a crucial role in improving code readability and structure. It is primarily used to separate tokens, ensuring that the syntax is clear and unambiguous. While whitespace can be freely used to format your code for better legibility, it is generally ignored by the Swift compiler unless it serves a syntactic purpose, such as distinguishing between prefixes or separating keywords and identifiers.

### Swift Comments

Comments in Swift are essential for making your code more understandable to others (and yourself in the future). They are completely ignored by the compiler and serve purely for documentation purposes. Swift supports both single-line and multi-line comments, allowing you to annotate your code as needed:

```swift
// This is a single line comment
```

```swift
/* Multi line (block) comment - can have
more than one line! */
```
