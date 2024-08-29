---
layout: post
title: "Swift Lexical Structure"
date: "2021-11-01"
categories: 
  - "development"
  - "ios"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "ios"
  - "programming"
  - "swift"
permalink: /swift-lexical-structure
excerpt_separator: <!--more-->
---

Swift lexical structure, consists of valid tokens (lowest-level building blocks) that form the structure of any swift program, these tokens describe the rest of whole swift language...  
  
A token consists of an identifier, keyword, punctuation, literal, or operator.  
<!--more-->

**1) Identifiers:  
**An example of an identifier is a variable name, for example here "pet" is an identifier.  
  
`let pet = "Happy Dinosaur 🦖";`

Identifiers support unicode characters, you can name you variable in you native language, and as in other programming languages, you cannot use keywords as identifiers, this is still possible if you surrounding a keyword with back-ticks,

``var `var` = "var"   ``  
examples of unicode identifiers are

`var _latitude = 32.0;   var アップル = "apple"`;  
  
**2) Keywords:  
**The list of basic keywords in swift are listed below, see [(Swift Reserved Keywords)](https://swiftbydeya.com/swift-keywords/) for comprehensive list and details.

<table><tbody><tr><td>class</td><td>deinit</td><td>enum</td></tr><tr><td>extension</td><td>func</td><td>import</td></tr><tr><td>init</td><td>let</td><td>protocol</td></tr><tr><td>static</td><td>struct</td><td>subscript</td></tr><tr><td>typealias</td><td>var</td><td>break</td></tr><tr><td>continue</td><td>default</td><td>do</td></tr><tr><td>else</td><td>fallthrough</td><td>if</td></tr><tr><td>in</td><td>for</td><td>return</td></tr><tr><td>switch</td><td>where</td><td>while</td></tr><tr><td>as</td><td>dynamicType</td><td>is</td></tr><tr><td>new</td><td>super</td><td>self</td></tr><tr><td>Self</td><td>Type</td><td>__COLUMN__</td></tr><tr><td>__FILE__</td><td>__FUNCTION__</td><td>__LINE__</td></tr><tr><td>associativity</td><td>didSet</td><td>get</td></tr><tr><td>infix</td><td>inout</td><td>left</td></tr><tr><td>mutating</td><td>none</td><td>nonmutating</td></tr><tr><td>override</td><td>precedence</td><td>prefix</td></tr><tr><td>right</td><td>set</td><td>unowned</td></tr><tr><td>unowned(safe)</td><td>unowned(unsafe)</td><td>weak</td></tr><tr><td>willSet</td></tr></tbody></table>

**3) Literals:  
**literals fall into 3 categories, integer, floating point, and string literals  
  
_Integer Literals  
_`var a = 10`  
`   //Binary   var b = 00010100b`  
`   //Hexadecimal   var c = 14x`  
`   //Octal   var d = 24o`  
  
leading zeros will be ignored by the compiler, and the use of underscores is possible to increase readability.  
  
`var a = 100_000_000   `  
_Floating Point Literals`   `_`//Simple floating point number   var a = 10.7`  
`   //Exponent floating point number   var b = 10.6e2`  
`var c = 10.1e-2   //Exponent floating point number      //Hexa decimal exponent   var d = 0xAp2`  
`   //Hexa decimal exponent   var d = 0xAp-2`  
  
_String Literals  
_  
String literals are characters are enclosed within double quotes. Strings can contain escape sequences to represent characters like qoutes. Example for string literal is shown below.

var a = "test"  
var a = "Hello\\nWorld"  
  
\\0 Null Character  
\\ Backslash  
\\t Horizontal Tab  
\\n New line  
\\r Carriage Return  
\\” Double Quote  
\\’ Single Quote  
  
  
**4) Operators**:  
There are different operators supported in swift which includes  
\+ : Addition  
\- : Subtraction  
\* : Multiplication  
/ : Division  
% : Remainder  
^ : Exponent  
& : Bitwise And  
&& : Logical And  
| : Bitwise Or  
|| : Logical Or  
++ : Increment Operator  
– : Minus  
~ : Bitwise Not  
< : Less Than  
\> : Greater Than  
... etc.  
  
Keep in mind, as in Swift's official documentation, this is a list of reserved punctuation and can't be used as custom operators:  
"`(`, `)`, `{`, `}`, `[`, `]`, `.`, `,`, `:`, `;`, `=`, `@`, `#`, `&` (as a prefix operator), `->`, `` ` ``, `?`, and `!` (as a postfix operator)"  
  
**Swift Whitespace:  
**White spaces are used to separate tokens and to distinguish prefixes, otherwise it's normally omitted by the compiler.

**Swift Comments:  
**these are statements that are ignored by the compiler, and meant for documentation purposes of our code, they could be either one-line or multi-line.

`// This is a single line comment`  
`   /* Multi line (block) comment - can have   more than one line! */`
