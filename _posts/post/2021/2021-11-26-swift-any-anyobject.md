---
layout: post
title: "Understanding Swift: Differences Between Any, AnyObject, and AnyHashable"
date: "2021-11-26"
last_modified_at: "2024-09-08"
permalink: /swift-any-anyobject/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/any.webp"
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

When working with Swift, one of the key decisions you’ll often face is how to represent data types. While specificity in defining data types is generally encouraged, Swift offers three flexible type options: `Any`, `AnyObject`, and `AnyHashable`. 

Understanding when and how to use these types is crucial for developing robust and interoperable Swift applications.  

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/any_full.webp"
 alt_text="A conceptual image representing Swift type systems." 
 caption="Exploring Swift's Flexible Type System"
 width="960" 
 height="1568"
%}

## Introduction to Any, AnyObject, and AnyHashable

Swift is a strongly typed language, meaning that every variable, constant, or expression must have a clearly defined type. However, there are situations where the exact type might not be known until runtime, or where flexibility in type is required. This is where `Any`, `AnyObject`, and `AnyHashable` come into play.

### Any

The `Any` type represents an instance of any type at all, including `function` types, `class` instances, `struct`s, and `enum`s. It’s the most general type in Swift, allowing you to work with values without needing to know their specific types in advance.

```swift
let mixedArray: [Any] = [1, "Hello", 3.14, [1, 2, 3]]
```

In this example, `mixedArray` can store any combination of types, from integers to strings and arrays. This can be particularly useful in scenarios where type flexibility is essential, but it should be used sparingly due to the loss of type safety.

#### Real-World Use Cases for Any in Swift

1. Handling Mixed-Type Data Collections
- Use `Any` to create an array that holds various data types, which is useful for data parsing from APIs.
  
```swift
  var things: [Any] = []
  things.append(0)                // Int
  things.append(3.14)             // Double
  things.append("Hello, World!")  // String
  things.append((3.0, 5.0))       // Tuple
```

2. Dynamic Function Handling
Store function types in a collection, allowing for dynamic function calls.

```swift
let functions: [Any] = [
    { (name: String) -> String in "Hello, $$name)" },
    { (x: Int) -> Int in x * 2 }
]
```

or this detailed Example 

```swift
protocol AnyFunction {
    func call(with input: Any) -> Any
}

let functions: [AnyFunction] = [
    AnyFunctionWrapper { (name: String) -> String in "Hello, \(name)" },
    AnyFunctionWrapper { (x: Int) -> Int in x * 2 }
]

struct AnyFunctionWrapper: AnyFunction {
    private let _call: (Any) -> Any

    init<T, R>(_ function: @escaping (T) -> R) {
        _call = { input in
            if let typedInput = input as? T {
                return function(typedInput)
            }
            return "Invalid input type"
        }
    }

    func call(with input: Any) -> Any {
        return _call(input)
    }
}

let greetingResult = functions[0].call(with: "Alice")
print(greetingResult) // Output: Hello, Alice

let doublingResult = functions[1].call(with: 5)
print(doublingResult) // Output: 10

let invalidResult = functions[0].call(with: 42)
print(invalidResult) // Output: Invalid input type
```

3. Interfacing with Objective-C APIs
Use Any to handle untyped objects returned by Objective-C methods, facilitating seamless interaction.

4. Generic Programming
Accept or return any type in generic programming, simplifying function signatures when specific types are not essential.

5. Temporary Data Structures
Build temporary data structures for algorithms, allowing storage of various types without creating multiple collections.

Caution in Usage:
> While `Any` offers flexibility, it can lead to loss of type safety and increased complexity. Use more specific types whenever possible to maintain clarity and safety in your codebase.

### AnyObject

`AnyObject` is a protocol that all `class` types implicitly conform to. It’s used when you need to work specifically with instances of classes rather than value types like `struct`s or `enum`s. `AnyObject` is commonly used in scenarios where Swift interacts with Objective-C, especially because Objective-C types are generally class-based.

```swift
let objectArray: [AnyObject] = [NSString(string: "Hello"), NSNumber(value: 42)]
```

Here, `objectArray` holds instances that are guaranteed to be `class` types. This makes `AnyObject` a safer option when you’re dealing with `class` instances, especially in mixed-language projects involving both Swift and Objective-C.

#### Real-World Use Cases for AnyObject in Swift

`AnyObject` allows you to work with instances of any class type. Here are some real-world scenarios where it can be beneficial:

1. Interacting with Objective-C `API`s
- Use `AnyObject` to handle untyped objects from Objective-C methods and properties, facilitating seamless interaction with these `API`s.

2. Parsing Mixed-Type `JSON` Data
- Store parsed `JSON` data containing a mix of types (strings, numbers, booleans) in a flexible way using `AnyObject`.

3. Creating Heterogeneous Collections
- Create arrays or dictionaries that hold instances of different class types, allowing for storage of diverse objects together.

4. Bridging Objective-C Classes to Swift
- Use `AnyObject` for properties, method parameters, and return values when bridging Objective-C classes, enabling interaction without knowing specific types.

5. Implementing Dynamic Behavior
- Leverage `AnyObject` to call any Objective-C method, creating flexible and extensible `API`s.

Note:
> While `AnyObject` is useful, it's important to prioritize type safety and performance by using more specific types whenever possible.

### AnyHashable

`AnyHashable` is a type in Swift that allows you to store values of different types that conform to the `Hashable` protocol in a single collection. This is particularly useful when you need a heterogeneous collection of hashable types, such as when using a dictionary or a set.

#### Key Features

- **Type Erasure**: `AnyHashable` provides a way to erase the specific type of a hashable value while still maintaining its hashability.
- **Interoperability**: It can be used in collections like `Set` or `Dictionary` where the key types might differ.

#### Example Usage

Here’s a simple example demonstrating how to use `AnyHashable`:

```swift
let intKey: AnyHashable = AnyHashable(42)
let stringKey: AnyHashable = AnyHashable("Hello")

let dictionary: [AnyHashable: String] = [
    intKey: "This is an integer key",
    stringKey: "This is a string key"
]

for (key, value) in dictionary {
    print("\(key): \(value)")
}
```

## The Difference Between Any and AnyObject in Swift

`Any` and `AnyObject` are two special types in Swift used for type erasure, allowing you to work with values of unknown or mixed types. Here are the key differences:

### Any
- Represents any type, including value types (structs, enums) and reference types (classes).
- Can be used to store heterogeneous collections of values.
- Example usage:
```swift
let mixedArray: [Any] = [1, "Hello", true, 2.0]
for item in mixedArray {
    switch item {
    case let x as Int:
        print("Int: \(x)")
    case let x as String:
        print("String: \(x)")
    case let x as Bool:
        print("Bool: \(x)")
    case let x as Double:
        print("Double: \(x)")
    default:
        print("Unknown type")
    }
}
```

### AnyObject
Represents any instance of a class, equivalent to id in Objective-C.
Only allows reference types (classes) and is useful when you specifically want to work with class instances.
Example usage:

```swift
class Car {}
class Song {}

let objectsArray: [AnyObject] = [Car(), Car(), Song()]
for item in objectsArray {
    if let car = item as? Car {
        print("Car: $$car)")
    } else if let song = item as? Song {
        print("Song: $$song)")
    } else {
        print("Unknown type")
    }
}
```
## When to Use Any vs. AnyObject

- Use `Any`:
  - When your collection or variable needs to handle multiple types, including value types like `Int`, `String`, and `Array`.
  - When your data will be used exclusively in Swift code, allowing you to include both value and reference types.
  
- Use `AnyObject`:
  - When dealing with APIs that expect class types, such as when interfacing with Objective-C code.
  - When you specifically need to work with reference types.
  - When your data will interact with Objective-C code or when you specifically need to constrain your data to `class` types.

## AnyHashable

As mentioned earlier, `AnyHashable` is a type-erased wrapper that can hold any value conforming to the `Hashable` protocol. It allows you to store heterogeneously-typed values in collections that require a hashable type, such as sets or dictionaries.

```swift
import Foundation

let anyHashableDict: [AnyHashable: Any] = [
    "key1": "value1",
    42: "value2",
    UUID(): "value3"
]

print(anyHashableDict)
```

In this example, `anyHashableDict` can have keys of different types, as long as those types conform to the `Hashable` protocol. `AnyHashable` is particularly useful when dealing with untyped sets or dictionaries coming from Objective-C, as it provides the necessary flexibility while maintaining type safety within Swift.

<!-- #### Practical Example: Notification Structure

A common use of `AnyHashable` is in the `Notification` structure, which is frequently used in iOS development to manage broadcasted messages within an app.

```swift
public struct Notification : ReferenceConvertible, Equatable, Hashable {
    /// Storage for values or objects related to this notification.
    public var userInfo: [AnyHashable : Any]?
}
```

In this context, `AnyHashable` allows the `userInfo` dictionary to store keys of any hashable type, providing the necessary flexibility for different kinds of data to be passed along with the notification. -->

## Conclusion

Understanding when to use `Any`, `AnyObject`, and `AnyHashable` can greatly enhance your flexibility and interoperability in Swift development. While these types provide powerful tools for working with a wide range of data, it's important to use them judiciously to maintain the clarity and safety of your code. By carefully choosing the appropriate type based on the needs of your application, you can ensure that your Swift code is both robust and adaptable.
