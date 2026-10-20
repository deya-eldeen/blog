---
layout: post
title: "Extensions in Swift"
date: "2023-11-04"
last_modified_at: "2023-11-04"
permalink: /swift-extensions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Protocols"
  - "Syntax"
thumbnail: "images/covers/swift_extensions_thumbnail.webp"
thumbnail_ready: true
---

Extensions add new functionality to an existing type, even one you don't own, like `Int`, `String`, or `URL`. They're also how Swift developers organize their own types: one extension per protocol conformance, one per area of responsibility. Protocol extensions go further, adding behavior to every conforming type at once, and constrained extensions add API only where it makes sense. Used well, they make code read like a set of tidy chapters; used carelessly, they scatter behavior and clash across modules.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_extensions_thumbnail.webp"
 alt_text="New capability modules attached to an unchanged core type"
 caption="Extensions in Swift"
 width="640"
 height="400"
%}

## Extending a type you don't own

```swift
extension Double {
    var km: Double { self * 1_000 }
    var m: Double { self }
    var cm: Double { self / 100 }
}

let marathon = 42.195.km
print(marathon)       // 42195.0 meters
```

Every `Double` in your module now has these properties, without subclassing and without access to `Double`'s source. This is called **retroactive modeling**: adapting types to your needs after the fact.

## What extensions can add

- computed instance and type properties,
- instance and type methods, including `mutating` methods,
- new initializers (convenience initializers, for classes),
- subscripts,
- nested types,
- protocol conformances.

```swift
extension Int {
    mutating func square() {
        self = self * self
    }

    subscript(digitIndex: Int) -> Int {
        var base = 1
        for _ in 0..<digitIndex { base *= 10 }
        return (self / base) % 10
    }

    enum Kind {
        case negative, zero, positive
    }

    var kind: Kind {
        switch self {
        case 0: .zero
        case let x where x > 0: .positive
        default: .negative
        }
    }
}

var three = 3
three.square()                 // 9
print(three, 746381295[0], (-7).kind)   // 9 5 negative
```

## What extensions can't do

Each limitation has a good reason:

- **No stored properties.** An extension can't change a type's memory layout, because code compiled elsewhere already relies on it. The compiler says *"extensions must not contain stored properties"*. Use computed properties, store the data elsewhere (for example in a dictionary keyed by identity), or, for Objective-C classes only, associated objects.
- **No overriding.** You can't override a method in an extension: *"non-'@objc' instance method 'f()' declared in 'A' cannot be overridden from extension"*. Override in the class body.
- **No designated initializers for classes.** Only convenience initializers, because designated initializers must guarantee every stored property is set, including those declared in the class body.

### Associated objects (Objective-C classes)

For `NSObject` subclasses, the Objective-C runtime can attach extra values to an object, which gives the effect of a stored property in an extension:

```swift
import ObjectiveC

private var badgeCountKey: UInt8 = 0

extension NSObject {
    var badgeCount: Int {
        get { objc_getAssociatedObject(self, &badgeCountKey) as? Int ?? 0 }
        set { objc_setAssociatedObject(self, &badgeCountKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }
}

let item = NSObject()
item.badgeCount = 3
print(item.badgeCount)   // 3
```

It works, but it's a runtime trick: the storage is a global table, it's slower than a real property, and it only works for Objective-C classes. Prefer subclassing or composition in your own code.

## Initializers in extensions

For structs, an initializer added in an extension **keeps** the automatic memberwise initializer, which is lost if you write an `init` in the struct body:

```swift
struct Size {
    var width = 0.0
    var height = 0.0
}

extension Size {
    init(square side: Double) {
        self.init(width: side, height: side)
    }
}

let rectangle = Size(width: 2, height: 3)   // memberwise, still available
let square = Size(square: 4)
```

That's the standard way to add convenience initializers to your own structs. See [Initialization in Swift](/swift-initialization/) for the rules behind it.

## Organizing conformances with extensions

A very common Swift style is to add each protocol conformance in its own extension, which keeps related requirements together and makes the type's capabilities easy to scan:

```swift
struct Track {
    let title: String
    let duration: Int
}

extension Track: CustomStringConvertible {
    var description: String {
        "\(title) (\(duration / 60):\(String(format: "%02d", duration % 60)))"
    }
}

extension Track: Comparable {
    static func < (lhs: Track, rhs: Track) -> Bool {
        lhs.duration < rhs.duration
    }
}

print(Track(title: "Intro", duration: 95))                          // Intro (1:35)
print([Track(title: "B", duration: 200), Track(title: "A", duration: 90)].min()!.title)   // A
```

The same works for your own classes, including view controllers, where each delegate or data source conformance gets its own `// MARK: - UITableViewDataSource` extension.

## Protocol extensions

Extending a **protocol** adds behavior to every conforming type at once. This is the heart of protocol-oriented programming:

```swift
extension Collection {
    var isNotEmpty: Bool { !isEmpty }
}

print([1, 2, 3].isNotEmpty, "".isNotEmpty)   // true false
```

Protocol extensions also provide **default implementations** of requirements. One rule matters a lot: only methods **declared in the protocol** are dynamically dispatched. A method that exists *only* in a protocol extension is chosen based on the variable's static type, so a conforming type's own version may be silently ignored. [Static vs. Dynamic Dispatch in Swift](/swift-static-vs-dynamic-dispatch/) explains this and a related trap with subclasses.

## Constrained extensions

Add a `where` clause, and the extension only applies when the conditions hold:

```swift
extension Array where Element: Numeric {
    func sum() -> Element {
        reduce(0, +)
    }
}

extension Collection where Element == String {
    func joinedWithCommas() -> String {
        joined(separator: ", ")
    }
}

extension Sequence where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

print([1, 2, 3].sum())                  // 6
print(["a", "b"].joinedWithCommas())    // a, b
print([3, 1, 3, 2, 1].uniqued())        // [3, 1, 2]: keeps the first occurrence, in order
// ["x"].sum()                          // not available: String isn't Numeric
```

Constrained extensions are how the standard library offers `sorted()` only on collections of `Comparable` elements, and `contains(_:)` only on collections of `Equatable` ones.

### Conditional conformance

The same idea at the protocol level: a generic type conforms to a protocol only when its type parameters do.

```swift
struct Box<Content> {
    let content: Content
}

extension Box: Equatable where Content: Equatable {}

print(Box(content: 1) == Box(content: 1))   // true
// Box(content: { }) == …                   // not Equatable: closures aren't Equatable
```

## Extensions and access control

An access modifier on an extension sets the **default** for its members:

```swift
private extension String {
    var isBlank: Bool {       // effectively fileprivate: usable anywhere in this file
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

print("   ".isBlank)   // true
```

A `private extension` is a neat way to add helpers that only one file needs, without polluting `String` for the whole module. Note that members of a `private` extension are visible to the whole file, as if they were `fileprivate`.

## Organizing your own types

Extensions are a great structuring tool within your own code:

```swift
final class SettingsViewModel {
    private(set) var items: [String] = []
}

// MARK: - Loading
extension SettingsViewModel {
    func load() { items = ["Theme", "Notifications"] }
}

// MARK: - Actions
extension SettingsViewModel {
    func reset() { items.removeAll() }
}
```

Xcode's `// MARK: -` comments appear in the jump bar and minimap, so each extension becomes a navigable section.

## Under the hood

Extension members of value types and non-`@objc` members of classes are compiled like ordinary methods of the type, and they're **statically dispatched**: they're not added to the class's vtable. That's why they can't be overridden, and why calling them is as cheap as calling a `final` method. Members of protocol extensions are static too, unless they implement a requirement declared in the protocol.

## Common pitfalls

- **Name collisions across modules.** If your module adds `String.isBlank` and an imported library adds one too, calls become ambiguous. Keep helper names specific, or make them `private`/`fileprivate`.
- **Global conveniences that one screen needs.** A `public` or `internal` extension on `String` affects the whole module. Scope helpers to where they're used.
- **Expecting dynamic dispatch** from methods defined only in protocol extensions.
- **Hiding a type's core logic** across many files of extensions, so readers can't find where things happen.

## Interview questions

**Why can't extensions add stored properties?**
They can't change a type's memory layout, which code elsewhere was compiled against. Use computed properties or external storage.

**Can you override a method in an extension?**
Not for Swift methods; overrides must be in the class body. (`@objc` members are an exception, through the Objective-C runtime.)

**How do you keep a struct's memberwise initializer while adding another?**
Declare the new initializer in an extension.

**What's a constrained extension?**
An extension with a `where` clause, whose members only exist when the type's generic parameters or associated types satisfy the constraints.

## Summary

- Extensions add methods, computed properties, initializers, subscripts, nested types, and conformances to any type, including ones you don't own.
- They can't add stored properties, override members, or add designated class initializers.
- Protocol extensions add behavior to every conforming type; only protocol requirements are dynamically dispatched.
- `where` clauses constrain extensions and enable conditional conformance.
- Use extensions to group conformances, keep helpers private to a file, and avoid name collisions across modules.
