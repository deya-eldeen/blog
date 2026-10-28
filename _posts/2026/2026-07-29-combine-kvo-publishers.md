---
layout: post
hidden: true
title: "Key-Value Observing with Publishers"
date: "2026-07-29"
last_modified_at: "2026-07-29"
permalink: /combine-kvo-publishers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, KVO, Objective-C, Performance]
thumbnail: assets/img/article-placeholder.svg
---
Key-Value Observing is the Objective-C runtime's way of telling you that a property changed. It predates Combine by more than fifteen years, and a great deal of Apple's own API still reports state through it: an `AVPlayer`'s `timeControlStatus`, a `WKWebView`'s `estimatedProgress`, a `Progress` object's `fractionCompleted`, an `OperationQueue`'s `operationCount`, and any value in `UserDefaults`. Combine adds `publisher(for:options:)` to every `NSObject`, which turns a key path into a publisher of that property's values, so these sources can join a pipeline like any other.

The publisher is a thin wrapper, and KVO's rules come through it unchanged. A property must be `@objc dynamic` or it emits nothing after its initial value. A computed property is silent unless you declare what it depends on. Values arrive on whichever thread changed the property. The subscription does not keep the object alive and does not complete when the object goes away. And an observed property is far more expensive to set than an unobserved one. This article measures each rule, including the cost, against a `@Published` property and a subject doing the same job.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift`.

## The basic publisher

`publisher(for:options:)` takes a key path to a property of an `NSObject` subclass. The property must be marked `@objc dynamic`: `@objc` makes it visible to the Objective-C runtime, and `dynamic` forces every access through `objc_msgSend`, which is what lets KVO intercept the setter:

```swift
import Combine
import Foundation

final class AudioPlayer: NSObject {
    @objc dynamic var volume = 0.5
    @objc var balance = 0.0                  // @objc, but not dynamic
}

let player = AudioPlayer()
var volumes: [Double] = []
let volumeHandle = player.publisher(for: \.volume).sink { volumes.append($0) }
player.volume = 0.7
player.volume = 0.7                          // the same value again
assert(volumes == [0.5, 0.7, 0.7])           // initial value, then every assignment
```

With the default options, the publisher emits the current value on subscription and then every assignment, including an assignment of the value the property already has. KVO does not compare values; add `removeDuplicates()` when that matters, as it usually does for a value that drives UI.

Without `dynamic`, the compiler is free to call the setter directly, KVO never sees the change, and the publisher stays silent after the initial value. There is no warning:

```swift
var balances: [Double] = []
let balanceHandle = player.publisher(for: \.balance).sink { balances.append($0) }
player.balance = -0.3
assert(balances == [0.0])                    // the change was never observed
```

## Options: initial, new, and prior

The `options` parameter is an `NSKeyValueObservingOptions` set, and the default is `[.initial, .new]`. Removing `.initial` gives only changes. Adding `.prior` emits an extra value *before* each change, carrying the old value, which is occasionally useful for animating from one state to another:

```swift
var changesOnly: [Double] = []
let changesHandle = player.publisher(for: \.volume, options: [.new]).sink { changesOnly.append($0) }

var withPrior: [Double] = []
let priorHandle = player.publisher(for: \.volume, options: [.prior, .new]).sink { withPrior.append($0) }

player.volume = 0.9
assert(changesOnly == [0.9])                 // no initial value
assert(withPrior == [0.7, 0.9])              // the old value, then the new one
```

The publisher's output is just the value, so a subscriber using `.prior` cannot tell from a single element whether it is the "before" or the "after"; pair them with `collect(2)` or `scan` if you need both. When the distinction matters more than that, `observe(_:options:changeHandler:)`, which returns an `NSKeyValueObservation` and passes a change object with `oldValue`, `newValue`, and `isPrior`, is the clearer API.

## Computed properties need declared dependencies

KVO observes setters. A computed property has no setter, so changing what it is computed from does not, by itself, notify observers of the computed property:

```swift
final class Contact: NSObject {
    @objc dynamic var givenName = "Ada"
    @objc dynamic var familyName = "Lovelace"

    @objc var displayName: String { "\(givenName) \(familyName)" }

    @objc var sortName: String { "\(familyName), \(givenName)" }
    @objc class var keyPathsForValuesAffectingSortName: Set<String> { ["givenName", "familyName"] }
}

let contact = Contact()
var displayNames: [String] = []
var sortNames: [String] = []
let displayHandle = contact.publisher(for: \.displayName).sink { displayNames.append($0) }
let sortHandle = contact.publisher(for: \.sortName).sink { sortNames.append($0) }

contact.givenName = "Grace"
contact.familyName = "Hopper"
assert(displayNames == ["Ada Lovelace"])     // silent after the initial value
assert(sortNames == ["Lovelace, Ada", "Lovelace, Grace", "Hopper, Grace"])
```

The class method named `keyPathsForValuesAffecting<Key>`, with the property name capitalized, tells KVO which key paths a key depends on; the runtime finds it by name. It is easy to forget and impossible for the compiler to check, so a renamed property silently breaks it. In Combine code that owns both properties, it is usually clearer to skip KVO for derived values and combine the inputs instead, as [Combining: `combineLatest`, `zip`, and `merge`](/combine-combinelatest-zip-merge/) does with `@Published`:

```swift
var combinedNames: [String] = []
let combinedHandle = contact.publisher(for: \.givenName)
    .combineLatest(contact.publisher(for: \.familyName))
    .map { "\($0) \($1)" }
    .sink { combinedNames.append($0) }
contact.givenName = "Katherine"
assert(combinedNames == ["Grace Hopper", "Katherine Hopper"])
```

## Values arrive on the thread that made the change

KVO notifies observers synchronously, inside the setter, on whichever thread called it. Combine adds no hop. `Progress` is the clearest example, because its whole purpose is to be updated by background work and displayed by the UI. A parent progress with two children aggregates their completion:

```swift
import Synchronization

final class ThreadReport: Sendable {
    private let values = Mutex<[(fraction: Double, onMain: Bool)]>([])
    func record(_ fraction: Double) { values.withLock { $0.append((fraction, Thread.isMainThread)) } }
    var all: [(fraction: Double, onMain: Bool)] { values.withLock { $0 } }
}

let overall = Progress(totalUnitCount: 2)
let download = Progress(totalUnitCount: 100, parent: overall, pendingUnitCount: 1)
let unpack = Progress(totalUnitCount: 10, parent: overall, pendingUnitCount: 1)

let report = ThreadReport()
let progressHandle = overall.publisher(for: \.fractionCompleted)
    .dropFirst()
    .sink { @Sendable fraction in report.record(fraction) }

let workDone = DispatchSemaphore(value: 0)
DispatchQueue.global().async {
    download.completedUnitCount = 50         // a quarter of the whole
    download.completedUnitCount = 100
    unpack.completedUnitCount = 10
    workDone.signal()
}
workDone.wait()

assert(report.all.map(\.fraction) == [0.25, 0.5, 1.0])
assert(report.all.allSatisfy { !$0.onMain })  // every value arrived on the worker thread
```

The `@Sendable` on the closure is not decoration. Written in main-actor code without it, the closure would be inferred to be main-actor isolated, and Swift 6 would insert an isolation check that crashes on the first background update, as [Networking with `URLSession` Publishers](/combine-urlsession-publishers/) measured for `URLSession`. A pipeline that drives UI from a KVO publisher needs `receive(on: DispatchQueue.main)` before any closure that touches main-actor state, and since `Progress` can update thousands of times a second, usually a `throttle` too:

```swift
@MainActor
final class InstallerModel: ObservableObject {
    @Published private(set) var percent = 0
    private var cancellables = Set<AnyCancellable>()

    func observe(_ progress: Progress) {
        progress.publisher(for: \.fractionCompleted)
            .map { Int(($0 * 100).rounded(.down)) }  // main-actor closure, run on the updating thread
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.percent = $0 }
            .store(in: &cancellables)
    }
}
```

That model has the bug the paragraph above describes: the `map` closure is written inside a `@MainActor` class and runs on whatever thread updates the progress. It works in this test only because the update below happens on the main thread:

```swift
let installer = InstallerModel()
let installProgress = Progress(totalUnitCount: 4)
installer.observe(installProgress)
installProgress.completedUnitCount = 3       // on the main thread: no isolation problem
assert(installer.percent == 0)               // the receive(on:) hop has not run yet
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
assert(installer.percent == 75)
```

The safe version moves the transformation off the main actor, here with a `@Sendable` closure, so it can run on any thread and only the `sink` is main-actor isolated:

```swift
@MainActor
final class SafeInstallerModel: ObservableObject {
    @Published private(set) var percent = 0
    private var cancellables = Set<AnyCancellable>()

    func observe(_ progress: Progress) {
        progress.publisher(for: \.fractionCompleted)
            .map { @Sendable fraction in Int((fraction * 100).rounded(.down)) }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.percent = $0 }
            .store(in: &cancellables)
    }
}

let safeInstaller = SafeInstallerModel()
let backgroundProgress = Progress(totalUnitCount: 4)
safeInstaller.observe(backgroundProgress)
DispatchQueue.global().async { backgroundProgress.completedUnitCount = 2 }
let installDeadline = Date(timeIntervalSinceNow: 2)
while safeInstaller.percent != 50 && Date() < installDeadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.01))
}
assert(safeInstaller.percent == 50)
```

## `UserDefaults`

`UserDefaults` is KVO-compliant for its keys, which makes a settings value observable with a one-line extension. The property name must match the key exactly, because KVO observes by name:

```swift
extension UserDefaults {
    @objc dynamic var playbackSpeed: Double { double(forKey: "playbackSpeed") }
}

let suiteName = "combine-kvo-example"
let defaults = UserDefaults(suiteName: suiteName)!
defaults.removeObject(forKey: "playbackSpeed")

var speeds: [Double] = []
let speedHandle = defaults.publisher(for: \.playbackSpeed).sink { speeds.append($0) }
defaults.set(1.5, forKey: "playbackSpeed")

let otherInstance = UserDefaults(suiteName: suiteName)!
otherInstance.set(2.0, forKey: "playbackSpeed")   // written through a different object

assert(speeds == [0.0, 1.5, 2.0])
defaults.removePersistentDomain(forName: suiteName)
```

The write through a second `UserDefaults` instance for the same suite was observed too, because both instances share the underlying store. That makes this pattern a reasonable way to keep a settings screen and a player in sync without either knowing about the other. The key is a string in two places, though, so keep the property and the key next to each other, or generate both from one constant.

## Lifetime: the observed object can disappear underneath you

A KVO subscription does not retain the observed object, and when the object is deallocated the publisher does not complete. The pipeline simply goes quiet:

```swift
final class Tracked: NSObject {
    @objc dynamic var level = 1
}

var trackedEvents: [String] = []
var trackedHandle: AnyCancellable?
do {
    let tracked = Tracked()
    trackedHandle = tracked.publisher(for: \.level).sink(
        receiveCompletion: { _ in trackedEvents.append("completed") },
        receiveValue: { trackedEvents.append("level \($0)") })
}                                            // the object is gone here
assert(trackedEvents == ["level 1"])         // and nothing says so
assert(trackedHandle != nil)
```

That is safe, since modern KVO removes the observation automatically and nothing crashes, but a screen that observes `player.currentItem?.status` through a property that was later replaced will keep showing the old status forever. If a pipeline must know when its source goes away, hold the source in the same object that holds the cancellable, or observe the property that *holds* the object, such as `\.currentItem`, and `switchToLatest` into the inner observation.

## What observation costs

KVO intercepts a setter by creating a subclass at run time and swapping the observed object's class, and each change then runs the runtime's notification machinery: `willChangeValue`, the set, `didChangeValue`, and a dictionary of change information for each observer. Combine adds its own delivery on top. Timing a million assignments of each kind, in an optimized build, gave:

| Assignment | Time per set |
|---|---|
| `@objc dynamic` property, not observed | about 6 ns |
| `CurrentValueSubject.send`, one `sink` | about 217 ns |
| `@Published` property, one `sink` | about 470 ns |
| KVO, observed with `observe(_:options:changeHandler:)` | about 2.1 µs |
| KVO, observed with `publisher(for:)` and `sink` | about 2.5 µs |

This block repeats the comparison, with assertions loose enough for an unoptimized build:

```swift
final class Meter: NSObject {
    @objc dynamic var unobserved = 0
    @objc dynamic var observed = 0
}

let clock = ContinuousClock()
func nanosecondsPerCall(_ count: Int, _ body: (Int) -> Void) -> Double {
    let start = clock.now
    for i in 0..<count { body(i) }
    let elapsed = clock.now - start
    return (Double(elapsed.components.seconds) * 1e18 + Double(elapsed.components.attoseconds)) / 1e9 / Double(count)
}

let meter = Meter()
var observedTotal = 0
let meterHandle = meter.publisher(for: \.observed, options: [.new]).sink { observedTotal &+= $0 }
let unobservedCost = nanosecondsPerCall(200_000) { meter.unobserved = $0 }
let observedCost = nanosecondsPerCall(200_000) { meter.observed = $0 }

final class PublishedMeter { @Published var value = 0 }
let publishedMeter = PublishedMeter()
var publishedTotal = 0
let publishedHandle = publishedMeter.$value.sink { publishedTotal &+= $0 }
let publishedCost = nanosecondsPerCall(200_000) { publishedMeter.value = $0 }

print(String(format: "unobserved %.0f ns, KVO publisher %.0f ns, @Published %.0f ns",
             unobservedCost, observedCost, publishedCost))
assert(observedCost > unobservedCost * 10)
assert(observedCost > publishedCost)
```

Two microseconds is nothing for a player status that changes a few times a minute, and a real cost for something updated in a tight loop: a progress object incremented once per byte would spend more time notifying than downloading. Update `Progress` in chunks, observe it through a `throttle`, and prefer `@Published` or a subject for state you own. KVO publishers are for state you do not own.

| | KVO `publisher(for:)` | `NSKeyValueObservation` | `@Published` |
|---|---|---|---|
| Works on | `@objc dynamic` properties of `NSObject` subclasses | the same | stored properties of any class |
| Old and new value | `.prior` gives both, unlabeled | `change.oldValue`, `change.newValue` | `@Published` emits before the change; read the property for the old value |
| Thread | the setter's thread | the setter's thread | the setter's thread |
| Lifetime | does not retain; no completion on deallocation | the same | does not retain; no completion on deallocation |
| Use for | Apple and Objective-C objects in a pipeline | Apple and Objective-C objects, outside Combine | your own state |

Keep the remaining subscriptions alive until the end of the file:

```swift
withExtendedLifetime((volumeHandle, balanceHandle, changesHandle, priorHandle, displayHandle,
                      sortHandle, combinedHandle, progressHandle, speedHandle, meterHandle,
                      publishedHandle)) {}
```

## Summary

- `publisher(for:)` turns an `@objc dynamic` property of an `NSObject` into a publisher. Without `dynamic`, only the initial value was emitted, with no warning.
- The default options emit the current value, then every assignment, including repeated values. `[.new]` drops the initial value; `.prior` adds the old value before each change.
- A computed property is silent unless `keyPathsForValuesAffecting<Key>` lists its dependencies, a name-based contract the compiler cannot check.
- Values arrive on the thread that changed the property: every `Progress` update in the test arrived off the main thread. Make closures before `receive(on:)` `@Sendable` in Swift 6.
- `UserDefaults` keys are observable through an `@objc dynamic` extension property named like the key, including writes from other instances of the suite.
- Subscriptions do not retain the object and do not complete when it is deallocated.
- An observed KVO assignment cost about 2.5 µs, against 470 ns for `@Published` and 6 ns unobserved. Use KVO for objects you do not own.

## Exercise

Write a `PlayerStatusModel` that observes an `AVPlayer`'s `currentItem` and, through `map` and `switchToLatest`, the current item's `status`, publishing a single enum that distinguishes "no item", "loading", "ready", and "failed". Test it on macOS with `AVPlayer` and `AVPlayerItem` created from a local file URL and from a URL that does not exist, and verify that replacing the item switches the status observation to the new item and stops reporting the old one. Then measure how many values the model publishes during a call to `replaceCurrentItem(with:)`, and remove any duplicates.

## Further reading

- Apple's article [Using Key-Value Observing in Swift](https://developer.apple.com/documentation/swift/using-key-value-observing-in-swift) and the documentation for [`NSObject.KeyValueObservingPublisher`](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/keyvalueobservingpublisher).
- The *Key-Value Observing Programming Guide*'s chapter [Registering Dependent Keys](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/KeyValueObserving/Articles/KVODependentKeys.html), which documents `keyPathsForValuesAffecting<Key>`.
- Apple's documentation for [`Progress`](https://developer.apple.com/documentation/foundation/progress), including how child progress objects contribute to a parent.

Previous: [Timers](/combine-timers/). Next: [Notifications as Publishers](/combine-notification-publishers/).

Return to the [Combine roadmap](/combine/).
