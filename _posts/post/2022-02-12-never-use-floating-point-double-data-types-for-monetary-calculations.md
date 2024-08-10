---
layout: post
title: "Never Use Floating-Point / Double Data types for Money Calculations!"
date: "2022-02-12"
categories: 
  - "development"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "programming"
  - "swift"
---

![](images/number-1-2.png)

  
Floating point values, or even (Double precision floating point format), should be avoided when using a currency amount with fractions (like Dollars and cents), in its nature, it cannot be stored exactly as is in memory.

Say we want to store 0.1 dollars, any floating-point data type can not store it as is, it get's stored as an approximation (0.10000000149....).  
  
When doing a series of math operations, some problem can rise, that is called (**loss of significance**), the errors can be amplified and cause trouble 🧐.  
  
the solution is simple, use **NSNumber**

```
let myBalance = 12.333
let decimal: Decimal = NSNumber(floatLiteral: 12.333).decimalValue
let result = decimal / 3
```
