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

Key-Value Observing lets one object be notified when a property of another object changes. It comes from Objective-C, and Apple's frameworks still use it: `AVPlayer.status`, `WKWebView.estimatedProgress`, `Operation.isFinished`, and many more. Modern Swift has a clean, block-based API for KVO, as long as you follow a few rules.

<!--more-->

## Making a property observable

KVO works through the Objective-C runtime, so the observed class must inherit from `NSObject`, and the property must be marked `@objc dynamic`:

```swift
import Foundation

final class Download: NSObject {
    @objc dynamic var progress: Double = 0
    @objc dynamic var status = "idle"
}
```

`dynamic` makes accesses go through the Objective-C runtime, which is what lets KVO intercept the setter and send notifications.

## Observing with key paths

The modern API takes a Swift key path and a closure, and returns an `NSKeyValueObservation` token:

```swift
let download = Download()

let observation = download.observe(\.progress, options: [.old, .new]) { object, change in
    let old = change.oldValue ?? 0
    let new = change.newValue ?? 0
    print("Progress: \(old) → \(new)")
}

download.progress = 0.5   // Progress: 0.0 → 0.5
download.progress = 1.0   // Progress: 0.5 → 1.0
```

The key path `\.progress` is type-checked: misspell the property and it won't compile, which was a common source of crashes with the old string-based API.

## Options

| Option | Effect |
|---|---|
| `.new` | include the new value in `change.newValue` |
| `.old` | include the previous value in `change.oldValue` |
| `.initial` | call the handler immediately with the current value |
| `.prior` | also call the handler *before* the change |

`.initial` is handy for setting up UI from the current state and keeping it in sync with one closure:

```swift
let statusObservation = download.observe(\.status, options: [.initial, .new]) { object, _ in
    print("Status is now \(object.status)")
}
download.status = "downloading"
```

## Lifetime: keep the token

Observation lasts exactly as long as the `NSKeyValueObservation` token. When the token is deallocated, observation stops automatically. Store it in a property:

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
```

If you forget to store the token, the observation ends immediately and your handler is never called. That's the most common KVO bug in Swift.

Use `[weak self]` in the handler when the observing object owns the token, to avoid a retain cycle.

## Observing Apple's classes

KVO is still the way to observe many system properties:

```swift
let queue = OperationQueue()
let countObservation = queue.observe(\.operationCount, options: [.new]) { _, change in
    print("Operations in queue: \(change.newValue ?? 0)")
}
```

Only properties documented as KVO-compliant are safe to observe. Observing a property that isn't compliant may silently never fire.

## Dependent keys

If a computed property depends on others, tell KVO about it so observers of the computed property are notified too:

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
```

## Threading

KVO notifications are delivered **synchronously, on the thread that changed the property**. If a background thread updates `progress`, your handler runs on that background thread. Hop to the main actor before touching UI.

## Combine and modern alternatives

KVO-compliant properties can also be observed as Combine publishers:

```swift
import Combine

let cancellable = download.publisher(for: \.progress)
    .sink { value in print("Combine progress: \(value)") }
```

For your **own** Swift types, KVO isn't the best fit: it requires `NSObject` and `@objc dynamic`. Prefer the Observation framework's `@Observable`, `didSet`, Combine's `@Published`, or `AsyncSequence`. Keep KVO for Objective-C-era APIs that only offer it.

## Summary

- KVO requires an `NSObject` subclass and `@objc dynamic` properties.
- `observe(\.keyPath, options:)` gives type-safe, closure-based observation.
- Observation lives as long as the returned token, so store it, and use `[weak self]` in the handler.
- Handlers run on the thread that made the change; prefer Observation, Combine, or `didSet` for your own Swift types.
