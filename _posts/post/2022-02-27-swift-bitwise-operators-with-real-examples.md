---
layout: post
title: "Swift Bitwise Operators (with a couple of practical examples)"
date: "2022-02-27"
permalink: /swift-bitwise-operators-with-real-examples
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/bitwise.jpg"
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

**Bitwise operators** are rarely used in everyday swift programming  
⚠️ : not to be confused by Logical Operators like **"&&"** and **"||"**  

<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/bitwise_full.jpg"
 alt_text="" 
 caption=""
%}

It's mainly used to perform operations on individual bits,  they are extremely useful and used in **Flags**, **Graphics**, **Networking**, **Encryption**...

| **Operator**           | **Description**                   |
|------------------------|-----------------------------------|
| &                      | Binary AND                        |
| \|                     | Binary OR                         |
| ^                      | Binary XOR                        |
| ~                      | Binary One's Complement           |
| <<                     | Binary Shift Left                 |
| >>                     | Binary Shift Right                |

## Swift Bitwise Operators

First, a refresher on the truth table of XOR, it gives True if both A and B are Different, this is XOR Truth Table

| A      | B      | Result |
|--------|--------|--------|
| TRUE   | TRUE   | FALSE  |
| TRUE   | FALSE  | TRUE   |
| FALSE  | TRUE   | TRUE   |
| FALSE  | FALSE  | FALSE  |

The basic code to represent integers as bits, and each operator and it's result ... 🧐

```swift
extension Int {
    
    var binaryDescription: String {
        var binaryString = ""
        var internalNumber = self
        for _ in (1...self.bitWidth) {
            binaryString.insert(contentsOf: "\(internalNumber & 1)", at: binaryString.startIndex)
            internalNumber >>= 1
        }
        return "0b " + binaryString
    }
}

func bitwise_example() {
    let x1 = 0x1
    let x2 = 0x2
    print("x1\t", x1.binaryDescription )
    print("x2\t", x2.binaryDescription )
    let binary_and = (x1 & x2)
    let binary_or = (x1 | x2)
    let binary_xor = (x1 ^ x2)
    let binary_complement = (~x1)
    let binary_shiftL = (x1 << 1)
    let binary_shiftR = (x1 >> 1)
    print("&\t",  binary_and.binaryDescription )
    print("|\t", binary_or.binaryDescription )
    print("^\t", binary_xor.binaryDescription )
    print("~\t", binary_complement.binaryDescription )
    print("<<\t", binary_shiftL.binaryDescription )
    print(">>\t", binary_shiftR.binaryDescription )
}
```

Output:

```
x1	 0b 0000000000000000000000000000000000000000000000000000000000000001
x2	 0b 0000000000000000000000000000000000000000000000000000000000000010
&	 0b 0000000000000000000000000000000000000000000000000000000000000000
|	 0b 0000000000000000000000000000000000000000000000000000000000000011
^	 0b 0000000000000000000000000000000000000000000000000000000000000011
~	 0b 1111111111111111111111111111111111111111111111111111111111111110
<<	 0b 0000000000000000000000000000000000000000000000000000000000000010
>>	 0b 0000000000000000000000000000000000000000000000000000000000000000
```

## Real Life Usage for them
  
### 1- Color Format Conversion 

Most probably, you would have such an extension in your boilerplate iOS app, it converts HEX colors into UIColor.

```swift
extension UIColor {
   convenience init(red: Int, green: Int, blue: Int) {
       assert(red >= 0 && red <= 255, "Invalid red component")
       assert(green >= 0 && green <= 255, "Invalid green component")
       assert(blue >= 0 && blue <= 255, "Invalid blue component")

       self.init(red: CGFloat(red) / 255.0, green: CGFloat(green) / 255.0, blue: CGFloat(blue) / 255.0, alpha: 1.0)
   }

   convenience init(rgb: Int) {
       self.init(
           red: (rgb >> 16) & 0xFF,
           green: (rgb >> 8) & 0xFF,
           blue: rgb & 0xFF
       )
   }
}
```

### 2- Quick & Dirty hashing

```swift
let a = 4012
let b = 8102
let c = 9101

func dirtyHash(a: Int, b: Int, c: Int) -> Int{
    return ( a ^ b ^ c ^ 9999)
}
```

### 3- Base64 Encoding
  
Base64 encoding converts a series of 8 bit bytes into 6 bit character lookup indexes. (SHIFT)ing, (AND)ing, (OR)ing, (NOT)ing are used for implementing the bit operations necessary for Base64 encode/decode.  
  
### 4- Checking if a number is Odd/Even
[](https://stackoverflow.com/posts/2097299/timeline)

```swift
func isEven(number: Int) -> Bool{
    return ((number & 0x1) == 0)
}

func isOdd(number: Int) -> Bool{
    return ((number & 0x1) > 0)
}
```

### 5- Solving Problems efficiently and in a performant way  
Write a program to swap the value of two variable.

Using temporary variable

```swift
c =  a; a = b; b = c; 
```

Without using temporary variable

```swift
a = a+b; b = a-b; a = a-b; 
```

Using bitwise operator

```swift
a = a^b; b = a^b; a = a^b; 
```

### 6- Calculating valid network addresses for a subnet  
  
### 7- Calculating Permission in Role-based access control systems, RBAC.

### 8- Calculating Inverse Square Root very fastly
[http://h14s.p5r.org/2012/09/0x5f3759df.html](http://h14s.p5r.org/2012/09/0x5f3759df.html)  
  
Also:

Some people use bitwise operators to handle multiple error code together, each bit can hold a separate value.  
  
N-bitmap can be a really cool and compact data structure.
