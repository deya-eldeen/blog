---
layout: post
title: "Mastering Swift Bitwise Operators: Theory and Practical Examples"
date: "2022-02-27"
last_modified_at: "2024-09-08"
permalink: /swift-bitwise-operators-with-real-examples
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/bitwise.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Bitwise"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Bitwise"
---

**Bitwise operators** are a powerful yet often underutilized feature in Swift. Unlike logical operators like `"&&"` and `||`, which operate on entire values, bitwise operators perform operations on individual bits within a value. This post explores the different bitwise operators available in Swift, their theoretical underpinnings, and practical examples to demonstrate their utility in real-world scenarios.

<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/bitwise_full.jpg"
 alt_text="Tiling Images in Interface Builder" 
 caption=""
%}

## Overview of Bitwise Operators

Bitwise operators are crucial in low-level programming tasks such as manipulating flags, performing graphics operations, networking, and encryption. Here's a summary of the primary bitwise operators in Swift:

| **Operator**  | **Description**                   |
|---------------|-----------------------------------|
| `&`           | Binary AND                        |
| `\|`          | Binary OR                         |
| `^`           | Binary XOR                        |
| `~`           | Binary One's Complement           |
| `<<`          | Binary Shift Left                 |
| `>>`          | Binary Shift Right                |

### Truth Table for XOR

The XOR (exclusive OR) operator is particularly interesting. It compares corresponding bits of two operands and returns `1` if the bits are different, and `0` if they are the same. Here’s the truth table for XOR:

| A      | B      | A ^ B  |
|--------|--------|--------|
| TRUE   | TRUE   | FALSE  |
| TRUE   | FALSE  | TRUE   |
| FALSE  | TRUE   | TRUE   |
| FALSE  | FALSE  | FALSE  |

## Bitwise Operations in Swift

Let’s start by exploring how to represent integers as binary strings in Swift, and then apply various bitwise operators to them:

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

func bitwiseExample() {
    let x1 = 0x1
    let x2 = 0x2
    print("x1	", x1.binaryDescription )
    print("x2	", x2.binaryDescription )
    let binaryAnd = (x1 & x2)
    let binaryOr = (x1 | x2)
    let binaryXor = (x1 ^ x2)
    let binaryComplement = (~x1)
    let binaryShiftL = (x1 << 1)
    let binaryShiftR = (x1 >> 1)
    print("&	", binaryAnd.binaryDescription )
    print("|	", binaryOr.binaryDescription )
    print("^	", binaryXor.binaryDescription )
    print("~	", binaryComplement.binaryDescription )
    print("<<	", binaryShiftL.binaryDescription )
    print(">>	", binaryShiftR.binaryDescription )
}
```

When executed, this code will output:

```
x1  0b 0000000000000000000000000000000000000000000000000000000000000001
x2  0b 0000000000000000000000000000000000000000000000000000000000000010
&   0b 0000000000000000000000000000000000000000000000000000000000000000
|   0b 0000000000000000000000000000000000000000000000000000000000000011
^   0b 0000000000000000000000000000000000000000000000000000000000000011
~   0b 1111111111111111111111111111111111111111111111111111111111111110
<<  0b 0000000000000000000000000000000000000000000000000000000000000010
>>  0b 0000000000000000000000000000000000000000000000000000000000000000
```

## Practical Applications of Bitwise Operators

Bitwise operators are not just theoretical—they have practical uses in many areas of programming. Here are some real-world examples:

### 1. Color Format Conversion

A common use case for bitwise operators is converting a HEX color value into its RGB components in iOS development:

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

### 2. Quick & Dirty Hashing

Bitwise operations can also be used to create simple hash functions. The `chaoticHash` function computes a chaotic hash value for a given string by mixing the ASCII values of its characters using bitwise operations and arithmetic. It starts with a prime constant to enhance distribution and applies multiple transformations to ensure that small changes in the input result in significantly different hash outputs. 


```swift
func chaoticHash(input: String) -> Int {
    var hashValue = 31 // Starting with a prime constant for better distribution
    for character in input {
        let asciiValue = Int(character.asciiValue ?? 0)
        hashValue ^= (asciiValue * 31)
        hashValue = (hashValue << 5) | (hashValue >> (32 - 5))
        hashValue += asciiValue
        hashValue ^= (hashValue >> 13)
    }
    return hashValue
}
let inputString = "SwiftByDeya"
let hashValue = chaoticHash(input: inputString)
print("Chaotic Hash Value: \(hashValue)")
// Outputs the computed chaotic hash value 3637872018676935840
```

> Note: This hash function is not secure and should not be used in production environments.


### 3. Base64 Encoding

Base64 encoding involves converting a series of 8-bit bytes into 6-bit character lookup indexes. Bitwise operators like SHIFT, AND, OR, and NOT are crucial in performing these operations efficiently.

### 4. Checking if a Number is Odd/Even

You can quickly check if a number is odd or even using the following bitwise operations:

```swift
func isEven(number: Int) -> Bool {
    return (number & 0x1) == 0
}

func isOdd(number: Int) -> Bool {
    return (number & 0x1) > 0
}
```

### 5. Efficiently Swapping Two Variables

Bitwise XOR can be used to swap the values of two variables without using a temporary variable:

```swift
var a = 5
var b = 10

a = a ^ b
b = a ^ b
a = a ^ b
```

### 6. Network Address Calculations

Bitwise operations are vital in calculating valid network addresses, subnet masks, and broadcast addresses in networking.

### 7. Role-Based Access Control (RBAC)

In role-based access control systems, bitwise operations are often used to calculate and manage permissions efficiently.

### 8. Fast Inverse Square Root

A famous example of bitwise operations is the fast inverse square root, used in graphics programming. The original implementation can be found [here](http://h14s.p5r.org/2012/09/0x5f3759df.html).

## Conclusion

Bitwise operators are a versatile tool in a Swift programmer’s toolkit. From manipulating individual bits to optimizing performance in specific tasks, understanding and leveraging bitwise operators can help you write more efficient and powerful code.
