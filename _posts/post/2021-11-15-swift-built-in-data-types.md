---
layout: post
title: "Swift Basic Data Types & Type Inference"
date: "2021-11-15"
categories: 
  - "development"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "programming"
  - "swift"
permalink: /swift-built-in-data-types
excerpt_separator: <!--more-->
---

Swift is strongly typed, data should either be explicitly assigned or inferred, the main basic data types that come with swift are
<!--more-->

<table><tbody><tr><td><strong>Type</strong></td><td><strong>Description</strong></td></tr><tr><td>Character</td><td>a 16-bit Unicode character like "a" or "/"</td></tr><tr><td>String</td><td>represents textual data like "Hello"</td></tr><tr><td>Float</td><td>represents 32-bit floating-point number</td></tr><tr><td>Double</td><td>represents 64-bit floating-point number</td></tr><tr><td>Bool</td><td>logical value: true or false</td></tr><tr><td>Tuples</td><td>groups multiple values in single value</td></tr><tr><td>Int</td><td>integer, a whole number</td></tr><tr><td>UInt</td><td>unsigned integer, a whole number</td></tr><tr><td>Int8</td><td>1 byte integer</td></tr><tr><td>Int32</td><td>4 bytes integer</td></tr><tr><td>Int64</td><td>8 bytes integer</td></tr><tr><td>UInt8</td><td>1 byte unsigned integer</td></tr><tr><td>UInt32</td><td>4 bytes unsigned integer</td></tr><tr><td>UInt64</td><td>8 bytes unsigned integer</td></tr></tbody></table>

  
On a 32-bit device, Int has the size of Int32, on 64-bit devices, Int has the size of Int64, same goes for UInt.

Swift has a feature where it can infer the type of the data directly, for example the variable level here is infered to be an Int

```
var level = 12
```

you can explicitly determine the type directly

```
var level: Int = 17

Extra Tip: A CGFloat holds either 32-bits of data or 64-bits of data depending on the CPU Architecture.
```
