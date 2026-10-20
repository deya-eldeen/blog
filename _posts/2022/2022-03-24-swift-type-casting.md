---
layout: post
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
---

Type casting answers two questions at runtime: "is this value of a certain type?" and "can I treat it as that type?" Swift answers them with three operators: `is` to check, `as?` to try a conversion safely, and `as!` to force it. There's also plain `as` for conversions the compiler can verify ahead of time.

<!--more-->

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

The array's type is `[MediaItem]`, but each element is really a `Movie` or a `Song` at runtime.

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

print("\(movieCount) movies and \(songCount) songs")
```

## Downcasting with `as?`

`as?` tries to convert to a more specific type and returns an optional: the value if it works, `nil` if it doesn't. Pair it with `if let`:

```swift
for item in library {
    if let movie = item as? Movie {
        print("Movie: \(movie.name), dir. \(movie.director)")
    } else if let song = item as? Song {
        print("Song: \(song.name), by \(song.artist)")
    }
}
```

This is the safe default whenever you aren't certain of the type.

## Forced casting with `as!`

`as!` converts and **crashes** if the cast fails. Use it only when a failure would be a programmer error, for example when a storyboard is guaranteed to contain a specific view controller:

```swift
let firstItem: MediaItem = library[0]
let movie = firstItem as! Movie           // fine: we know it's a Movie
print(movie.director)
// let song = firstItem as! Song          // would crash: Could not cast value of type 'Movie' to 'Song'
```

If you're tempted to use `as!` on data from outside your app, like JSON or user input, use `as?` and handle the failure.

## Upcasting and bridging with `as`

Plain `as` is for conversions that can't fail, which the compiler checks at compile time:

```swift
let song = Song(name: "Imagine", artist: "John Lennon")
let item = song as MediaItem                    // upcast: always succeeds

let number = 42 as Double                       // literal typed as Double
let nsString = "Hello" as NSString              // bridging to Foundation
```

Upcasts usually happen implicitly; writing `as` is mostly useful to guide type inference.

## `Any` and `AnyObject`

`Any` can hold a value of any type at all, including functions; `AnyObject` holds any class instance. Getting values back out requires casting, and a `switch` with cast patterns is the cleanest way:

```swift
var things: [Any] = [0, 42, 3.14159, "hello", (3.0, 5.0), Movie(name: "Ghostbusters", director: "Ivan Reitman")]
things.append { (name: String) -> String in "Hello, \(name)" }

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

`Any` is useful at boundaries, like decoded JSON or Objective-C APIs. Inside your own code, prefer real types, generics, or protocols: every `Any` means type errors that only show up at runtime. The differences between `Any`, `AnyObject`, and `AnyHashable` are covered in [Understanding Swift: Differences Between Any, AnyObject, and AnyHashable](/swift-any-anyobject/).

## Casting to protocols

Casts work with protocols too. You can check whether a value conforms at runtime:

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

## A design smell to watch for

Long `if let x = y as? A … else if let x = y as? B` chains often mean behavior is in the wrong place. Instead of asking each object what it is, give the shared type a method each subtype implements, through overriding or a protocol requirement, and just call it. Casting is the right tool at boundaries, not as a replacement for polymorphism.

## Summary

- `is` checks a type; `as?` casts safely and returns an optional; `as!` forces a cast and crashes on failure.
- Plain `as` is for compile-time-checked conversions: upcasts, literals, and bridging.
- `switch` with cast patterns handles `Any` values cleanly.
- Prefer real types, generics, and polymorphism over frequent casting.
