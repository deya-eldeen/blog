---
layout: post
title: "Swift Root/Base Class & NSObject"
date: "2021-11-16"
permalink: /swift-root-class-nsobject
excerpt_separator: <!--more-->
---

"Base class" is usually interchangeable with "superclass" (the normal ObjC terminology) when talking about a particular object's design and inheritance.
<!--more-->

A root class in ObjC is a class which has no superclass, it is the absolute base class from which other classes are derived.  
  
The standard root class for almost all objects in the Cocoa frameworks is `NSObject`, although there are others.  
  
In Objective-C, the root of all classes is **NSObject** that happen to be part of the Foundation framework.  
  
All objects in a Cocoa/Cocoa-Touch application inherit from NSObject,  
  
In pure Swift, a root class is not necessary though.  
  
Swift classes doesn't run on top of Obj-C; they are not translated into Obj-C behind the scenes. They are just compiled by the same compiler which allows them to interoperate with each other. That's really important to understand. That's why `@objc` must be sometimes added to provide consistency with Obj-C protocols/classes.  
  
Swift classes do not inherit from a universal base class. Classes you define without specifying a superclass automatically become base classes for you to build upon.  
  
Any class that doesn’t inherit from another class is known as a _base class_.
