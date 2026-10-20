---
layout: post
title: "Properties in Swift"
date: "2021-03-19"
last_modified_at: "2021-03-19"
permalink: /swift-properties/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Basics"
  - "Properties"
---

Properties attach values to types. Some store data, some compute it on demand, some react when they change, some wait until they're first used, and some belong to the type itself rather than to any instance. Each kind has rules that are easy to get subtly wrong, like when observers fire, why `lazy` isn't thread-safe, and why `append` on an array property triggers `didSet`. This article covers all of them.

<!--more-->

## Stored properties

A stored property is a value kept as part of an instance. `var` properties can change after initialization; `let` properties are set exactly once:

```swift
struct Book {
    let isbn: String        // never changes after init
    var title: String       // can change
    var pageCount = 0       // default value; type inferred as Int
}

var book = Book(isbn: "978-0-13-468599-1", title: "Draft")
book.title = "Final Title"
```

Every stored property must have a value by the end of initialization, either from a default or from an initializer. That's Swift's guarantee that you never read uninitialized memory.

Prefer `let` for properties that don't need to change. It documents intent, and the compiler enforces it.

## Computed properties

A computed property stores nothing. It runs code every time you read it:

```swift
struct Rectangle {
    var width: Double
    var height: Double

    var area: Double {
        width * height
    }
}

let room = Rectangle(width: 4, height: 5)
print(room.area)   // 20.0
```

A computed property can also have a setter, which translates the new value into changes to the stored properties it's derived from:

```swift
struct Temperature {
    var celsius: Double

    var fahrenheit: Double {
        get { celsius * 9 / 5 + 32 }
        set { celsius = (newValue - 32) * 5 / 9 }
    }
}

var today = Temperature(celsius: 20)
today.fahrenheit = 212
print(today.celsius)   // 100.0
```

Inside `set`, the incoming value is called `newValue`, unless you name it yourself: `set(degrees) { … }`.

### Computed property or method?

Both run code, so which should you use? Swift's API guidelines suggest a computed property when the operation:

- is cheap (roughly O(1)),
- has no side effects,
- returns the same result when called twice without anything changing in between.

Readers assume `items.count` is instant and harmless. If the work is expensive (`calculateStatistics()`), can fail, or does I/O, make it a method so the call site sets the right expectations.

## Property observers

`willSet` and `didSet` run code around changes to a stored property:

```swift
final class StepCounter {
    var steps = 0 {
        willSet {
            print("About to set steps to \(newValue)")
        }
        didSet {
            if steps > oldValue {
                print("Added \(steps - oldValue) steps")
            }
        }
    }
}

let stepCounter = StepCounter()
stepCounter.steps = 200
// About to set steps to 200
// Added 200 steps
```

`willSet` gets the incoming value as `newValue`; `didSet` gets the previous one as `oldValue`.

### The rules that trip people up

**1. Observers don't run during the type's own initializer.** While an instance is being set up, setting its properties doesn't trigger its own observers. But a **subclass** initializer that sets an inherited property, after `super.init()`, does trigger the superclass's observers:

```swift
class Base {
    var name = "untitled" {
        didSet { print("Base.didSet: \(name)") }
    }

    init() {
        name = "set in Base.init"      // no observer call
    }
}

class Derived: Base {
    override init() {
        super.init()
        name = "set in Derived.init"   // observer runs: "Base.didSet: set in Derived.init"
    }
}

_ = Derived()
```

**2. In-place mutations count as a change.** For value types, modifying part of a property, like appending to an array or changing one field of a struct, is a set of the whole property, so `didSet` fires:

```swift
struct Playlist {
    var songs: [String] = [] {
        didSet { print("songs changed, now \(songs.count)") }
    }
}

var playlist = Playlist()
playlist.songs.append("Clair de Lune")   // songs changed, now 1
```

That's usually what you want, for example to save or redraw after any change. But it means a loop of 1,000 `append` calls runs the observer 1,000 times. Build the array locally and assign it once when that matters.

**3. Setting the property inside its own `didSet` doesn't recurse.** That makes clamping straightforward:

```swift
struct Volume {
    var level = 0 {
        didSet {
            if level > 10 { level = 10 }   // doesn't trigger didSet again
        }
    }
}

var volume = Volume()
volume.level = 50
print(volume.level)   // 10
```

**4. Passing to an `inout` parameter triggers observers once**, when the value is written back at the end of the call, no matter how many times the function changed it.

Observers are great for small, local reactions: updating a label, persisting a setting, invalidating a cache. If you find yourself chaining observers that set other observed properties, the flow becomes hard to follow; consider an explicit method instead.

## Lazy stored properties

A `lazy var` isn't initialized until it's first read. It's useful for expensive setup that might never be needed, or that depends on other properties:

```swift
final class ReportScreen {
    let title: String

    lazy var formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter
    }()

    lazy var header: String = "Report: \(title)"   // can use self

    init(title: String) {
        self.title = title
    }
}
```

Unlike regular property initializers, a `lazy` initializer can refer to `self`, because it runs after initialization is complete.

Things to know about `lazy`:

- **It must be `var`**, because its storage changes on first access.
- **Reading it is a mutation** for value types. That's why you can't read a lazy property on a `let` struct:

```swift
struct Cached {
    lazy var expensive: Int = 42
}

let cached = Cached()
// print(cached.expensive)   // ❌ cannot use mutating getter on immutable value
```

- **It isn't thread-safe.** If two threads read a lazy property for the first time at the same moment, the initializer can run twice, and one result is thrown away, or worse, the two writes can race. Initialize it before sharing the instance across threads, or protect it with a lock or serial queue.
- **It costs storage for "not initialized yet".** Under the hood, a lazy property is stored as an optional, and the getter fills it on first access:

```swift
struct WithLazy {
    lazy var cachedValue: Int = 42
    var plainValue: Int = 1
}

print(MemoryLayout<WithLazy>.size)   // 24, not 16: the lazy Int is stored as an Int?
```

## Read-only from outside: `private(set)`

A property can be readable everywhere but writable only inside its type:

```swift
struct BankAccount {
    private(set) var balance = 0.0

    mutating func deposit(_ amount: Double) {
        precondition(amount > 0, "Deposits must be positive")
        balance += amount
    }
}

var account = BankAccount()
account.deposit(50)
print(account.balance)       // 50.0
// account.balance = 1e9     // ❌ the setter is private
```

This is one of the most useful tools for protecting a type's invariants: all changes go through methods that enforce the rules.

## Type properties

Properties marked `static` belong to the **type**, not to an instance. There's exactly one copy, shared by everything:

```swift
struct AppConfig {
    static let apiVersion = "v2"
    static var requestCount = 0
}

print(AppConfig.apiVersion)
AppConfig.requestCount += 1
```

Static stored properties are always initialized **lazily**, on first access, and unlike `lazy var`, Swift guarantees that initialization runs **exactly once, even with concurrent access**. That's why this is the standard way to write a singleton:

```swift
final class Analytics {
    static let shared = Analytics()
    private init() {}

    func track(_ event: String) {
        print("Tracked \(event)")
    }
}

Analytics.shared.track("launch")
```

The guarantee covers *initialization* only. A `static var` that many threads read and write afterwards still needs synchronization.

In classes, computed type properties can be declared `class var` instead of `static var`, which lets subclasses override them.

## Properties through key paths

A key path is a reference to a property itself, rather than to its value. It lets you write code that works with "some property of this type":

```swift
struct User {
    var name: String
    var age: Int
}

let nameKeyPath = \User.name                     // WritableKeyPath<User, String>
var user = User(name: "Sam", age: 30)
print(user[keyPath: nameKeyPath])                // Sam
user[keyPath: \User.age] += 1
print(user.age)                                  // 31

func sorted<Value: Comparable>(_ users: [User], by keyPath: KeyPath<User, Value>) -> [User] {
    users.sorted { $0[keyPath: keyPath] < $1[keyPath: keyPath] }
}

let team = [User(name: "Zoe", age: 25), User(name: "Ali", age: 40)]
print(sorted(team, by: \.name).map { $0.name })  // ["Ali", "Zoe"]
```

Key paths are type-checked, so a typo in a property name is a compile error, not a runtime crash.

## Property wrappers, briefly

When the same property behavior keeps coming up, like clamping a value or storing it in `UserDefaults`, Swift 5.1+ lets you package it as a **property wrapper** and apply it with an attribute, like SwiftUI's `@State` and `@Published`. A wrapper is a type with a `wrappedValue`, and the compiler generates the boilerplate to store and forward to it. It's a big topic of its own, worth a separate article.

## Under the hood

- **Stored properties are fields** laid out in declaration order, with padding for alignment.
- **Computed properties are functions.** A getter and setter compile to methods; a read-only computed property is essentially a method with no arguments.
- **Observed properties** get a setter that calls `willSet`, stores the value, then calls `didSet`.
- **Protocols don't care how a property is implemented.** A requirement like `var name: String { get }` can be satisfied by a `let`, a `var`, or a computed property.

## Common pitfalls

- **Expensive computed properties** called in loops, or in SwiftUI/UIKit drawing code. Cache the result, or make it a method.
- **Assuming observers run in `init`.** They don't, for the type's own initializers.
- **Observer storms** from many in-place mutations of a collection property.
- **Racing on `lazy var`** across threads.
- **Mutable global and static state** read and written from several threads without synchronization.

## Interview questions

**When do `willSet` and `didSet` not run?**
During the type's own initializers, and when you set the property from inside its own `didSet`. They do run for subclass initializers after `super.init()`, and for in-place mutations of value-type properties.

**Why can't you read a `lazy` property on a `let` struct?**
The first read stores the computed value, which is a mutation. Mutating a `let` struct isn't allowed.

**Is `lazy var` thread-safe? Is `static let`?**
`lazy var` is not. `static let` (and global constants) are initialized exactly once, safely, on first access.

**When should something be a computed property instead of a method?**
When it's cheap, side-effect free, and conceptually a characteristic of the value.

## Summary

- Stored properties hold data; computed properties derive it on every read and should stay cheap.
- `willSet`/`didSet` run on changes, including in-place mutations, but not during the type's own initializers.
- `lazy var` defers expensive setup, requires a mutable instance, and isn't thread-safe.
- `private(set)` protects invariants; `static let` properties are initialized once, safely.
- Key paths turn properties into type-safe values you can pass around.
