---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_memory_safety_thumbnail.webp"
thumbnail_ready: true
---

Swift is designed so that, unless you explicitly opt out, your code can't read uninitialized memory, run off the end of a buffer, or use an object after it's freed. Most of those protections are famous: optionals, bounds checks, ARC. One is less well known, and it explains some confusing compiler errors and runtime crashes: **the law of exclusivity.** Two accesses to the same variable must not overlap if one of them is a write.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_memory_safety_thumbnail.webp"
 alt_text="A write access holding an exclusive gate while other memory accesses wait"
 caption="Memory Safety in Swift: Exclusive Access"
 width="640"
 height="400"
%}

## Swift's safety nets

Before diving into exclusivity, here's the full picture of what Swift checks for you:

| Danger | Swift's protection |
|---|---|
| Reading uninitialized memory | **Definite initialization**: the compiler rejects any read before a write |
| Null pointer dereferences | **Optionals**: `nil` is only possible where the type says so |
| Buffer overflows | **Bounds checks** on arrays, strings, and unsafe buffer pointers in debug builds |
| Integer overflow | **Overflow checks**: arithmetic traps instead of silently wrapping |
| Use after free | **ARC**: objects live as long as they're referenced |
| Conflicting accesses | **Exclusivity enforcement**, at compile time and at runtime |

```swift
let numbers = [1, 2, 3]
// numbers[5]                  // traps: Index out of range, instead of reading other memory

let big = Int.max
// let overflow = big + 1      // traps: arithmetic overflow, instead of wrapping to a negative number
let wrapped = big &+ 1         // explicit wrapping operator when you really want it

var name: String
// print(name)                 // compile error: variable 'name' used before being initialized
name = "Swift"
print(name, wrapped)
```

Crashing on a bug sounds harsh, but it's the safe outcome. Silently continuing with corrupted memory leads to bugs that surface much later, far from their cause, or to security vulnerabilities. A crash points at the exact line.

## What "access" means

Every read or write of a variable, property, or array element is an **access**. Most accesses are **instantaneous**: nothing else can happen while `x += 1` runs. Some accesses last longer, spanning the execution of other code:

- an **`inout` parameter** is accessed for the whole duration of the function call,
- a **`mutating` method** has write access to `self` for its whole duration,
- a **closure** accessing an `inout` parameter extends that access while it runs.

A **conflict** happens when two accesses to the same memory **overlap in time**, at least one of them is a **write**, and they aren't both atomic.

## Conflicts with `inout`

```swift
var stepSize = 1

func increment(_ number: inout Int) {
    number += stepSize          // reads stepSize while `number` is being written
}

// increment(&stepSize)        // traps: simultaneous accesses to stepSize
```

Here `number` and `stepSize` are the same variable. The write access to `number` lasts for the whole call, and inside it the function reads `stepSize`: an overlapping read of the same memory. Swift detects this at runtime and stops with *"Simultaneous accesses to …, but modification requires exclusive access."*

The fix is to make the copy explicit:

```swift
var copyOfStepSize = stepSize
increment(&copyOfStepSize)
stepSize = copyOfStepSize
print(stepSize)   // 2
```

## Passing the same variable twice

When the conflict is visible locally, the compiler catches it before your code ever runs:

```swift
func balance(_ x: inout Int, _ y: inout Int) {
    let sum = x + y
    x = sum / 2
    y = sum - x
}

var playerOneScore = 42
var playerTwoScore = 30
balance(&playerOneScore, &playerTwoScore)    // fine: two different variables
// balance(&playerOneScore, &playerOneScore) // ❌ inout arguments are not allowed to alias each other
```

### The array-swap trap

You'll meet this one in real code. Swapping two array elements with the global `swap` function doesn't compile:

```swift
func shuffleFirstAndLast() {
    var deck = [1, 2, 3]
    // swap(&deck[0], &deck[2])    // ❌ overlapping accesses to 'deck', but modification requires exclusive access
    deck.swapAt(0, 2)              // ✅ the method designed for this
    print(deck)                    // [3, 2, 1]
}

shuffleFirstAndLast()
```

Each `&deck[i]` is a write access to the **whole array** (the array might need to copy its buffer before writing, which would affect every element). Two of them overlap. `swapAt(_:_:)` performs the swap inside one mutating method, with a single access.

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
// oscar.shareHealth(with: &oscar)  // ❌ inout arguments are not allowed to alias each other
```

## Properties of structs and tuples

Accessing two different stored properties of the same struct or tuple at the same time is safe **if the compiler can prove the accesses don't overlap**. That's possible for local variables that aren't captured by escaping closures:

```swift
func pairUp() {
    var tuple = (a: 1, b: 2)
    balance(&tuple.a, &tuple.b)   // fine: a local, and a and b don't overlap
    print(tuple)                  // (a: 1, b: 2): the sum 3, split as evenly as integers allow
}

pairUp()
```

For **global variables**, **class properties**, and properties reached through computed properties, the compiler can't prove that. Accessing one stored property counts as accessing the whole value, so the same call on a global tuple compiles but stops at runtime with the "Simultaneous accesses" error.

## Static and dynamic enforcement

Swift enforces exclusivity in two ways:

- **Statically**, at compile time, for local variables and `inout` parameters where all accesses are visible. These produce compiler errors like the ones above.
- **Dynamically**, at runtime, for globals, class properties, and variables captured by escaping closures. The runtime tracks active accesses and traps on a conflict.

Since Swift 5, dynamic checks are enabled in **release builds** too, not just debug builds. Their cost is small, and the compiler removes checks it can prove unnecessary. (Building with `-enforce-exclusivity=unchecked` disables them, which is rarely a good idea.)

## Why Swift insists on exclusivity

1. **Reasoning.** When you modify a variable, you know nothing else is reading or writing it halfway through. That makes `inout` and `mutating` behave like "take this value, change it, give it back", with no surprises.
2. **Performance.** The compiler can assume `inout` parameters don't alias each other, which enables optimizations C compilers can only make with `restrict`.
3. **Copy-on-write.** Collections can safely check "am I the only owner of my buffer?" before mutating, because no other access can be in flight.

## Unsafe code opts out

Types with `Unsafe` in their names, like `UnsafePointer`, `UnsafeMutableBufferPointer`, and `Unmanaged`, deliberately skip Swift's safety checks. When you use them, you're responsible for lifetimes, bounds, initialization, and exclusivity yourself. The most important rule is to never let a pointer escape the scope that created it:

```swift
let values = [10, 20, 30]

let total = values.withUnsafeBufferPointer { buffer -> Int in
    var sum = 0
    for value in buffer {         // the pointer is only valid inside this closure
        sum += value
    }
    return sum
}
print(total)   // 60
```

Keep unsafe code small, wrapped in safe APIs, and well tested. Xcode's Address Sanitizer is the tool to catch mistakes in it.

## What Swift (as of 5.4) doesn't prevent

**Data races between threads.** Exclusivity enforcement is about overlapping accesses on one thread, and the dynamic checks don't reliably catch accesses from two threads at once. Two threads appending to the same array is still a crash waiting to happen. Use a serial `DispatchQueue` or a lock to protect shared mutable state, and run Xcode's **Thread Sanitizer** to find races.

## Common pitfalls

- **`swap(&array[i], &array[j])`**: use `swapAt`.
- **Passing a property of `self` to an `inout` parameter inside a mutating method**: copy it into a local first.
- **Reading a global inside a function that receives the same global as `inout`**: pass the value instead, or restructure.
- **Escaping unsafe pointers** from `withUnsafe…` closures.

## Interview questions

**What is the law of exclusivity?**
Two accesses to the same memory must not overlap if at least one is a write. Swift enforces it at compile time where possible and at runtime otherwise.

**Why doesn't `swap(&array[0], &array[1])` compile?**
Each `&array[i]` is a write access to the whole array, so the two accesses overlap. `swapAt` does the swap within a single access.

**Are exclusivity checks only in debug builds?**
No. Since Swift 5, runtime exclusivity checks are enabled in release builds as well.

**Does exclusivity enforcement prevent data races?**
Not reliably. It targets overlapping accesses within a thread; for threads, use synchronization and Thread Sanitizer.

## Summary

- Swift checks initialization, optionals, bounds, overflow, and object lifetimes, and traps instead of corrupting memory.
- The law of exclusivity: overlapping accesses to the same variable aren't allowed if one is a write.
- `inout` parameters and `mutating` methods hold access for their whole duration.
- Conflicts are caught at compile time when visible, and at runtime otherwise, in release builds too.
- Unsafe APIs opt out of all of this; keep them small, scoped, and tested.
