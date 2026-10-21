---
layout: post
hidden: true
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
thumbnail: "images/covers/swift_property_wrappers_thumbnail.webp"
thumbnail_ready: true
---

If you've used SwiftUI, you've used property wrappers: `@State`, `@Binding`, `@Environment`, `@AppStorage`. A property wrapper packages up the logic for **how** a value is stored and accessed, so you can reuse it with a single `@` attribute instead of repeating getter and setter code everywhere. Understanding what the compiler generates for them also explains `$` prefixes, underscore-prefixed properties, and a classic concurrency bug.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_property_wrappers_thumbnail.webp"
 alt_text="A property value enclosed by a wrapper that adds access behavior"
 caption="Property Wrappers in Swift"
 width="640"
 height="400"
%}

## The problem

Say several properties must always stay within a range. Without wrappers, each one needs its own backing storage and clamping code:

```swift
struct VolumeManual {
    private var storedLevel = 0

    var level: Int {
        get { storedLevel }
        set { storedLevel = min(max(newValue, 0), 100) }
    }
}
```

Fine once, tedious the tenth time, and easy to get subtly wrong (forgetting to clamp the initial value, for example).

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

The property's initial value (`= 50`) is passed as the `wrappedValue:` argument, and the arguments in parentheses follow it. That's why the initializer's first parameter must be named `wrappedValue`.

## What the compiler generates

`@Clamped(0...100) var volume = 50` is rewritten into roughly this:

```swift
struct SpeakerExpanded {
    private var _volume = Clamped(wrappedValue: 50, 0...100)

    var volume: Int {
        get { _volume.wrappedValue }
        set { _volume.wrappedValue = newValue }
    }
}
```

Two things follow from that:

- The wrapper instance itself is stored in a hidden **underscore-prefixed** property, `_volume`. It's `private`, but you can use it inside the type, for example to call a method on the wrapper.
- Reading and writing the property call the wrapper's getter and setter, so **every access runs the wrapper's code**. Keep it cheap.

## Generic wrappers

Most useful wrappers work for many types. Here's `Clamped` for anything `Comparable`:

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
    @Bounded("A"..."F") var grade: Character = "C"
}

var thermostat = Thermostat()
thermostat.target = 40
print(thermostat.target)   // 28.0
```

## Projected values: `$property`

A wrapper can expose extra API through a `projectedValue`, accessed with a `$` prefix. SwiftUI uses this to turn `@State var name` into the binding `$name`. Here's a wrapper that remembers whether its value was ever changed:

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

struct SignUpForm {
    @Tracked var email = ""
}

var form = SignUpForm()
print(form.$email)       // false
form.email = "sam@example.com"
print(form.$email)       // true
```

The projected value can be anything: a `Bool`, a binding, a publisher (`@Published` projects an `AnyPublisher`-like publisher), or the wrapper itself, which gives callers access to its methods.

## A real-world wrapper: UserDefaults

Storing settings is the classic use case:

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
print(Preferences.fontSize)   // 19
```

Note this only works for types `UserDefaults` can store directly (strings, numbers, booleans, dates, data, and arrays or dictionaries of them). SwiftUI's `@AppStorage` is a polished version of the same idea that also updates views.

## Wrappers on local variables and parameters

Since Swift 5.4, wrappers work on **local variables**, and since Swift 5.5 on **function and closure parameters**:

```swift
@propertyWrapper
struct Trimmed {
    private var value = ""

    init(wrappedValue: String) {
        value = wrappedValue.trimmingCharacters(in: .whitespaces)
    }

    var wrappedValue: String {
        get { value }
        set { value = newValue.trimmingCharacters(in: .whitespaces) }
    }
}

func makeGreeting() -> String {
    @Trimmed var name = "   Sam   "
    return "Hello, \(name)!"
}

func setVolume(@Clamped(0...100) _ level: Int) {
    print("Volume set to \(level)")
}

print(makeGreeting())   // Hello, Sam!
setVolume(250)          // Volume set to 100
```

## Composing wrappers

You can stack wrappers: `@A @B var value`. The compiler nests them, so the property is stored as `A(wrappedValue: B(wrappedValue: initialValue))`: the **outer** wrapper's `wrappedValue` is the **inner wrapper**, not the final value. That means the outer wrapper must be generic over what it wraps, and two simple wrappers that both expect a `String` can't be stacked. In practice, composition works best with generic wrappers designed for it, and a single, purpose-built wrapper is often clearer.

## The thread-safety trap

A popular idea is an `@Atomic` wrapper that protects a value with a lock. It looks safe:

```swift
@propertyWrapper
final class Atomic<Value> {
    private var value: Value
    private let lock = NSLock()

    init(wrappedValue: Value) {
        value = wrappedValue
    }

    var wrappedValue: Value {
        get { lock.lock(); defer { lock.unlock() }; return value }
        set { lock.lock(); defer { lock.unlock() }; value = newValue }
    }

    var projectedValue: Atomic<Value> { self }

    func mutate(_ transform: (inout Value) -> Void) {
        lock.lock(); defer { lock.unlock() }
        transform(&value)
    }
}

final class HitCounter {
    @Atomic var count = 0
}

let racy = HitCounter()
DispatchQueue.concurrentPerform(iterations: 100_000) { _ in
    racy.count += 1                    // ❗️ get, then set: two separate locked operations
}
print(racy.count < 100_000)            // true: in one run it was just 12115

let safe = HitCounter()
DispatchQueue.concurrentPerform(iterations: 100_000) { _ in
    safe.$count.mutate { $0 += 1 }     // read-modify-write under one lock
}
print(safe.count)                      // 100000
```

`count += 1` calls the getter (locked), adds one, then calls the setter (locked again). Between the two, another thread can do the same, and one increment is lost. Each access is atomic, but the **combination** isn't. The fix is an operation that does the whole read-modify-write under one lock, exposed here through the projected value. For new code, an actor is usually a cleaner way to protect state.

## Limitations and tips

- Wrapped properties can't be `lazy`, `weak`, or `unowned`, and protocols can't require a property to use a particular wrapper.
- A wrapper only sees **its own value**, not the instance that contains it (the underscored `_enclosingInstance` hook exists, but isn't official API). For behavior that needs to see a whole type, like observing every property, macros are the better tool, which is why `@Observable` (Swift 5.9) is a macro rather than a property wrapper.
- Keep wrapper logic cheap: it runs on every access.
- Choose names that say what happens: a reader should guess what `@Clamped` does without looking it up.

## Interview questions

**What does the compiler generate for a wrapped property?**
A private stored property `_name` holding the wrapper instance, and a computed property `name` that forwards to `_name.wrappedValue`; plus `$name` for the `projectedValue`, if the wrapper defines one.

**What is a projected value?**
Extra API a wrapper exposes through the `$` prefix, like SwiftUI's `$state` bindings or `@Published`'s publisher.

**Why isn't `@Atomic var count; count += 1` thread-safe?**
`+=` performs a separate get and set, each locked individually; another thread can interleave between them. The whole read-modify-write needs one lock.

**Why is `@Observable` a macro and not a property wrapper?**
Property wrappers only see one property's value; observation needs to transform every property of a type, which requires a macro.

## Summary

- A `@propertyWrapper` type with a `wrappedValue` packages reusable get/set logic; `init(wrappedValue:)` receives the initial value.
- The compiler stores the wrapper in a hidden `_property` and forwards every access to it.
- `projectedValue` exposes extra API through `$property`, like SwiftUI bindings.
- Wrappers can be generic, configured with arguments, and applied to local variables and parameters.
- A locked wrapper doesn't make compound operations atomic; use a dedicated mutate operation or an actor.
