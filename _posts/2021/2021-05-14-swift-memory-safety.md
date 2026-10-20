---
layout: post
title: "Memory Safety in Swift: Exclusive Access"
date: "2021-05-14"
last_modified_at: "2021-05-14"
permalink: /swift-memory-safety/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Memory Management"
  - "Safety"
---

Swift prevents most memory errors before your code even runs: variables must be initialized before use, arrays check their bounds, and integers check for overflow. One rule is less well known, and it explains some confusing compiler errors and runtime crashes: **the law of exclusivity.** Two accesses to the same variable must not overlap if one of them is a write.

<!--more-->

## Swift's built-in safety nets

Before looking at exclusivity, here's what Swift already checks for you:

```swift
let numbers = [1, 2, 3]
// numbers[5]               // crash: Index out of range, never silently reading other memory

let big = Int.max
// let overflow = big + 1   // crash: arithmetic overflow, instead of wrapping around
let wrapped = big &+ 1      // explicit wrapping operator when you really want it

var name: String
// print(name)              // compile error: variable used before being initialized
name = "Swift"
print(name, wrapped)
```

Crashing on a bug sounds harsh, but it's far better than corrupting memory and failing mysteriously somewhere else.

## What "access" means

Every read or write of a variable is an **access**. Most are instantaneous. Some last longer:

- an `inout` parameter is accessed for the **whole duration** of the function call,
- a `mutating` method accesses `self` for its whole duration.

A **conflict** happens when two accesses to the same memory overlap in time, at least one is a write, and they aren't both atomic.

## Conflicting access with `inout`

```swift
var stepSize = 1

func increment(_ number: inout Int) {
    number += stepSize          // reads stepSize while `number` is being written
}

increment(&stepSize)            // crash: simultaneous accesses to stepSize
```

`number` and `stepSize` are the same variable here. The write access to `number` lasts the whole call, and inside it the function reads `stepSize`, an overlapping access to the same memory. Swift detects this at runtime and stops with *"Simultaneous accesses to …, but modification requires exclusive access."*

The fix is to make an explicit copy first:

```swift
var copyOfStepSize = stepSize
increment(&copyOfStepSize)
stepSize = copyOfStepSize
```

## Passing the same variable twice

The compiler catches the most obvious version at compile time:

```swift
func balance(_ x: inout Int, _ y: inout Int) {
    let sum = x + y
    x = sum / 2
    y = sum - x
}

var playerOneScore = 42
var playerTwoScore = 30
balance(&playerOneScore, &playerTwoScore)    // fine: two different variables
balance(&playerOneScore, &playerOneScore)    // ❌ inout arguments are not allowed to alias each other
```

## `self` in mutating methods

A mutating method has write access to `self` for its whole duration, so passing a property of `self` back into it can conflict:

```swift
struct Player {
    var health = 10

    mutating func shareHealth(with teammate: inout Player) {
        balance(&teammate.health, &health)
    }
}

var oscar = Player()
var maria = Player()
oscar.shareHealth(with: &maria)     // fine: different players
oscar.shareHealth(with: &oscar)     // ❌ inout arguments are not allowed to alias each other
```

## Properties of structs and tuples

Accessing two different properties of a struct at the same time is usually safe when the compiler can prove they don't overlap, as with a local variable:

```swift
func pairUp() {
    var holly = Player(health: 10)
    var tupleValue = (a: 1, b: 2)
    balance(&tupleValue.a, &tupleValue.b)   // fine: local, non-overlapping
    print(holly.health, tupleValue)
    holly.health = 5
}
```

For global variables, class properties, and computed properties, the compiler can't prove that. Accessing one part counts as accessing the whole value, so the same call on a global tuple compiles but stops at runtime with the "Simultaneous accesses" error.

## Why Swift insists on this

Exclusivity makes code easier to reason about: when you modify a variable, you know nothing else is reading or writing it halfway through. It also enables optimizations, because the compiler can assume `inout` parameters don't alias each other. And it's a foundation for Swift's concurrency checking, where overlapping accesses from different threads would be data races.

## Unsafe code opts out

Types with `Unsafe` in their names, like `UnsafeMutablePointer` and `UnsafeBufferPointer`, skip these checks. When you use them, you're responsible for lifetimes, bounds, and exclusivity yourself. Keep that code small and well-tested, and run it with Xcode's Address Sanitizer to catch mistakes.

## Summary

- Swift checks initialization, bounds, and overflow, and crashes instead of corrupting memory.
- The law of exclusivity: overlapping accesses to the same variable are not allowed if one is a write.
- `inout` parameters and `mutating` methods hold access for their whole duration.
- Conflicts are caught at compile time when possible, and at runtime otherwise; unsafe pointers opt out.
