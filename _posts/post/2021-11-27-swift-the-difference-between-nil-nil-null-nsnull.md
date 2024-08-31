---
layout: post
title: "Swift: the difference between nil, Nil, NULL, NSNull"
date: "2021-11-27"
permalink: /swift-the-difference-between-nil-nil-null-nsnull
excerpt_separator: <!--more-->
thumbnail: "images/covers/nil.jpg"
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

As a programmer, sometimes you will need to define "nothingness"... 🧐  
<!--more-->
{%
 include centered-image.html 
 image_path="images/covers/nil_full.jpg"
 alt_text="" 
 caption=""
%}

Data stores can have a value, or simply be nothing, this **nothing** comes in different flavors (nil, Nil, Null, NSNull) which all came to be called "null".

<figure>

<table><tbody><tr><td></td><td>Meaning</td></tr><tr><td>NULL</td><td>literal null value for C pointers</td></tr><tr><td>nil</td><td>literal null value for Objective-C objects</td></tr><tr><td>Nil</td><td>literal null value for Objective-C classes</td></tr><tr><td>NSNull</td><td>singelton object used to represent null</td></tr></tbody></table>

<figcaption>

null types

</figcaption>



</figure>

  
In Swift, you will not be able to deal directly with NULL and Nil,  
say you have this code in Objective C

```
// Machine.h
#import <Foundation/Foundation.h>

@interface Machine : NSObject

@property (strong, nonatomic) id serialNumber;

- (void) summary;

@end

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
    NSLog(@"Label4 = %@",label5);

}

@end
```

after preparing the bridging header, you will be able to create Machine Objects

```
let OC_Machine = Machine()
OC_Machine.summary()
OC_Machine.serialNumber = 21
OC_Machine.serialNumber = nil
OC_Machine.serialNumber = NSNull()
//OC_Machine.serialNumber = Nil
//OC_Machine.serialNumber = Null
print(OC_Machine.serialNumber)
```

As you can see, the commented lines will not compile in swift, but should be running ok in Objective C, you will see this output  
  
Label1 = label1  
Label2 = (null)  
Label3 = <null>  
Label4 = (null)  
Label4 = (null)  
Optional(<null>)  
  
\[NSNull null\] is a wrapper for nil  
  
`nil` is defined as : `#define nil NULL` and is Objective C equivalent for C `NULL`  
  
Nil is for object pointers, NULL is for non pointers, Null and Nil both defined to be equal to the value zero.  
  
`NULL` is a `void *`, `nil` is an `id`, and `Nil` is a Class pointer, **NULL** is used for **non-object pointer** (like a C pointer) in Objective-C. Like **nil** , **NULL** got no value nor address (used to check if a struct is empty).  
  
keep in mind:

> In Objective-C: nil is a pointer to a non-existent object.  
> In Swift: nil is not a pointer, it's the absence of a value of a certain type.

> NULL and nil are equal to each other, but nil is an object value while NULL is a generic pointer value (`(void*)0`, to be specific). `[NSNull null]` is an object that's meant to stand in for nil in situations where nil isn't allowed. For example, you can't have a nil value in an NSArray. So if you need to represent a "nil", you can use `[NSNull null]`.
