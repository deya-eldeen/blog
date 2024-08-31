---
layout: post
title: "Swift: The Difference Between nil, Nil, NULL, NSNull"
date: "2021-11-27"
permalink: /swift-the-difference-between-nil-nil-null-nsnull
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/nil.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift" 
  - "Objective-C"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Objective-C"
---

As a programmer, you will often need to represent the concept of "nothingness." In Swift and Objective-C, this idea manifests in various forms: `nil`, `Nil`, `NULL`, and `NSNull`. 
<!--more-->

Each of these serves a distinct purpose and is used in different contexts. This blog post will explore the differences between them and provide clarity on when and how to use each one.

{%
 include centered-image.html 
 image_path="images/covers/nil_full.jpg"
 alt_text="" 
 caption=""
%}

## Understanding the Keywords

Data stores can have a value or simply represent nothing. This "nothing" comes in different flavors: `nil`, `Nil`, `NULL`, and `NSNull`, which all fall under the umbrella of "null."

| Keyword | Meaning                                      |
|---------|----------------------------------------------|
| NULL    | Literal null value for C pointers            |
| nil     | Literal null value for Objective-C objects   |
| Nil     | Literal null value for Objective-C classes   |
| NSNull  | Singleton object used to represent null      |

### NULL

`NULL` is a macro defined in C and Objective-C to represent a null pointer to a memory address. It is typically used with non-object pointers, such as pointers to primitive types or structs. In Objective-C, `NULL` is equivalent to `(void *)0`.

### nil

In Objective-C, `nil` is used to represent a null pointer to an object. It is defined as `#define nil NULL`, making it functionally equivalent to `NULL` but specifically for Objective-C object pointers. When you send a message to `nil`, it is a no-op (no operation), meaning it does nothing and returns `0` or `nil` based on the return type.

### Nil

`Nil` is similar to `nil`, but it is used for class pointers instead of object pointers. It represents the absence of a class in Objective-C.

### NSNull

`NSNull` is a class in Foundation framework that acts as a singleton object used to represent null values in collection objects like `NSArray`, `NSDictionary`, and `NSSet`, which do not allow `nil` values. For example, if you need to insert a null value in an `NSArray`, you can use `[NSNull null]`.

## Swift and Objective-C Interoperability

In Swift, you will not directly deal with `NULL` or `Nil`. However, understanding these concepts is crucial when working with Objective-C code or when bridging between Swift and Objective-C.

Consider the following Objective-C code:

```objectivec
// Machine.h

#import <Foundation/Foundation.h>
@interface Machine : NSObject
@property (strong, nonatomic) id serialNumber;
- (void) summary;
@end
```

```objectivec
// Machine.m

#import <Foundation/Foundation.h>
#import "Machine.h"

@implementation Machine
- (void) summary {
    NSLog(@"Initializing Machine");
    NSString *label1 = @"label1";
    NSString *label2 = nil;
    NSString *label3 = [NSNull null];
    NSString *label4 = Nil;
    NSString *label5 = NULL;
    NSLog(@"Label1 = %@",label1);
    NSLog(@"Label2 = %@",label2);
    NSLog(@"Label3 = %@",label3);
    NSLog(@"Label4 = %@",label4);
    NSLog(@"Label5 = %@",label5);
}
@end
```

After preparing the bridging header, you can create and interact with `Machine` objects in Swift:

```swift
let OC_Machine = Machine()
OC_Machine.summary()
OC_Machine.serialNumber = 21
OC_Machine.serialNumber = nil
OC_Machine.serialNumber = NSNull()
//OC_Machine.serialNumber = Nil
//OC_Machine.serialNumber = NULL
print(OC_Machine.serialNumber)
```

The commented lines will not compile in Swift, but they would work in Objective-C. The output of this code is:

```
Label1 = label1  
Label2 = (null)  
Label3 = <null>  
Label4 = (null)  
Label5 = (null)  
Optional(<null>)  
```

## Summary of Key Points

- `NULL` is used for non-object pointers in C and Objective-C.
- `nil` is used for object pointers in Objective-C.
- `Nil` is used for class pointers in Objective-C.
- `NSNull` is a singleton used to represent null values in collections that do not allow `nil`.

In Swift, `nil` is not a pointer but the absence of a value of a specific type. It's essential to understand these differences, especially when working on projects that involve both Swift and Objective-C.

> In Objective-C, `nil` is a pointer to a non-existent object. In Swift, `nil` is the absence of a value.

> `NULL` and `nil` are equal to each other, but `nil` is an object value while `NULL` is a generic pointer value (`(void*)0`). `[NSNull null]` is an object that's meant to stand in for `nil` in situations where `nil` isn't allowed, such as in `NSArray`.
