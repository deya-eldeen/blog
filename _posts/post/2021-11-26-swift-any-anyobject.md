---
layout: post
title: "Swift: Any/ AnyObject/ AnyHashable Differences"
date: "2021-11-26"
categories: 
  - "development"
  - "programming"
  - "swift"
tags: 
  - "development"
  - "programming"
  - "swift"
permalink: /swift-any-anyobject
excerpt_separator: <!--more-->
thumbnail: "images/covers/any.jpg"

---

Although in normal cases, you should be specific in defining data types, swift offers **Any**, **AnyObject**, and **AnyHashable**.  
<!--more-->
![](images/covers/any_full.jpg)

**Any** can represent an instance of any type, including functions, instance of a class, struct, or enum, it's more general than **AnyObject**, where **AnyObject** is a protocol all classes indirectly conform to.  
  
**AnyObject** is useful when using Objetive-C / Swift, some parts of Objective-C use this protocol to enhance compatibility with Swift, it's equivelant to 'id' in Objective-C.  
  
so, when to use Any / AnyObject ?  
say you have a dictionary..  
  
let anyStuff: \[Any\] = \[1,"z",3,\[\]\]  
  
If your data will be used only in Swift code, then you should use **Any** because your types (Int, Double, Float, String, Array, and Dictionary) are not objects.

If it will be passed to Objective-C code that expect an **NSDictionary**, then go with **AnyObject**.

**AnyHashable** is a super-type that is defined as a struct, it was introduced in Swift 3 standard library, it's used to bring untyped sets and dictionaries from Objective-C to Swift.

```
public struct Notification : ReferenceConvertible, Equatable, Hashable {
    /// Storage for values or objects related to this notification.
    public var userInfo: [AnyHashable : Any]?
}
```
