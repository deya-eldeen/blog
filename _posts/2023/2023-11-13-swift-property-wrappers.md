---
layout: post
title: "Property Wrappers in Swift"
date: "2023-11-13"
last_modified_at: "2023-11-13"
permalink: /swift-property-wrappers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Properties"
  - "SwiftUI"
---

If you've used SwiftUI, you've used property wrappers: `@State`, `@Binding`, `@Environment`. A property wrapper packages up the logic for *how* a property is stored and accessed, so you can reuse it with a single `@` annotation instead of repeating getter and setter code everywhere.

<!--more-->

## The problem

Say several properties must always stay within a range. Without wrappers, each one needs its own clamping code:

```swift
struct VolumeManual {
    private var _level = 0

    var level: Int {
        get { _level }
        set { _level = min(max(newValue, 0), 100) }
    }
}
```

Fine once, tedious the tenth time.

## Writing a property wrapper

A property wrapper is a type marked `@propertyWrapper` with a `wrappedValue` property:

```swift
@propertyWrapper
struct Clamped {
    private var value: Int
    private let range: ClosedRange<Int>

    init(wrappedValue: Int, _ range: ClosedRange<Int>) {
        self.range = range
        self.value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }

    var wrappedValue: Int {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
}
```

Now any property can use it:

```swift
struct Speaker {
    @Clamped(0...100) var volume = 50
    @Clamped(-10...10) var balance = 0
}

var speaker = Speaker()
speaker.volume = 150
print(speaker.volume)    // 100
speaker.balance = -42
print(speaker.balance)   // -10
```

The initial value (`= 50`) is passed as `wrappedValue:`, and the other arguments in parentheses follow it.

## What the compiler generates

`@Clamped(0...100) var volume = 50` is roughly rewritten as:

```swift
struct SpeakerExpanded {
    private var _volume = Clamped(wrappedValue: 50, 0...100)

    var volume: Int {
        get { _volume.wrappedValue }
        set { _volume.wrappedValue = newValue }
    }
}
```

The wrapper instance itself is stored in a hidden property with an underscore prefix, `_volume`, which is accessible inside the type.

## Making it generic

Most wrappers work for many types. Here's `Clamped` for anything `Comparable`:

```swift
@propertyWrapper
struct Bounded<Value: Comparable> {
    private var value: Value
    let range: ClosedRange<Value>

    init(wrappedValue: Value, _ range: ClosedRange<Value>) {
        self.range = range
        self.value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }

    var wrappedValue: Value {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
}

struct Thermostat {
    @Bounded(16.0...28.0) var target = 21.5
}
```

## Projected values: `$property`

A wrapper can expose extra information through a `projectedValue`, accessed with a `$` prefix. SwiftUI uses this to turn `@State var name` into the binding `$name`. Here's a wrapper that remembers whether its value was ever changed:

```swift
@propertyWrapper
struct Tracked<Value> {
    private var value: Value
    private(set) var projectedValue = false     // `$property` returns this

    init(wrappedValue: Value) {
        value = wrappedValue
    }

    var wrappedValue: Value {
        get { value }
        set {
            value = newValue
            projectedValue = true
        }
    }
}

struct Form {
    @Tracked var email = ""
}

var form = Form()
print(form.$email)       // false
form.email = "sam@example.com"
print(form.$email)       // true
```

## A practical wrapper: UserDefaults

A classic real-world use is storing settings:

```swift
@propertyWrapper
struct UserDefault<Value> {
    let key: String
    let defaultValue: Value
    var store: UserDefaults = .standard

    var wrappedValue: Value {
        get { store.object(forKey: key) as? Value ?? defaultValue }
        set { store.set(newValue, forKey: key) }
    }
}

enum Preferences {
    @UserDefault(key: "hasSeenOnboarding", defaultValue: false)
    static var hasSeenOnboarding: Bool

    @UserDefault(key: "fontSize", defaultValue: 17)
    static var fontSize: Int
}

Preferences.fontSize = 19
```

This only works for types `UserDefaults` can store directly (strings, numbers, booleans, dates, data, and arrays or dictionaries of them).

## Wrappers on function parameters

Since Swift 5.5, property wrappers also work on function and closure parameters:

```swift
func setVolume(@Clamped(0...100) _ level: Int) {
    print("Volume set to \(level)")
}

setVolume(250)    // Volume set to 100
```

## Limitations and tips

- Wrapped properties can't be `lazy`, `weak`, or `unowned`, and can't be declared in protocols.
- A wrapper's logic runs on every access, so keep it cheap.
- Wrappers hide behavior behind an `@`. That's the point, but choose clear names: a reader should guess what `@Clamped` does without looking it up.
- For behavior that needs to see the whole type, not just one property, Swift macros are often the better tool. That's why `@Observable` is a macro, not a property wrapper.

## Summary

- A `@propertyWrapper` type with a `wrappedValue` packages reusable get/set logic.
- The compiler stores the wrapper in a hidden `_property` and forwards access to it.
- `projectedValue` exposes extra API through `$property`, like SwiftUI bindings.
- Wrappers can be generic, take configuration arguments, and apply to parameters.
