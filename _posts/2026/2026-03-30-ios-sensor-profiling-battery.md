---
layout: post
hidden: true
title: "Profiling Sensor Work and Battery Usage"
date: "2026-03-30"
last_modified_at: "2026-03-30"
permalink: /ios-sensor-profiling-battery/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Instruments, MetricKit, Energy, Performance]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
When a sensor app drains batteries, the instinct is to optimize the math: a faster filter, a leaner Kalman update. The measurements in this article say that's almost never where the energy goes. The series' per-sample algorithms cost 3 to 45 nanoseconds each in an optimized build, so at 100 Hz the most expensive one uses under a thousandth of a percent of a core. Handing each sample to the code that processes it cost a thousand times more: 89 to 110 µs of CPU per sample when every sample woke the consumer, and 36 to 42 µs when samples arrived in batches of ten. Beyond the CPU are costs no simulator can show: GPS radios, sensor hubs, and the price of waking a sleeping device.

This article measures what can be measured off-device, explains what can't, and shows the tools that measure the rest where it actually happens. Instruments' signposts recorded the series' processing as intervals, with a median of 99.6 µs per 10,000 updates. The Power Profiler refused to record on macOS, as Apple documents. And MetricKit's new iOS 27 Swift API reports, from users' devices, how long an app spent at each location accuracy.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, with timings from an optimized build as noted, and the iOS block ran in a unit-test bundle on an iPhone 17 simulator running iOS 27.0. Benchmarks use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import simd
import os
```

## Where the energy goes

Apple's [Energy Efficiency Guide](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/FundamentalConcepts.html) separates two kinds of cost. Tasks have "a *dynamic cost*—how much energy your app uses by doing actual work", and "a *fixed cost*—how much energy is used by bringing the system and various resources up in order for your app to do work, and back down after that work is complete." The guide warns that with sporadic work, "resources may never get the chance to reach true idle between the sporadic tasks."

A simple model makes the consequence concrete. If an app wakes $n$ times and does work $w_i$ each time, with a fixed cost $F$ per wake and a dynamic cost proportional to work,

$$
E = n F + c \sum_{i=1}^{n} w_i .
$$

The work is fixed by the feature. The number of wakes isn't. Batching $k$ samples per wake divides the first term by $k$ and leaves the second unchanged. For sensor apps, where each sample's work is tiny, the first term is almost everything. The measurements below put numbers on that, for the CPU at least.

| Cost | Who controls it | Where to measure it |
| --- | --- | --- |
| Sensor hardware: GPS, accelerometer, barometer | Accuracy, rate, and stopping ([distance filters](/ios-location-distance-filter-energy/), [stopping](/ios-sensor-stopping-updates/)) | Power Profiler, MetricKit, on device |
| Waking the app | Delivery: batching, filters, pull instead of push | CPU time, wakeups, Instruments |
| Processing each sample | The algorithm | Benchmarks, signposts |

## Processing: nanoseconds

The per-sample work of the earlier articles, timed over a million samples each:

```swift
/// Measures the time per call of `body`, over `count` calls, after a warm-up.
func nanosecondsPerCall(_ count: Int, _ body: (Int) -> Void) -> Double {
    for i in 0..<min(count, 1_000) { body(i) }
    let clock = ContinuousClock()
    let start = clock.now
    for i in 0..<count { body(i) }
    let elapsed = clock.now - start
    return (Double(elapsed.components.seconds) * 1e9 + Double(elapsed.components.attoseconds) / 1e9) / Double(count)
}

// The per-sample work of earlier articles, on a million synthetic samples each.
var random = SeededGenerator(seed: 28)
let samples = (0..<1_000_000).map { _ in SIMD3(random.gaussian(), random.gaussian(), random.gaussian() - 9.8) }
var sink = 0.0

// A second-order low-pass on one axis (the sampling article's biquad).
var y1 = 0.0, y2 = 0.0, x1 = 0.0, x2 = 0.0
let biquad = nanosecondsPerCall(samples.count) { i in
    let x = samples[i].x
    let y = 0.0675 * x + 0.1349 * x1 + 0.0675 * x2 + 1.1430 * y1 - 0.4128 * y2
    (x2, x1, y2, y1) = (x1, x, y1, y)
    sink += y
}

// One complementary-filter step for gravity (the device motion article): a small rotation, a blend, a normalize.
var gravity = SIMD3<Double>(0, 0, -1)
let complementary = nanosecondsPerCall(samples.count) { i in
    let omega = samples[i] * 0.001
    let rotated = simd_quatd(angle: -simd_length(omega) * 0.01, axis: simd_normalize(omega + SIMD3(0, 0, 1e-9))).act(gravity)
    gravity = simd_normalize(rotated + 0.02 * (simd_normalize(samples[i]) - rotated))
    sink += gravity.z
}

// One Kalman predict on a 3-state filter (the motion and location article).
var state = SIMD3<Double>(0, 0, 0), covariance = simd_double3x3(diagonal: SIMD3(100, 4, 0.04))
let kalman = nanosecondsPerCall(samples.count) { i in
    let dt = 0.02
    let f = simd_double3x3(rows: [SIMD3(1, dt, -dt * dt / 2), SIMD3(0, 1, -dt), SIMD3(0, 0, 1)])
    state = f * state + SIMD3(dt * dt / 2, dt, 0) * samples[i].y
    covariance = f * covariance * f.transpose + simd_double3x3(diagonal: SIMD3(1e-6, 1e-4, 4e-8))
    sink += state.x
}

for (name, ns) in [("biquad low-pass", biquad), ("complementary gravity step", complementary), ("Kalman predict", kalman)] {
    let share = ns * 100 / 1e9 * 100      // percent of one core at 100 samples per second
    print(name.padding(toLength: 28, withPad: " ", startingAt: 0), String(format: "%7.1f ns per sample → %.5f%% of a core at 100 Hz", ns, share))
}
print("(sink \(sink.isFinite))")
```

| Work per sample | Optimized build | Debug build | Share of a core at 100 Hz (optimized) |
| --- | --- | --- | --- |
| Biquad low-pass, one axis | 3.4 ns | 203 ns | 0.00003% |
| Complementary gravity step | 24.8 ns | 819 ns | 0.00025% |
| Kalman predict, 3 states | 45.2 ns | 1,018 ns | 0.00045% |

Even the debug build, 20 to 60 times slower, stays far below anything that matters at sensor rates. Optimizing these routines won't change an app's battery use. What's worth checking instead is that nothing expensive hides in the per-sample path: an allocation, a lock, a log statement with string formatting, or a `DateFormatter`.

## Delivery: microseconds

Handing a sample from the sensor's thread to the code that processes it means waking a thread, scheduling a task, and hopping onto an actor. The experiment below produces samples at 100 Hz for 3 seconds and measures the process's CPU time, first delivering every sample as it arrives, then in batches of ten:

```swift
// Delivery: what it costs to hand samples from a sensor's thread to a consumer through an AsyncStream and an actor.
actor Consumer {
    private(set) var count = 0
    func take(_ batch: [Double]) { count += batch.count }
}

/// Process CPU time, in seconds: user and system time of every thread together.
func processCPUSeconds() -> Double {
    var time = timespec()
    clock_gettime(CLOCK_PROCESS_CPUTIME_ID, &time)
    return Double(time.tv_sec) + Double(time.tv_nsec) / 1e9
}

/// Runs a 100 Hz producer for `seconds`, delivering every sample alone or in batches, and returns the CPU time used.
func deliveryCPU(seconds: Double, batchSize: Int) async -> (cpu: Double, delivered: Int) {
    let (stream, continuation) = AsyncStream.makeStream(of: [Double].self)
    let consumer = Consumer()
    let cpuBefore = processCPUSeconds()
    let task = Task { for await batch in stream { await consumer.take(batch) } }
    let producer = Thread {
        var pending: [Double] = []
        let start = Date()
        for i in 0..<Int(seconds * 100) {
            Thread.sleep(until: start.addingTimeInterval(Double(i) / 100))     // the sensor's 100 Hz clock
            pending.append(Double(i))
            if pending.count == batchSize { continuation.yield(pending); pending.removeAll(keepingCapacity: true) }
        }
        if !pending.isEmpty { continuation.yield(pending) }
        continuation.finish()
    }
    producer.start()
    await task.value
    return (processCPUSeconds() - cpuBefore, await consumer.count)
}

let single = await deliveryCPU(seconds: 3, batchSize: 1)
let batched = await deliveryCPU(seconds: 3, batchSize: 10)
print(String(format: "100 Hz for 3 s, one sample per delivery: %.1f ms of CPU for %d samples (%.1f µs each)",
             single.cpu * 1000, single.delivered, single.cpu * 1e6 / Double(single.delivered)))
print(String(format: "100 Hz for 3 s, ten samples per delivery: %.1f ms of CPU for %d samples (%.1f µs each)",
             batched.cpu * 1000, batched.delivered, batched.cpu * 1e6 / Double(batched.delivered)))
```

| Delivery | CPU per sample, three runs |
| --- | --- |
| Every sample wakes the consumer | 88.9, 105.2, 110.4 µs |
| Ten samples per wake | 37.5, 42.1, 35.8 µs |

Delivery cost a thousand times more than processing, and batching cut it by more than half, even though the producer thread still woke 100 times a second in both cases. The difference, about 60 to 70 µs per avoided consumer wake, is the CPU side of the fixed cost. On a device, each avoided wake also saves the energy of bringing a core out of idle, which this measurement can't see.

The lessons translate directly into API choices:

- **Pull instead of push when there's a frame loop.** Apple's `CMMotionManager` documentation recommends polling `accelerometerData` for games, because handlers add overhead. A game already wakes for every frame, so the sensor rides along at no extra cost.
- **Ask for the rate the feature needs.** A 100 Hz request for a 10 Hz feature multiplies wakes by ten.
- **Batch where latency allows.** A recorder doesn't need each sample within 10 ms. Collect them on the sensor's queue and hand them over in groups, as the [buffering policy](/ios-accelerometer-gyroscope/#when-the-consumer-falls-behind) discussion recommends for recording.
- **Filter at the source.** A [distance filter](/ios-location-distance-filter-energy/#measuring-the-trade-off) cut location deliveries tenfold while improving the measured distance.

## Signposts: seeing the work in Instruments

Benchmarks answer "how fast is this function". Signposts answer "what did the app actually do, when", in a recording that also shows CPU, wakes, and, on a device, power. `OSSignposter` marks intervals with almost no overhead when no tool is recording. This standalone program processes 50 batches inside signpost intervals:

<!-- skip-check -->
```swift
import Foundation
import os

let signposter = OSSignposter(subsystem: "dev.swiftbydeya.sensors", category: .pointsOfInterest)
var gravity = SIMD3<Double>(0, 0, -1)
for batch in 0..<50 {
    let state = signposter.beginInterval("Process batch", id: signposter.makeSignpostID(), "batch \(batch)")
    for i in 0..<10_000 {
        let a = SIMD3(Double(i % 7) * 0.01, Double(i % 5) * 0.01, -1.0)
        gravity = (gravity + 0.02 * (a - gravity))
    }
    signposter.endInterval("Process batch", state)
    signposter.emitEvent("Batch done")
    Thread.sleep(forTimeInterval: 0.02)
}
print(gravity)
```

Recorded with the Logging template and exported from the command line:

```sh
xcrun xctrace record --template "Logging" --output run.trace --launch -- ./sp
xcrun xctrace export --input run.trace --xpath '/trace-toc/run[@number="1"]/data/table[@schema="os-signpost"]'
```

The export contained 150 signpost rows: 50 interval begins, 50 ends, and 50 "Batch done" events. Pairing each Begin with its End by signpost identifier gave 50 intervals, with a median of 99.6 µs (46.5 µs to 351.6 µs) per batch of 10,000 updates, about 10 ns per update, consistent with the benchmark above. In the Instruments app, the same intervals appear as a lane under Points of Interest, aligned with CPU usage,, which is where a question like "why did one batch take 350 µs" can be answered from the CPU and thread lanes around it.

The Power Profiler template, which shows the energy side, has a hard limit. Asked to record the same program, `xctrace` reported: "The Power Profiler instrument is not supported on macOS. Record on iOS or iPadOS instead." Apple's WWDC25 session [Profile and optimize power usage in your app](https://developer.apple.com/videos/play/wwdc2025/226/) shows its lanes on a device, "the CPU, GPU, display, and networking power impact", and notes that it "is also available on-device and it can be used to find issues that can't be reproduced during development." For sensors, that on-device recording is the measurement that matters: run the feature for twenty minutes outdoors, with the screen off, and compare.

## MetricKit: power in the field

What users' devices actually experience arrives through MetricKit, roughly once a day, aggregated by the system. iOS 27 adds a Swift-native API: `MetricManager` exposes `metricReports` as an `AsyncSequence`, and each report's interval entries carry typed `MetricResult` values. Among them, `.locationActivityTime` reports how long the app used location at each accuracy level, from `bestAccuracyForNavigation` down to `reducedAccuracy`, and `.totalBackgroundLocationTime` reports background location time. Converting them into the app's own type keeps the analysis testable without a device:

```swift
/// Time a location feature spent at each accuracy, as plain numbers the app owns and can test.
struct LocationTime: Equatable {
    var bestForNavigation = 0.0, best = 0.0, tenMeters = 0.0, hundredMeters = 0.0
    var kilometer = 0.0, threeKilometers = 0.0, reduced = 0.0          // seconds

    var total: Double { bestForNavigation + best + tenMeters + hundredMeters + kilometer + threeKilometers + reduced }
    /// The share of location time spent at the two most expensive settings.
    var highAccuracyShare: Double { total == 0 ? 0 : (bestForNavigation + best) / total }
}

let commuter = LocationTime(best: 1_800, hundredMeters: 600, threeKilometers: 7_200)
assert(abs(commuter.highAccuracyShare - 0.1875) < 1e-12)
```

<!-- ios -->
```swift
import MetricKit

extension LocationTime {
    @available(iOS 27, *)
    init(_ metric: LocationActivityTimeMetric) {
        bestForNavigation = metric.bestAccuracyForNavigation.converted(to: .seconds).value
        best = metric.bestAccuracy.converted(to: .seconds).value
        tenMeters = metric.tenMeters.converted(to: .seconds).value
        hundredMeters = metric.oneHundredMeter.converted(to: .seconds).value
        kilometer = metric.oneKilometer.converted(to: .seconds).value
        threeKilometers = metric.threeKilometers.converted(to: .seconds).value
        reduced = metric.reducedAccuracy.converted(to: .seconds).value
    }
}

if #available(iOS 27, *) {
    // Field metrics arrive about once a day on real devices; collect the location ones as they come.
    let metrics = MetricManager()
    var locationTimes: [LocationTime] = []
    let collector = Task { @MainActor in
        for await report in metrics.metricReports {
            for entry in report.intervalEntries {
                for case .locationActivityTime(let metric) in entry.values { locationTimes.append(LocationTime(metric)) }
            }
        }
    }

    // Signposts on MetricKit's log handle are aggregated into those reports, so field data shows the same intervals.
    let log = MetricManager.logHandle(category: "Sensors")
    mxSignpost(.begin, log: log, name: "Process batch")
    var smoothed = 0.0
    for i in 0..<10_000 { smoothed += 0.02 * (Double(i % 7) - smoothed) }
    mxSignpost(.end, log: log, name: "Process batch")

    try await Task.sleep(for: .seconds(3))
    collector.cancel()
    print("metric reports with location time in the simulator after 3 s:", locationTimes.count, "(smoothed \(smoothed))")
    assert(locationTimes.isEmpty)
}
```

The simulator delivered no reports in 3 seconds, and it isn't expected to. MetricKit aggregates real usage over a day. The code compiles against the iOS 27 SDK and runs. The signpost half matters as much as the metric half. Intervals emitted with `mxSignpost` on the log handle from `MetricManager.logHandle(category:)` are aggregated into the same reports, so the "Process batch" interval measured in Instruments during development shows up again, with real users' durations, in the field.

The location metric answers the question this whole series keeps returning to: is the app using more accuracy than its features need? A commute tracker that spent 1,800 s at best accuracy, 600 s at 100 m, and 7,200 s at 3 km spent 18.75% of its location time at the expensive settings. If a release moves that share up without a feature that needs it, something started asking for more precision than it should.

## Summary

- Sensor energy goes to hardware and to waking the app, not to math. The series' algorithms cost 3.4 to 45 ns per sample when optimized, a negligible share of a core even at 100 Hz.
- Delivery cost a thousand times more than processing: 89 to 110 µs of CPU per sample with one wake per sample, and 36 to 42 µs in batches of ten. That's the CPU side of what Apple calls fixed cost. Batching, pulling in an existing frame loop, lower rates, and source-side filters all reduce wakes.
- Mark work with `OSSignposter` and record with Instruments or `xctrace`. The recorded intervals, a median of 99.6 µs per 10,000 updates, agreed with the benchmark.
- The Power Profiler doesn't run on macOS. Record on an iPhone or iPad, including on-device without Xcode, and watch the CPU, GPU, display, and networking lanes.
- iOS 27's `MetricManager.metricReports` delivers field metrics as typed values, including time at each location accuracy and background location time. `mxSignpost` intervals on its log handle come back aggregated from real devices.

## Exercise

Build a "location budget" check for a test run. Record the location accuracy the app requested over time, using the `desiredAccuracy` or `LiveConfiguration` changes your code makes, and compute a `LocationTime` from it, the same shape MetricKit reports. Assert that a 30-minute simulated session with the run screen open for 10 minutes spends at most 35% of its location time at best accuracy, and make the test fail when someone leaves best accuracy on after the run screen closes. On a device, compare your computed `LocationTime` with what MetricKit reports the next day.

## Further reading

- [Energy Efficiency Guide for iOS Apps: Fundamental Concepts](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/FundamentalConcepts.html), on dynamic and fixed costs
- [Profile and optimize power usage in your app](https://developer.apple.com/videos/play/wwdc2025/226/), WWDC25, introducing the Power Profiler
- [`OSSignposter`](https://developer.apple.com/documentation/os/ossignposter), for intervals visible in Instruments
- [MetricKit](https://developer.apple.com/documentation/metrickit), including `MXLocationActivityMetric` and the newer Swift `MetricManager`

Previous: [Stopping Updates When a Feature Ends](/ios-sensor-stopping-updates/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
