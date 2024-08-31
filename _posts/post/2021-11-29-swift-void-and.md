---
layout: post
title: "Swift: The Difference Between Void and ()"
date: "2021-11-29"
categories: 
permalink: /swift-void-and
excerpt_separator: <!--more-->
thumbnail: "images/covers/void.jpg"
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

Void is a data type that is common across a lot of programming languages, in Swift's standard library, it's simply an empty tuple, it's used for for functions that return nothing, when defining a function, if you don't specify a return type, you get a function that return Void, this is how it's defined in standard library.
<!--more-->

{%
 include centered-image.html 
 image_path="images/covers/void_full.jpg"
 alt_text="" 
 caption=""
%}

```
public typealias Void = ()
```

You use Void to declare the type of a function, method, or closure, Keep in mind 🤓  
that () can mean two things:  
  
`()` can be a type - the empty tuple type, **which is the same as `Void`.**  
`()` can be a value - an empty tuple, **which is the same as `Void()`.**
