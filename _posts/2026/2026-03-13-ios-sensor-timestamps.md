---
layout: post
hidden: true
title: "Timestamps, Stale Samples, and Out-of-Order Events"
date: "2026-03-13"
last_modified_at: "2026-03-13"
permalink: /ios-sensor-timestamps/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Core Location, Concurrency, Sensors]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A sensor sample has two times: when it happened and when the app heard about it. Most bugs in sensor code come from confusing the two. A location fix delivered now may have been taken seconds or minutes ago. Two streams delivered on different queues arrive in an order that has nothing to do with the order of the events they describe. And the two frameworks don't even agree on a clock: Core Motion stamps samples with seconds since boot, while Core Location stamps them with wall-clock `Date`s, which the system can move.

This article sorts out the clocks first, then handles the two practical problems. Stale samples: in the simulator, the first location delivery was up to half a second old, and earlier articles in this series met cached fixes that were seconds old and kilometers away. Out-of-order events: two 50 Hz streams with ordinary queue jitter put 20% of all events out of timestamp order, and a reorder buffer with a watermark trades a little latency for order. With 50 ms of allowed lateness, it dropped 2.3% of events. With 100 ms, 0.07%.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The delay simulation uses the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import CoreLocation
```

## Three clocks

| Clock | Used by | Pauses during sleep? | Can jump? |
| --- | --- | --- | --- |
| Uptime: `ProcessInfo.systemUptime`, `mach_absolute_time()`, `SuspendingClock` | `CMLogItem.timestamp`, documented as "seconds since the device booted" | yes | no |
| Continuous: `mach_continuous_time()`, `ContinuousClock` | Swift's default for `Task.sleep(for:)` and measurements | no | no |
| Wall clock: `Date` | `CLLocation.timestamp`, `CLVisit`, `CLHeading.timestamp` | no | **yes**, when the time is set or corrected |

Apple's documentation for `systemUptime` defines it as "the amount of time the system has been awake since the last time it was restarted". For Swift's clocks, `ContinuousClock` "does not stop incrementing while the system is asleep", and `SuspendingClock` "stops incrementing while the system is asleep." The two kernel clocks underneath can be read directly:

```swift
/// Reads two of the kernel's clocks: one that stops while the machine sleeps, and one that keeps counting.
func clockSeconds(_ id: clockid_t) -> Double {
    var time = timespec()
    clock_gettime(id, &time)
    return Double(time.tv_sec) + Double(time.tv_nsec) / 1e9
}

let awake = clockSeconds(CLOCK_UPTIME_RAW)          // like mach_absolute_time: pauses during sleep
let sinceBoot = clockSeconds(CLOCK_MONOTONIC_RAW)   // like mach_continuous_time: includes sleep
let uptime = ProcessInfo.processInfo.systemUptime
print(String(format: "awake since boot %.1f s, including sleep %.1f s, systemUptime %.1f s; slept %.1f s",
             awake, sinceBoot, uptime, sinceBoot - awake))
assert(abs(uptime - awake) < 1, "systemUptime agrees with the clock that pauses during sleep")
```

On the Mac that ran this, all three read 609,539.7 seconds: it had been up for seven days without sleeping, so the clocks agreed, and `systemUptime` matched the clock that pauses during sleep. On a phone that sleeps every few minutes, they drift apart by the total time asleep. That's harmless while sensors are running, since the device is awake then, but it means two uptime timestamps from before and after a sleep don't measure the real time between them.

`systemUptime` and `mach_absolute_time()` have a second constraint, which matters for shipping apps. Apple lists them among the [required reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api), under the system boot time category, so an app or SDK that calls them must declare a reason in its `PrivacyInfo.xcprivacy` file. The reason for measuring time inside the app is `35F9.1`, and it comes with a restriction: the information may not leave the device, except as elapsed time between events within the app.

## From uptime to dates

Core Motion's uptime timestamps and Core Location's dates have to meet somewhere: on a chart, in a recording, or in fusion code that pairs a motion sample with the nearest fix. The conversion is an anchor, one moment read on both clocks, and arithmetic from there. The wall clock can move under the anchor, though, when network time corrects it or the user changes it, so the converter watches for disagreement and re-anchors:

```swift
/// Converts sensor timestamps (seconds of uptime, like CMLogItem.timestamp) into dates. The anchor pairs an uptime
/// with the wall-clock date it corresponds to; it's refreshed when the wall clock is seen to jump.
struct UptimeToDate {
    private var anchor: (uptime: TimeInterval, date: Date)
    var jumpTolerance: TimeInterval = 0.5
    private(set) var reanchors = 0

    init(uptime: TimeInterval, date: Date) { anchor = (uptime, date) }

    func date(forUptime t: TimeInterval) -> Date { anchor.date.addingTimeInterval(t - anchor.uptime) }

    /// Call now and then with fresh readings of both clocks. If they disagree with the anchor, the wall clock moved.
    mutating func observe(uptime: TimeInterval, date: Date) {
        if abs(date.timeIntervalSince(self.date(forUptime: uptime))) > jumpTolerance {
            anchor = (uptime, date)
            reanchors += 1
        }
    }
}

// A sample taken at uptime 1,000 s, while the wall clock reads 09:00:00. Then, at uptime 1,060 s,
// network time corrects the wall clock by +90 s.
let nine = ISO8601DateFormatter().date(from: "2026-03-13T09:00:00Z")!
var converter = UptimeToDate(uptime: 1_000, date: nine)
let before = converter.date(forUptime: 1_030)
converter.observe(uptime: 1_060, date: nine.addingTimeInterval(60 + 90))
let after = converter.date(forUptime: 1_030)
print("sample at uptime 1,030 s: before the correction", before, "after", after, "re-anchors", converter.reanchors)
assert(after.timeIntervalSince(before) == 90)
```

A sample at uptime 1,030 s converted to 09:00:30. After the wall clock was corrected by 90 seconds, the same sample converted to 09:02:00. Both answers are "right" for their moment, and that's the problem. Two rules avoid it:

- **Order and compute in one monotonic clock.** Durations, intervals, and sorting stay in uptime (or `ContinuousClock`). They never touch `Date`.
- **Convert once, at arrival, for display and storage.** A recording should store the uptime and the anchor it was converted with, so the conversion can be redone or audited.

Core Location's own `Date` timestamps carry the same risk in the other direction. If the wall clock jumps backward, a later fix can carry an earlier timestamp. Deltas between fixes computed from `Date` can come out negative, so clamp them, as the [plausibility filter](/ios-location-updates-accuracy/#rejecting-impossible-jumps) does with `max(…, 0.001)`.

## Stale samples

A fix's `timestamp` is when it was determined, and Core Location often delivers an old one first. Apple's documentation for `didUpdateLocations` describes batches too: "If updates were deferred or if multiple locations arrived before they could be delivered, the array may contain additional entries. The objects in the array are organized in the order in which they occurred. Therefore, the most recent location update is at the end of the array." The test records every delivery with its arrival time while a route plays:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
@MainActor final class Arrivals: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var deliveries: [(received: Date, batch: [CLLocation])] = []
    override init() { super.init(); manager.delegate = self }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        deliveries.append((Date(), locations))
    }
}

let recorder = Arrivals()
recorder.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(1))
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1046
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(20))
recorder.manager.stopUpdatingLocation()
let first = recorder.deliveries[0]
print("first delivery:", first.batch.count, "fix(es), age on arrival", first.received.timeIntervalSince(first.batch.last!.timestamp), "s")
let moving = recorder.deliveries.dropFirst(2)
let latencies = moving.map { $0.received.timeIntervalSince($0.batch.last!.timestamp) * 1000 }.sorted()
let stamps = recorder.deliveries.flatMap(\.batch).map(\.timestamp)
print("route deliveries:", moving.count, "batch sizes", Set(moving.map(\.batch.count)),
      String(format: "latency median %.1f ms, max %.1f ms", latencies[latencies.count / 2], latencies.last!),
      "timestamps increasing:", zip(stamps.dropFirst(), stamps).allSatisfy { $0 >= $1 })
assert(zip(stamps.dropFirst(), stamps).allSatisfy { $0 >= $1 })
```

In two runs, the first delivery was a single fix 0.32 and 0.54 seconds old, the cached position from before updates started. Along the route, each delivery held one fix, timestamps always increased, and fixes arrived a median of 5.5 to 5.9 ms after their timestamps, 7.6 ms at most. The simulator is a best case. On a device, a fix can arrive much later than it was made, for example after the app was suspended and the system queued updates, as the [background article](/ios-background-location/#the-boundaries) describes.

This series has measured staleness in several forms:

| Situation | Staleness measured |
| --- | --- |
| First `didUpdateLocations` after starting | 0.32 to 0.54 s, cached |
| First `liveUpdates()` element after a route change | 1.5 s, and from the *previous* location ([accuracy article](/ios-location-updates-accuracy/#waiting-for-a-good-enough-fix)) |
| First significant change | 5.4 to 7.7 s, once 4.5 km away ([visits article](/ios-visits-significant-location-changes/#in-the-simulator)) |
| Approximate fix after returning to the foreground | 46.7 s ([permission changes article](/ios-location-permission-changes/)) |

The rule that covers all of them is the one the [fix selector](/ios-location-updates-accuracy/#waiting-for-a-good-enough-fix) uses: measure a fix's age from the moment the *request* started, not from when it arrived, and decide per feature how old is too old. For a map's blue dot, a few seconds is fine. For "you've arrived", any fix from before the request is wrong.

## Out-of-order events

When an app merges two streams, say accelerometer samples from an `OperationQueue` and location fixes from the main run loop, the order in which events *arrive* depends on queue scheduling, and each queue adds its own delay. The simulation below models two 50 Hz streams, offset by 7 ms. Each delivery takes a random delay, exponential with a 10 ms mean, plus an 80 ms stall on one delivery in fifty, the way a busy main thread occasionally holds things up.

A reorder buffer restores timestamp order. It holds events until a *watermark*, the newest arrival time minus an allowed lateness $W$, has passed them, then releases them sorted. An event arriving after something newer was already released is late, and it's dropped (or diverted for special handling).

```swift
struct Event: Comparable {
    var time: Double          // when it happened (sensor timestamp)
    var arrival: Double       // when the app received it
    var source: String
    static func < (a: Event, b: Event) -> Bool { a.time < b.time }
}

/// Holds events until the watermark, the newest arrival time minus `lateness`, has passed them, then releases them
/// in timestamp order. Events older than what was already released are counted as late and dropped.
struct ReorderBuffer {
    let lateness: Double
    private var pending: [Event] = []
    private(set) var released: [Event] = []
    private(set) var late = 0
    private var releasedUpTo = -Double.infinity

    init(lateness: Double) { self.lateness = lateness }

    mutating func receive(_ event: Event) {
        if event.time < releasedUpTo { late += 1; return }
        pending.append(event)
        let watermark = event.arrival - lateness
        let ready = pending.filter { $0.time <= watermark }.sorted()
        pending.removeAll { $0.time <= watermark }
        released += ready
        if let last = ready.last { releasedUpTo = last.time }
    }
}

// Two sources at 50 Hz each, delivered through queues that add independent random delays:
// exponential with a mean of 10 ms, plus an occasional 80 ms stall on one in fifty deliveries.
var delays = SeededGenerator(seed: 22)
func delay(using random: inout SeededGenerator) -> Double {
    let base = -0.010 * log(Double.random(in: Double.ulpOfOne..<1, using: &random))
    return base + (Double.random(in: 0..<1, using: &random) < 0.02 ? 0.080 : 0)
}
var events: [Event] = []
for i in 0..<5_000 {
    let t = Double(i) * 0.02
    events.append(Event(time: t, arrival: t + delay(using: &delays), source: "motion"))
    events.append(Event(time: t + 0.007, arrival: t + 0.007 + delay(using: &delays), source: "location"))
}
let arrivals = events.sorted { $0.arrival < $1.arrival }
let outOfOrder = zip(arrivals.dropFirst(), arrivals).filter { $0.0.time < $0.1.time }.count
print("events arriving out of timestamp order:", outOfOrder, "of", arrivals.count)

print("allowed lateness   late (dropped)   upper bound P(delay > lateness)")
for lateness in [0.0, 0.01, 0.02, 0.05, 0.1] {
    var buffer = ReorderBuffer(lateness: lateness)
    for event in arrivals { buffer.receive(event) }
    // An event can only be late if its delay exceeds W: probability 0.98·e^(-W/τ) + 0.02·P(exp > W - 80 ms).
    let bound = 0.98 * exp(-lateness / 0.010) + 0.02 * (lateness < 0.08 ? 1 : exp(-(lateness - 0.08) / 0.010))
    print(String(format: "%5.0f ms            %5.2f%%           %5.2f%%", lateness * 1000,
                 Double(buffer.late) / Double(arrivals.count) * 100, bound * 100))
    assert(buffer.released == buffer.released.sorted() && Double(buffer.late) / Double(arrivals.count) <= bound)
}
```

Of 10,000 events, 2,007, about 20%, arrived out of timestamp order. With jitter of a few milliseconds and samples 7 to 13 ms apart, that's normal, and any code that assumes arrival order is event order is wrong a fifth of the time.

| Allowed lateness $W$ | Late, dropped | Bound: $P(\text{delay} > W)$ |
| --- | --- | --- |
| 0 ms | 21.24% | 100% |
| 10 ms | 8.38% | 38.05% |
| 20 ms | 4.99% | 15.26% |
| 50 ms | 2.32% | 2.66% |
| 100 ms | 0.07% | 0.28% |

An event can only be late if its own delay exceeds $W$, so the delay distribution's tail gives an upper bound:

$$
P(\text{late}) \le P(D > W) = 0.98\,e^{-W/\tau} + 0.02\, P(\text{stall} + \text{exp} > W),
$$

with $\tau$ = 10 ms. The bound is loose for small $W$: an event with a long delay is only dropped if a *newer* event arrived and was released before it. At $W$ = 0, only 21% were late, not 100%. It's tight for large $W$, where only the rare stalls matter. The table makes the trade-off concrete. Every millisecond of allowed lateness is a millisecond of added latency for *every* event. 50 ms keeps 97.7% of events, and a fusion filter running at 20 Hz can afford that. Waiting longer than the longest stall loses almost nothing. Dropped events aren't always a loss either: a late accelerometer sample can be skipped, while a late location fix should probably update the state anyway, out of order, because fixes are rare and valuable.

The [next article](/ios-combining-motion-location/) builds on this, merging motion and location into one ordered stream inside an actor.

## Summary

- Core Motion stamps samples with uptime, "seconds since the device booted", which pauses during sleep. Core Location stamps them with `Date`, which can jump. Swift's `ContinuousClock` counts through sleep, and `SuspendingClock` doesn't.
- `systemUptime` and `mach_absolute_time()` are required reason APIs. Declare `NSPrivacyAccessedAPICategorySystemBootTime` with reason `35F9.1` for measuring time inside the app.
- Convert uptime to dates with an anchor, and re-anchor when the wall clock jumps. A 90 s correction moved a converted sample by 90 s. Order and compute in uptime, and convert once for display.
- Fixes arrive stale: up to 0.54 s for the first delivery in this test, and up to 46.7 s in other situations measured in this series. Measure age from the request.
- Batches arrive oldest first: the most recent fix is the last element.
- Two 50 Hz streams with 10 ms queue jitter arrived 20% out of order. A watermark reorder buffer with 50 ms of allowed lateness dropped 2.3%, and with 100 ms, 0.07%. $P(\text{delay} > W)$ bounds the loss from above.

## Exercise

Extend `ReorderBuffer` with an adaptive lateness. Track the 99th percentile of observed delays (arrival minus timestamp) over the last 500 events, and set $W$ to that value plus 5 ms, capped at 150 ms. Run it on the simulated streams, then change the stall probability from 2% to 10% halfway through and plot how $W$ and the drop rate respond. Report the average latency the adaptive buffer adds, compared with a fixed 100 ms.

## Further reading

- [`CMLogItem.timestamp`](https://developer.apple.com/documentation/coremotion/cmlogitem/timestamp) and [`systemUptime`](https://developer.apple.com/documentation/foundation/processinfo/systemuptime)
- [`ContinuousClock`](https://developer.apple.com/documentation/swift/continuousclock) and [`SuspendingClock`](https://developer.apple.com/documentation/swift/suspendingclock)
- [`locationManager(_:didUpdateLocations:)`](https://developer.apple.com/documentation/corelocation/cllocationmanagerdelegate/locationmanager(_:didupdatelocations:)), on batch order
- [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api), for the privacy manifest
- Tyler Akidau et al., "The Dataflow Model", *Proceedings of the VLDB Endowment* 8(12), 2015, [doi:10.14778/2824032.2824076](https://doi.org/10.14778/2824032.2824076), the paper behind watermarks and allowed lateness in stream processing

Previous: [Background Location and App Lifecycle Boundaries](/ios-background-location/)

Next: [Combining Motion and Location Without Shared-State Races](/ios-combining-motion-location/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
