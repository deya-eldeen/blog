---
layout: post
title: "Why You Should Never Use Floating-Point or Double Data Types for Money Calculations!"
date: "2022-02-12"
last_modified_at: "2024-09-08"
permalink: /never-use-floating-point-double-data-types-for-monetary-calculations/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/money.webp"
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

Handling money in software is a task that requires precision, especially when dealing with fractions of currency like dollars and cents. One common mistake that developers make is using floating-point data types, such as `Double`, to represent monetary values.

This post explains why this is problematic and what alternatives you should use.

<!--more-->

{% 
 include centered-image.html 
 image_path="../images/covers/money_full.webp" 
 alt_text="Money and Code" 
 caption="Avoid Floating-Point for Monetary Values" 
 width="960" 
 height="1568"
%}

## The Problem with Floating-Point Arithmetic

Floating-point values, including the `Double` type in Swift, should be avoided when working with currency amounts that have fractions. The fundamental issue is that floating-point types cannot represent certain decimal values exactly due to their binary nature.

### Example Showing Unexpected Results

Consider the following example where you want to store 0.1 dollars:

```swift
var balance: Double = 0.0
for _ in 1...10{
    balance += 0.1
}
for _ in 1...10{
    balance -= 0.1
}
print(balance) // Outputs: 2.7755575615628914e-17
```

Here, the expected value is *0.0* but we get *2.7755575615628914e-17* since value *0.1* is not stored precisely as *0.1* but as an approximation (e.g., *0.10000000149...*). This small difference can have significant consequences, especially when performing multiple arithmetic operations.

## Loss of Significance

When performing a series of arithmetic operations using floating-point numbers, you may encounter a problem known as **loss of significance**. This occurs when the precision errors from approximations accumulate, leading to larger errors that can affect the outcome of your calculations.

Let's consider a scenario where you repeatedly add 0.1 dollars to an account balance:

```swift
var balance: Double = 0.0
for _ in 1...100 {
    balance += 0.1
}
print(balance) // Outputs: 9.9999999999999999
```

Instead of getting the expected *10.0*, the result is slightly off due to accumulated floating-point errors. This can be particularly troublesome in financial applications where accuracy is critical.

## The Correct Approach: Use Decimal or NSDecimalNumber

To avoid the pitfalls of floating-point arithmetic, you should use the `Decimal` type in Swift, which is designed for precise decimal arithmetic. The `Decimal` type can represent numbers exactly as they appear, making it suitable for financial calculations.

### Example: Using Decimal

Here's how you can correctly handle monetary values using `Decimal`:

```swift
let myBalance: Decimal = 12.333
let result = myBalance / 3
print(result) // Outputs: 4.111
```

In this example, the division operation yields the expected result with no loss of precision.

### Converting Double to Decimal

If you need to work with a value initially stored as a `Double`, you can convert it to a `Decimal` using `NSNumber`:

```swift
let doubleValue: Double = 12.333
let decimalValue: Decimal = NSNumber(floatLiteral: doubleValue).decimalValue
let result = decimalValue / 3
print(result) // Outputs: 4.111
```

By converting to `Decimal`, you can ensure that your calculations are accurate and free from the issues associated with floating-point arithmetic.

## Conclusion

When it comes to monetary calculations, accuracy is paramount. The floating-point types, including `Double`, should be avoided due to their inherent imprecision. Instead, use `Decimal` or `NSDecimalNumber` to ensure that your financial calculations are accurate and reliable. This small change can save you from potential bugs and errors in your applications, especially those dealing with money.

