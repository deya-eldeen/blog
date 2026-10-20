---
layout: post
title: "Key-Value Observing (KVO) in Swift"
date: "2023-11-22"
last_modified_at: "2023-11-22"
permalink: /swift-key-value-observing/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Objective-C"
  - "Runtime"
---

Key-Value Observing lets one object be notified when a property of another object changes. It comes from Objective-C, and Apple's frameworks still rely on it: `AVPlayer.status`, `AVPlayerItem.status`, `WKWebView.estimatedProgress`, `Operation.isFinished`, `Progress.fractionCompleted`, and many more are documented as observable with KVO. Modern Swift wraps it in a clean, type-safe, block-based API, as long as you follow a few rules. Understanding how it works underneath explains those rules.

<!--more-->

## Making a property observable

KVO is implemented by the Objective-C runtime, so the observed class must inherit from `NSObject`, and the property must be marked `@objc dynamic`:

```swift
import Foundation

final class Download: NSObject {
    @objc dynamic var progress: Double = 0
    @objc dynamic var status = "idle"
}
```

- `@objc` exposes the property to the Objective-C runtime.
- `dynamic` forces every access, including from Swift, to go through Objective-C message sending, so the runtime can intercept the setter.

Without `dynamic`, Swift code setting the property would call the setter directly, bypassing KVO, and observers would silently never fire.

## Observing with key paths

The modern API takes a Swift key path and a closure, and returns an `NSKeyValueObservation` token:

```swift
let download = Download()

let progressObservation = download.observe(\.progress, options: [.old, .new]) { object, change in
    let old = change.oldValue ?? 0
    let new = change.newValue ?? 0
    print("Progress: \(old) → \(new)")
}

download.progress = 0.5   // Progress: 0.0 → 0.5
download.progress = 1.0   // Progress: 0.5 → 1.0
```

The key path `\.progress` is type-checked: misspell the property and it won't compile, and `change.newValue` is a `Double?`, not an `Any?`. That eliminates the most common crashes of the old string-based API (`addObserver(_:forKeyPath:options:context:)`).

## Options

| Option | Effect |
|---|---|
| `.new` | include the new value in `change.newValue` |
| `.old` | include the previous value in `change.oldValue` |
| `.initial` | call the handler immediately with the current value, before any change |
| `.prior` | also call the handler *before* each change (with `change.isPrior == true`) |

`.initial` is handy for configuring UI from the current state and keeping it in sync with a single closure:

```swift
let statusObservation = download.observe(\.status, options: [.initial, .new]) { object, _ in
    print("Status is now \(object.status)")
}
download.status = "downloading"
// Status is now idle
// Status is now downloading
```

## How KVO works: isa-swizzling

When you start observing an object, the runtime does something surprising: it creates a hidden **subclass** of the object's class at runtime, overrides the observed property's setter in it to send change notifications, and **switches the object's class** (its `isa` pointer) to that subclass. Only the observed object is affected, not every instance of the class:

```swift
let file = Download()
print(NSStringFromClass(object_getClass(file)!))   // MyApp.Download

var token: NSKeyValueObservation? = file.observe(\.progress) { _, _ in }
print(NSStringFromClass(object_getClass(file)!))   // ..NSKVONotifying_MyApp.Download
print(type(of: file))                              // Download: the runtime hides the subclass

token = nil                                        // stop observing
print(NSStringFromClass(object_getClass(file)!))   // MyApp.Download again
```

(The exact name of the generated class is an implementation detail, but it always contains `NSKVONotifying_` followed by the original class name.) The overridden setter calls `willChangeValue(forKey:)`, the original setter, then `didChangeValue(forKey:)`, which delivers the notifications. This is why KVO requires `dynamic`: the swapped-in setter only runs if calls actually go through the Objective-C runtime.

## Lifetime: keep the token

Observation lasts exactly as long as the `NSKeyValueObservation` token. When the token is deallocated, or when you call `invalidate()`, observation stops automatically. Store it in a property:

```swift
final class DownloadViewModel {
    private let download: Download
    private var observations: [NSKeyValueObservation] = []

    init(download: Download) {
        self.download = download
        observations.append(
            download.observe(\.progress, options: [.new]) { [weak self] _, change in
                self?.render(progress: change.newValue ?? 0)
            }
        )
    }

    private func render(progress: Double) {
        print("Render \(Int(progress * 100))%")
    }
}

let tracked = Download()
let viewModel = DownloadViewModel(download: tracked)
tracked.progress = 0.42   // Render 42%
```

If you forget to store the token, it's deallocated at the end of the statement, the observation ends immediately, and your handler is never called. That's the most common KVO bug in Swift. And use `[weak self]` in the handler when the observer owns the token, to avoid a retain cycle.

## Observing Apple's classes

KVO is still the way to observe many system properties:

```swift
let queue = OperationQueue()
let countObservation = queue.observe(\.operationCount, options: [.new]) { _, change in
    print("Operations in queue: \(change.newValue ?? 0)")
}
```

Only properties **documented as KVO-compliant** are safe to observe. Observing a property that isn't compliant may compile, but never fire, or fire inconsistently.

## Dependent keys

When a computed property depends on others, tell KVO about the dependency, so observers of the computed property are notified when its inputs change:

```swift
final class Person: NSObject {
    @objc dynamic var firstName = ""
    @objc dynamic var lastName = ""

    @objc dynamic var fullName: String {
        "\(firstName) \(lastName)"
    }

    override class func keyPathsForValuesAffectingValue(forKey key: String) -> Set<String> {
        if key == "fullName" {
            return ["firstName", "lastName"]
        }
        return super.keyPathsForValuesAffectingValue(forKey: key)
    }
}

let person = Person()
let nameObservation = person.observe(\.fullName, options: [.new]) { _, change in
    print("Full name: \(change.newValue ?? "")")
}
person.firstName = "Ada"
person.lastName = "Lovelace"
```

## Manual notifications

By default, KVO notifies on **every** set, even when the value doesn't change. You can take control by turning off automatic notifications for a key and sending them yourself:

```swift
final class Thermometer: NSObject {
    override class func automaticallyNotifiesObservers(forKey key: String) -> Bool {
        key == "reading" ? false : super.automaticallyNotifiesObservers(forKey: key)
    }

    @objc dynamic var reading = 0 {
        willSet { if newValue != reading { willChangeValue(forKey: "reading") } }
        didSet { if oldValue != reading { didChangeValue(forKey: "reading") } }
    }
}

let thermometer = Thermometer()
let readingObservation = thermometer.observe(\.reading, options: [.new]) { _, change in
    print("Reading changed to \(change.newValue ?? 0)")
}
thermometer.reading = 1   // Reading changed to 1
thermometer.reading = 1   // no notification: the value didn't change
thermometer.reading = 2   // Reading changed to 2
```

## Threading

KVO notifications are delivered **synchronously, on the thread that changed the property**. If a background thread updates `progress`, your handler runs on that background thread, in the middle of the setter. Hop to the main actor before touching UI, and keep handlers short, since the setter doesn't return until they finish.

## Combine and async alternatives

KVO-compliant properties can also be observed as Combine publishers, which compose with other operators:

```swift
import Combine

let progressCancellable = download.publisher(for: \.progress)
    .sink { value in print("Combine progress: \(value)") }
```

The publisher emits the current value on subscription (like `.initial`) and every change after it. Its `.values` property turns it into an `AsyncSequence` for use with `for await`.

## When not to use KVO

For your **own** Swift types, KVO isn't a great fit: it requires `NSObject`, `@objc dynamic` (which slows down every access), and Objective-C-compatible property types. Better options:

- the **Observation framework**'s `@Observable` macro (iOS 17 / macOS 14), which SwiftUI uses for fine-grained updates,
- Combine's `@Published`,
- plain `didSet` with a callback or delegate,
- an `AsyncStream` of changes.

Keep KVO for Objective-C-era APIs that only offer it, which is still a long list.

## Interview questions

**Why does KVO require `@objc dynamic`?**
KVO works by swapping in a runtime subclass with notifying setters; `dynamic` ensures every set goes through the Objective-C runtime so that swapped setter runs.

**What is isa-swizzling?**
Changing an object's class pointer at runtime. KVO uses it to move an observed object to a hidden `NSKVONotifying_` subclass.

**Why might a KVO handler never be called?**
The `NSKeyValueObservation` token wasn't stored and was deallocated immediately, or the property isn't `@objc dynamic`, or isn't KVO-compliant.

**On which thread are KVO notifications delivered?**
Synchronously, on the thread that performed the change.

## Summary

- KVO requires an `NSObject` subclass and `@objc dynamic` properties.
- `observe(\.keyPath, options:)` gives type-safe, closure-based observation; observation lasts as long as the token.
- Under the hood, KVO isa-swizzles the observed object into a hidden subclass with notifying setters.
- Dependent keys, manual notifications, and Combine publishers cover the advanced cases.
- Handlers run synchronously on the changing thread; prefer Observation, Combine, or `didSet` for your own Swift types.
