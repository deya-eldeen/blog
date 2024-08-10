---
layout: post
title: "Swift Variables and Constants"
date: "2021-11-14"
categories: 
  - "development"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "programming"
  - "swift"
---

![](images/monitoring.png)

Any meaningful program should contain stores to save data, swift distinguishes between constant and variable pieces of data with let and var keywords, for example, say you have a customer object, their birthdate is a constant, but their balance is a variable, if you declare data as a constant, the compiler will not allow you to have it changed later, even at compile time, this is not only for safety, but constants are generally faster to work with by the processor.

```
class Customer {
	let id = 22034
	let birthdate = "11/11/2011"
	var balance = 109.3
}
```

Constants cannot change after you run your app, they prevent accidental breakage of a value that should not change.
