---
layout: post
hidden: true
title: "Stopping Updates When a Feature Ends"
date: "2026-03-27"
last_modified_at: "2026-03-27"
permalink: /ios-sensor-stopping-updates/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Core Motion, Concurrency, Memory Management]
thumbnail: assets/img/article-placeholder.svg
---
Starting a sensor is one line of code, and the bug is in the line that's missing. A screen starts location updates and is dismissed. The updates continue, the radios stay on, the app keeps waking, and nothing on screen shows it. Unlike most leaks, a sensor leak costs the user battery for as long as the app lives, and with background location it can keep the app itself alive.

This article is about ending sensor work as deliberately as it starts. It measures the most common leak in Swift concurrency code: a view model whose update task captures `self` strongly. After its screen was dismissed, it stayed alive and kept receiving fixes, 10 more in 10 seconds. The same model holding itself weakly and cancelling in an `isolated deinit` was gone, and its update loop had ended within 2 ms of dismissal. Then it builds the structure that keeps shared sensors honest: leases that count users, stop the hardware when the last one ends, and still stop it when a feature forgets to.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift block ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, with a route scripted by `simctl`.

```swift
import Foundation
import CoreLocation
import Synchronization
```

## Who owns a running sensor

Every sensor API in this series has an explicit end:

| Started with | Ended by |
| --- | --- |
| `CMMotionManager.startAccelerometerUpdates`, and the gyro, magnetometer, and device-motion equivalents | the matching `stop…Updates()` |
| `CMPedometer.startUpdates`, `CMAltimeter.startRelativeAltitudeUpdates` | `stopUpdates()`, `stopRelativeAltitudeUpdates()` |
| `CLLocationManager.startUpdatingLocation()`, `startUpdatingHeading()` | `stopUpdatingLocation()`, `stopUpdatingHeading()` |
| `startMonitoringSignificantLocationChanges()`, `startMonitoringVisits()` | the matching `stopMonitoring…()`. These outlive the app and relaunch it |
| `CLMonitor` conditions | `remove(_:)`. Records persist across launches ([measured](/ios-region-monitoring-geofencing/#in-the-simulator-clmonitor-and-an-in-app-fence)) |
| `CLLocationUpdate.liveUpdates()` | ending the iteration: break out of the loop, or cancel its task |
| `CLServiceSession`, `CLBackgroundActivitySession` | `invalidate()`, or deinitialization |

Apple's `CMMotionManager` documentation is explicit about the obligation: "call the appropriate stop method … when you no longer need the data." The newer APIs move the end from a method call to a *lifetime*: a live-updates sequence runs while something iterates it, and a session runs while something holds it. That's an improvement only if the lifetimes are right, and Swift concurrency makes one particular mistake easy.

## The task that keeps its owner alive

A screen's model starts live updates in a task and stores the task, and the task's closure refers to `self`. That's a reference cycle: the model holds the task, and the task holds the model. When the screen goes away, nothing else holds the model, but the cycle holds it alive, and the loop inside keeps receiving fixes. The test creates two models, one written the obvious way and one written to end with its screen, drops both, and drives a route:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
/// A screen's model that starts live updates and forgets that its task holds it.
@MainActor final class LeakyRunModel {
    private(set) var fixes = 0
    private var updates: Task<Void, any Error>?

    func start() {
        updates = Task {
            for try await update in CLLocationUpdate.liveUpdates() where update.location != nil {
                self.fixes += 1                                   // strong self: the task keeps the model alive
            }
        }
    }
}

/// Records when an update loop ended, from whichever thread it ends on.
final class EndLog: Sendable {
    private let ended = Mutex<Date?>(nil)
    func mark() { ended.withLock { $0 = Date() } }
    var date: Date? { ended.withLock { $0 } }
}

/// The same model, holding itself weakly and cancelling its task when it goes away.
@MainActor final class RunModel {
    private(set) var fixes = 0
    private var updates: Task<Void, any Error>?
    private let endLog: EndLog

    init(endLog: EndLog) { self.endLog = endLog }

    func start() {
        updates = Task { [weak self, endLog] in
            defer { endLog.mark() }
            for try await update in CLLocationUpdate.liveUpdates() where update.location != nil {
                guard let self else { return }
                self.fixes += 1
            }
        }
    }

    isolated deinit {
        updates?.cancel()
    }
}

weak var leakedModel: LeakyRunModel?
weak var fixedModel: RunModel?
let fixedEnd = EndLog()
var dismissed = Date()
do {
    let leaky = LeakyRunModel(), fixed = RunModel(endLog: fixedEnd)
    leakedModel = leaky; fixedModel = fixed
    leaky.start(); fixed.start()
    try await Task.sleep(for: .seconds(1))
    dismissed = Date()
}
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1046
```

<!-- ios -->
```swift
// Both screens were dismissed when the `do` block ended. Which models are still alive, and still receiving?
try await Task.sleep(for: .seconds(1))
let leakyAfterOneSecond = leakedModel?.fixes ?? -1
try await Task.sleep(for: .seconds(10))
print("leaky model alive:", leakedModel != nil, "fixes", leakyAfterOneSecond, "→", leakedModel?.fixes ?? -1,
      "| fixed model alive:", fixedModel != nil)
print("fixed model's loop ended", fixedEnd.date.map { String(format: "%.3f s", $0.timeIntervalSince(dismissed)) } ?? "never", "after dismissal")
assert(leakedModel != nil && fixedModel == nil && fixedEnd.date != nil)
assert((leakedModel?.fixes ?? 0) > leakyAfterOneSecond + 5, "still receiving with no screen")
```

The leaky model was still alive a second after its screen was gone, with 3 fixes in one run and 5 in another, and 10 seconds later it had 10 more: still counting, at one fix per second, for a screen nobody could see. The fixed model was deallocated as soon as its last strong reference disappeared, and its update loop ended 1 to 2 ms after dismissal.

Two changes made the difference, and each one alone isn't enough.

- **`[weak self]` in the task** breaks the cycle, so the model can be deallocated. But a weak capture alone leaves the loop running until the *next* fix arrives and finds `self` gone. With a still user and no new fixes, that can be never, as the [distance filter article](/ios-location-distance-filter-energy/#standing-still-with-liveupdates) measured.
- **Cancelling the task in `deinit`** ends the iteration immediately, because cancelling the task that's iterating a `liveUpdates()` sequence ends the sequence. The model is main-actor isolated, and its `updates` property can only be touched there, so the deinitializer is declared `isolated deinit`, a Swift 6.2 feature that runs the deinit on the actor.

The pattern generalizes to every `for await` over a sensor stream inside an object: capture weakly, keep the task, cancel it at the end of the owner's life. A screen built with SwiftUI's `.task` modifier gets this for free, because SwiftUI cancels the task when the view disappears. That's the strongest argument for starting sensor work there rather than in a model's initializer.

## Streams that stop their sensors

The wrappers in this series end their sensors from `AsyncStream`'s `onTermination` handler, which runs when the consumer stops iterating, whether by breaking, by cancellation, or by being deallocated. The [availability article](/ios-sensor-availability/#applying-the-deadline-to-core-motion) measured it: when the first-sample deadline gave up on a silent accelerometer, the stream's termination called `stopAccelerometerUpdates()` exactly once. The rule that makes this reliable: **the stream owns the stop**. Callers never call `stop…()` directly. They just stop consuming, and the stop follows from that.

## Many features, one sensor

The hard case is sharing. A map screen and a run recorder both need location. If each starts and stops the manager directly, the first one to finish stops location for both. `CMMotionManager` makes this worse, since Apple says to create only one per app, so every motion feature necessarily shares it. The fix is reference counting with *leases*: each feature takes a lease, the hardware starts with the first lease and stops when the last one ends, and a lease ends either when released or when it's deallocated:

```swift
/// One hardware sensor shared by several features. Each feature holds a lease; the sensor runs while any lease is alive.
/// Leases end when released or when the lease object is deallocated, so a forgotten `release()` still stops the sensor.
final class SharedSensor: Sendable {
    struct Usage: Sendable { var starts = 0, stops = 0, active: [Int: String] = [:], nextID = 0 }
    private let usage = Mutex(Usage())
    private let start: @Sendable () -> Void
    private let stop: @Sendable () -> Void

    init(start: @escaping @Sendable () -> Void, stop: @escaping @Sendable () -> Void) { self.start = start; self.stop = stop }

    final class Lease: Sendable {
        private let sensor: SharedSensor, id: Int
        private let released = Mutex(false)
        fileprivate init(sensor: SharedSensor, id: Int) { self.sensor = sensor; self.id = id }
        func release() {
            guard released.withLock({ let was = $0; $0 = true; return !was }) else { return }
            sensor.end(id)
        }
        deinit { release() }
    }

    /// `owner` names the feature, for the report of who is keeping the sensor on.
    func lease(for owner: String) -> Lease {
        let (id, first) = usage.withLock { u -> (Int, Bool) in
            defer { u.nextID += 1 }
            u.active[u.nextID] = owner
            if u.active.count == 1 { u.starts += 1; return (u.nextID, true) }
            return (u.nextID, false)
        }
        if first { start() }
        return Lease(sensor: self, id: id)
    }

    fileprivate func end(_ id: Int) {
        let last = usage.withLock { u -> Bool in
            guard u.active.removeValue(forKey: id) != nil else { return false }
            if u.active.isEmpty { u.stops += 1; return true }
            return false
        }
        if last { stop() }
    }

    /// Who is keeping the sensor running right now.
    var holders: [String] { usage.withLock { Array($0.active.values).sorted() } }
    var counts: (starts: Int, stops: Int) { usage.withLock { ($0.starts, $0.stops) } }
}

let hardware = Mutex((running: false, transitions: [String]()))
let gps = SharedSensor(start: { hardware.withLock { $0.running = true; $0.transitions.append("start") } },
                       stop: { hardware.withLock { $0.running = false; $0.transitions.append("stop") } })

// A map screen and a run recorder overlap; then the recorder's owner forgets to release, and only deallocation saves it.
let map = gps.lease(for: "MapScreen")
do {
    let recorder = gps.lease(for: "RunRecorder")  // its owner never calls release()
    assert(gps.holders == ["MapScreen", "RunRecorder"])
    map.release(); map.release()                  // releasing twice is harmless
    assert(gps.holders == ["RunRecorder"] && hardware.withLock { $0.running })
    _ = recorder
}                                                 // the recorder's lease is deallocated here, and its deinit ends it
assert(gps.holders.isEmpty && !hardware.withLock { $0.running })
print("hardware transitions:", hardware.withLock { $0.transitions }, "starts/stops:", gps.counts)
assert(hardware.withLock { $0.transitions } == ["start", "stop"])
```

The map and the recorder overlapped, and the hardware saw exactly one start and one stop. Releasing the map's lease twice was harmless, because a lease ends only once. The recorder's owner never called `release()`: when its scope ended, the lease was deallocated, and the lease's `deinit` ended it. That's the safety net for the bug this article is about. A feature that forgets to stop still stops when its lease goes away, as long as the lease is owned by the feature and not by something global.

`holders` names the features keeping the sensor on, from the `owner` string each lease was taken with. A debug menu that lists them turns "the location arrow won't go away" from a mystery into a one-line answer.

## Background makes forgetting worse

The [background location article](/ios-background-location/#what-happens-when-the-app-leaves-the-foreground) measured a property that turns a forgotten stop into a battery problem. Background settings are process-wide: one manager with `allowsBackgroundLocationUpdates` kept *every* location request in the app delivering in the background, and a held `CLBackgroundActivitySession` did the same for `liveUpdates()`. A recorder that forgets to invalidate its session after a run doesn't just leak its own updates. It keeps the whole app running in the background, with the location indicator showing, until the system or the user ends it. Treat background sessions as leases too: one per active background feature, released when the feature ends.

## Summary

- Every sensor start has an end: a stop method for the older APIs, and a lifetime (iteration or holding a session) for the newer ones. Significant changes, visits, and `CLMonitor` outlive the app, so remove them explicitly.
- A task that iterates sensor updates and captures `self` strongly keeps its owner alive. The leaky model received 10 fixes in 10 seconds after its screen was gone.
- Capture weakly *and* cancel the task in an `isolated deinit`. The fixed model's loop ended within 2 ms of dismissal. A weak capture alone waits for the next sample, which may never come. SwiftUI's `.task` cancels for you.
- Let streams own their stops through `onTermination`, so consumers end sensors by ending iteration.
- Share sensors with leases: start on the first, stop on the last, and end a lease when it's deallocated, so forgetting to release still stops the hardware. Name lease holders for debugging.
- Background settings are process-wide. Leaked background sessions keep the whole app running.

## Exercise

Turn `SharedSensor` into the owner of a real `CMMotionManager`: start device-motion updates on the first lease, stop them on the last, and fan the samples out to every lease holder through its own `AsyncStream`. Each holder's stream should end when its lease ends. Add an `interval` to each lease, run the hardware at the fastest interval any current lease asked for, and lower the rate when that lease ends. Test it on macOS with a fake start and stop, as above, checking the sequence of rates the hardware was asked for.

## Further reading

- [`CMMotionManager`](https://developer.apple.com/documentation/coremotion/cmmotionmanager), on stopping updates and sharing a single instance
- [SE-0371: Isolated synchronous deinit](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0371-isolated-synchronous-deinit.md)
- [`AsyncStream.Continuation.onTermination`](https://developer.apple.com/documentation/swift/asyncstream/continuation/ontermination)
- [`task(name:priority:file:line:_:)`](https://developer.apple.com/documentation/swiftui/view/task(name:priority:file:line:_:)), SwiftUI's modifier that cancels its task when the view disappears

Previous: [Testing Unavailable Hardware and Denied Permissions](/ios-sensor-testing-unavailable-denied/)

Next: [Profiling Sensor Work and Battery Usage](/ios-sensor-profiling-battery/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
