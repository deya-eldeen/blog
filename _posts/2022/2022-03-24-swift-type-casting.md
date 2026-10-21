---
layout: post
hidden: true
title: "Type Casting in Swift"
date: "2022-03-24"
last_modified_at: "2022-03-24"
permalink: /swift-type-casting/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Type Safety"
  - "Syntax"
thumbnail: "images/covers/swift_type_casting_thumbnail.webp"
thumbnail_ready: true
---

Type casting answers two questions at runtime: "is this value of a certain type?" and "can I treat it as that type?" Swift answers them with `is` (check), `as?` (try), and `as!` (force), plus a plain `as` for conversions the compiler can verify ahead of time. That looks simple, but Swift's dynamic casts do a lot behind the scenes: they look through optionals, bridge to Foundation types, check protocol conformances, and convert collections element by element.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_type_casting_thumbnail.webp"
 alt_text="A lens checking the concrete shape within a general type container"
 caption="Type Casting in Swift"
 width="640"
 height="400"
%}

## A class hierarchy to work with

```swift
class MediaItem {
    let name: String
    init(name: String) { self.name = name }
}

final class Movie: MediaItem {
    let director: String
    init(name: String, director: String) {
        self.director = director
        super.init(name: name)
    }
}

final class Song: MediaItem {
    let artist: String
    init(name: String, artist: String) {
        self.artist = artist
        super.init(name: name)
    }
}

let library: [MediaItem] = [
    Movie(name: "Casablanca", director: "Michael Curtiz"),
    Song(name: "Blue Suede Shoes", artist: "Elvis Presley"),
    Movie(name: "Citizen Kane", director: "Orson Welles"),
    Song(name: "The One And Only", artist: "Chesney Hawkes"),
]
```

The array's **static** type is `[MediaItem]`, but each element's **dynamic** type, its actual type at runtime, is `Movie` or `Song`. Type casting bridges the two.

## Checking with `is`

```swift
var movieCount = 0
var songCount = 0

for item in library {
    if item is Movie {
        movieCount += 1
    } else if item is Song {
        songCount += 1
    }
}

print("\(movieCount) movies and \(songCount) songs")   // 2 movies and 2 songs
```

`is` returns `true` when the value is an instance of the type **or of a subclass**: every `Movie` is also a `MediaItem`.

## Downcasting with `as?`

`as?` tries to convert a value to a more specific type and returns an optional: the converted value if it works, `nil` if it doesn't. It's the safe default whenever you aren't certain of the type:

```swift
for item in library {
    if let movie = item as? Movie {
        print("Movie: \(movie.name), dir. \(movie.director)")
    } else if let song = item as? Song {
        print("Song: \(song.name), by \(song.artist)")
    }
}
```

A cast never changes the object. A downcast just gives you a reference with a more specific static type, so you can access the subclass's properties.

## Forced casting with `as!`

`as!` performs the cast and **crashes** if it fails:

```swift
let firstItem: MediaItem = library[0]
let movie = firstItem as! Movie           // fine: we know it's a Movie
print(movie.director)
// let song = firstItem as! Song          // crash: Could not cast value of type 'Movie' to 'Song'
```

Use `as!` only when a failed cast would be a **programmer error**, such as dequeuing a table view cell registered with a specific class, or loading a view controller from a storyboard by identifier. Never use it on data from outside your app (JSON, user input, server responses): use `as?` and handle the failure.

## Upcasting and bridging with `as`

Plain `as` is for conversions that **can't fail**, checked at compile time:

```swift
let song = Song(name: "Imagine", artist: "John Lennon")
let item = song as MediaItem                    // upcast: always succeeds

let number = 42 as Double                       // a literal typed as Double
let nsString = "Hello" as NSString              // bridging to Foundation
```

Upcasts usually happen implicitly. Writing `as` explicitly is mostly useful to guide type inference, for example `let values = [1, 2, 3] as [Double]`.

## `Any` and `AnyObject`

`Any` can hold a value of **any** type at all, including structs, enums, tuples, and functions. `AnyObject` can hold any **class instance**. Getting a typed value back out requires casting, and a `switch` with cast patterns is the cleanest way:

```swift
var things: [Any] = [0, 42, 3.14159, "hello", (3.0, 5.0), Movie(name: "Ghostbusters", director: "Ivan Reitman")]
things.append({ (name: String) -> String in "Hello, \(name)" })

for thing in things {
    switch thing {
    case 0 as Int:
        print("zero as an Int")
    case let someInt as Int:
        print("an integer value of \(someInt)")
    case let someDouble as Double where someDouble > 0:
        print("a positive double value of \(someDouble)")
    case let someString as String:
        print("a string value of \"\(someString)\"")
    case let (x, y) as (Double, Double):
        print("an (x, y) point at \(x), \(y)")
    case let movie as Movie:
        print("a movie called \(movie.name)")
    case let greet as (String) -> String:
        print(greet("Michael"))
    default:
        print("something else")
    }
}
```

`Any` is useful at **boundaries**: decoded JSON, `userInfo` dictionaries, Objective-C APIs. Inside your own code, prefer real types, generics, or protocols. Every `Any` turns a compile-time error into a runtime one.

## Casting to protocols

You can ask whether a value conforms to a protocol at runtime. Since Swift 5.6, the existential type is written with `any`:

```swift
protocol Playable {
    func play() -> String
}

extension Song: Playable {
    func play() -> String { "Playing \(name)" }
}

for item in library {
    if let playable = item as? any Playable {
        print(playable.play())
    }
}
```

This works for structs and enums too, not just classes, because Swift records protocol conformances in runtime metadata that dynamic casts can search.

## Optionals and casting

Dynamic casts **look through optionals**. If an `Any` holds an optional, casting it to the wrapped type unwraps it, and a `nil` inside simply fails the cast:

```swift
let boxedValue: Any = Optional<Int>.some(5)
let boxedNil: Any = Optional<Int>.none

print(boxedValue as? Int ?? -1)   // 5
print(boxedNil as? Int ?? -1)     // -1: the cast fails, rather than producing Int?
```

That's convenient, but it's also why debugging `Any` values can be confusing: `print(boxedNil)` shows `nil`, even though the value isn't an `Int?` variable but an `Any` holding one.

## Casting collections

Casting an array or dictionary casts **every element**, and the whole cast fails if any element doesn't match:

```swift
let allInts: [Any] = [1, 2, 3]
let mixed: [Any] = [1, 2, "three"]

print(allInts as? [Int] ?? [])   // [1, 2, 3]
print(mixed as? [Int] ?? [])     // []: one String spoils the cast
```

That means a collection cast is **O(n)**, not a cheap reinterpretation. If you only need the elements that match, use `compactMap`:

```swift
let justInts = mixed.compactMap { $0 as? Int }   // [1, 2]
```

## Bridging to Foundation

On Apple platforms, Swift value types bridge to their Foundation counterparts: `String` ↔ `NSString`, `Array` ↔ `NSArray`, `Dictionary` ↔ `NSDictionary`, and numbers ↔ `NSNumber`. That's what makes JSON parsing with `JSONSerialization` work:

```swift
let json: Any = ["name": "Sam", "age": 30]

if let object = json as? [String: Any],
   let name = object["name"] as? String,
   let age = object["age"] as? Int {
    print("\(name) is \(age)")   // Sam is 30
}
```

Number bridging only succeeds when the value can be represented **exactly**:

```swift
let wholeNumber: NSNumber = 3.0
let fraction: NSNumber = 3.5

print(wholeNumber as? Int ?? -1)   // 3: 3.0 is exactly representable as an Int
print(fraction as? Int ?? -1)      // -1: casting doesn't round, it refuses
```

For new code, `Codable` is a much safer way to parse JSON than casting through `[String: Any]`.

## Metatypes: types as values

Every type has a **metatype**, a value representing the type itself. `type(of:)` returns the dynamic type of a value, and `.self` refers to a type as a value:

```swift
let someItem: MediaItem = Song(name: "Yesterday", artist: "The Beatles")
print(type(of: someItem))                 // Song: the dynamic type
print(type(of: someItem) == Song.self)    // true

func make<T: MediaItem>(_ type: T.Type, name: String) -> String {
    "\(type) named \(name)"
}
print(make(Movie.self, name: "Up"))       // Movie named Up
```

Generic code can cast with type parameters too, `value as? T`, which is resolved at runtime with the actual type.

## Under the hood

Downcasting a class instance is fast: the runtime walks the object's class and its superclasses, comparing metadata pointers. Casting to a **protocol** is more expensive, because the runtime has to search the registered conformance records to find a match (results are cached, so repeated casts of the same types get faster). Casting collections and bridging values do real work, element by element. None of this matters for a handful of casts, but heavy casting in hot loops is worth avoiding, and it's another reason to prefer static types and generics.

## A design smell to watch for

Long chains like `if let a = x as? A … else if let b = x as? B …` often mean behavior is in the wrong place. Instead of asking each object what it is, give the shared type (or a protocol) a method that each subtype implements, and just call it:

```swift
class Shape {
    func area() -> Double { 0 }
}

final class Circle: Shape {
    let radius: Double
    init(radius: Double) { self.radius = radius }
    override func area() -> Double { .pi * radius * radius }
}

final class Square: Shape {
    let side: Double
    init(side: Double) { self.side = side }
    override func area() -> Double { side * side }
}

let shapes: [Shape] = [Circle(radius: 1), Square(side: 2)]
let totalArea = shapes.reduce(0) { $0 + $1.area() }   // no casting needed
print(totalArea)
```

Casting is the right tool at boundaries, and the wrong tool as a replacement for polymorphism.

## Interview questions

**What's the difference between `as`, `as?`, and `as!`?**
`as` performs conversions guaranteed at compile time (upcasts, literals, bridging); `as?` tries a runtime cast and returns an optional; `as!` forces a runtime cast and crashes if it fails.

**Is casting `[Any]` to `[Int]` free?**
No. It checks and converts every element, O(n), and fails entirely if any element doesn't match.

**What happens when you cast an `Any` containing `Optional<Int>.none` to `Int`?**
The cast looks through the optional, finds no value, and returns `nil`.

**Why might `NSNumber(3.5) as? Int` return `nil`?**
Bridging casts only succeed when the value is exactly representable; they don't round.

## Summary

- `is` checks a type; `as?` casts safely; `as!` forces a cast and crashes on failure; `as` is for compile-time-checked conversions.
- `Any` and `AnyObject` require casting to get typed values back; use them at boundaries only.
- Casts work with protocols (`as? any Protocol`), look through optionals, convert collections element by element, and bridge to Foundation exactly or not at all.
- `type(of:)` and `.self` give you metatypes for type-level code.
- Prefer static types, generics, and polymorphism over frequent casting.
