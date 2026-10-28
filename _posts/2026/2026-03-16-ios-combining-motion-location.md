---
layout: post
hidden: true
title: "Combining Motion and Location Without Shared-State Races"
date: "2026-03-16"
last_modified_at: "2026-03-16"
permalink: /ios-combining-motion-location/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Core Location, Concurrency, Kalman Filter]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Motion and location complement each other almost perfectly. GPS knows where the device is to within meters, but only once a second, and not at all in a tunnel. The accelerometer reports fifty times a second, but drifts by hundreds of meters a minute when integrated alone. Fusing them gives position estimates that are both smooth and anchored. The difficulty isn't the math. It's that the two sources arrive on different threads, at different rates, in an order that isn't the order of events, and the obvious way to combine them is a shared object that both write to, which is a data race.

This article builds the combination correctly in Swift 6 and measures each mistake on the way. A shared object written from two queues compiled with only a warning, and Thread Sanitizer reported a data race at once. Hopping onto an actor with a new `Task` per sample put 1.3% to 3.9% of samples out of order. Feeding both sources through one `AsyncStream` into an actor kept every sample in order. Then a Kalman filter in that actor fuses a biased accelerometer with GPS: through a simulated 30-second tunnel, the error stayed under 12 m in every run, against 242 m for GPS-only extrapolation. A first version that ignored *when* samples arrived learned an accelerometer bias forty times too large.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. They ran as a macOS command-line program on macOS 26. The sensor callbacks are simulated with dispatch queues and tasks shaped like Core Motion's and Core Location's, because the iOS simulator has no motion hardware. The simulated sensors use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import Synchronization
```

## The shared object

The first design that comes to mind is a class with a few properties: the latest speed, counts, a buffer. The accelerometer handler writes to it from Core Motion's queue, and the location delegate writes to it from the main thread. In Swift 6 language mode, capturing a non-`Sendable` class in a `DispatchQueue.async` closure produces a warning, not an error:

```swift
// Does not compile cleanly: Swift 6.4 warns "capture of 'fusion' with non-Sendable type 'Fusion' in a '@Sendable' closure"
final class Fusion { var lastSpeed = 0.0 }
func start(_ fusion: Fusion) {
    DispatchQueue(label: "motion").async { fusion.lastSpeed += 0.001 }
    DispatchQueue(label: "location").async { fusion.lastSpeed *= 0.999 }
}
```

It's a warning because Dispatch's annotations are imported with `@preconcurrency`, so the program builds and runs. The usual way to silence the warning is to mark the class `@unchecked Sendable`. That compiles cleanly and runs, and it's wrong:

```swift
/// The tempting shortcut: one object that both sensor callbacks write to, marked @unchecked Sendable to quiet Swift 6.
final class SharedFusion: @unchecked Sendable {
    var motionSamples = 0
    var locationFixes = 0
    var lastSpeed = 0.0
}

let shared = SharedFusion()
let motionQueue = DispatchQueue(label: "motion"), locationQueue = DispatchQueue(label: "location")
let both = DispatchGroup()
for _ in 0..<100_000 {
    motionQueue.async(group: both) { shared.motionSamples += 1; shared.lastSpeed += 0.001 }
    locationQueue.async(group: both) { shared.locationFixes += 1; shared.lastSpeed *= 0.999 }
}
let flushed = Mutex(false)
both.notify(queue: .main) { flushed.withLock { $0 = true } }
while !flushed.withLock({ $0 }) { try await Task.sleep(for: .milliseconds(10)) }
print("shared object: motion", shared.motionSamples, "location", shared.locationFixes, "of 100,000 each")
```

The counters came out exact, 100,000 each, because each counter is written by only one queue. `lastSpeed` is written by both. Built with `-sanitize=thread`, the same program produced two reports immediately: "Swift access race" for the overlapping accesses to the stored property, and "data race" for the read and write of its 8 bytes, each naming the two threads involved. Without the sanitizer, nothing visible happens. The value is just wrong some of the time, which is the worst kind of bug in a fusion engine, where wrong numbers look like noise.

## Getting samples into an actor, in order

An actor removes the race by owning the state. The question is how samples get into it. The obvious bridge from a callback, `Task { await engine.add(sample) }`, creates an independent task per sample, and independent tasks are scheduled independently. The test below delivers 10,000 numbered samples from a serial queue, first through one task each, then through one `AsyncStream` with a single consumer:

```swift
actor Log {
    private(set) var values: [Int] = []
    func append(_ value: Int) { values.append(value) }
}

/// Counts positions where a value is smaller than the one before it.
func inversions(_ values: [Int]) -> Int { zip(values.dropFirst(), values).filter { $0.0 < $0.1 }.count }

// A serial queue stands in for Core Motion's handler queue: 10,000 samples, in order.
let handlerQueue = DispatchQueue(label: "motion-handler")

// One task per sample, each hopping onto the actor.
let perSample = Log()
for i in 0..<10_000 {
    handlerQueue.async {
        Task { await perSample.append(i) }
    }
}
while await perSample.values.count < 10_000 { try await Task.sleep(for: .milliseconds(10)) }
let taskOrder = await perSample.values
print("task per sample:", taskOrder.count, "values,", inversions(taskOrder), "out of order")

// One AsyncStream: the handler yields, a single consumer appends.
let (stream, continuation) = AsyncStream.makeStream(of: Int.self)
let viaStream = Log()
let consumer = Task { for await value in stream { await viaStream.append(value) } }
for i in 0..<10_000 { handlerQueue.async { continuation.yield(i) } }
handlerQueue.sync { continuation.finish() }
await consumer.value
let streamOrder = await viaStream.values
print("one stream:", streamOrder.count, "values,", inversions(streamOrder), "out of order")
assert(inversions(streamOrder) == 0 && streamOrder.count == 10_000)
```

| Bridge | Out of order, three runs |
| --- | --- |
| One `Task` per sample | 128 to 387 of 10,000, over six runs |
| One `AsyncStream`, one consumer | 0, every run |

The serial queue produced the samples in order, and up to 3.9% of them still reached the actor out of order. Swift makes no promise about the order in which separately created tasks start. A stream does: its continuation is safe to call from any thread, and a single `for await` loop receives elements in the order they were yielded. The [accelerometer article](/ios-accelerometer-gyroscope/#receiving-samples-in-swift-6) wrapped each sensor in exactly this kind of stream.

This experiment also tripped over the isolation trap from earlier articles, in a new place. The first version waited for the queue with a `DispatchGroup`:

```swift
// Crashes: the notify closure is written in main-actor code, so it's main-actor isolated, and runs on a global queue
let group = DispatchGroup()
group.enter()
DispatchQueue.global().asyncAfter(deadline: .now() + 0.1) { group.leave() }
await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
    group.notify(queue: .global()) { done.resume() }
}
```

The closure passed to `notify` was created inside the continuation's body, which runs on the main actor, and Swift inferred main-actor isolation for it. When Dispatch ran it on a global queue, the process stopped with a trap before printing anything. Passing `queue: .main` would make it correct. The code in this article simply avoids the pattern.

## Two sources, one stream

Two sensors can share one stream. Wrap their samples in one `Sendable` enum and have both producers yield into the same continuation. Each producer's own order is preserved, and the consumer sees the two interleaved in arrival order. That's close to time order when samples are delivered as they're produced, and the [timestamps article](/ios-sensor-timestamps/#out-of-order-events) showed how to restore exact order when the jitter matters.

The consumer is an actor that owns a Kalman filter. Its state is position $p$, velocity $v$, and the accelerometer's bias $b$, along a road. Between samples, the measured acceleration $a$ drives the prediction:

$$
\begin{pmatrix} p \\ v \\ b \end{pmatrix}_{k+1} =
\begin{pmatrix} 1 & \Delta t & -\tfrac{1}{2}\Delta t^2 \\ 0 & 1 & -\Delta t \\ 0 & 0 & 1 \end{pmatrix}
\begin{pmatrix} p \\ v \\ b \end{pmatrix}_k +
\begin{pmatrix} \tfrac{1}{2}\Delta t^2 \\ \Delta t \\ 0 \end{pmatrix} a_k ,
$$

and its covariance grows by the accelerometer's noise, plus a small allowance for the bias to wander. A GPS fix $z$ with accuracy $\sigma$ corrects the state with the gain $K = P H^\top (H P H^\top + \sigma^2)^{-1}$, where $H = (1, 0, 0)$ picks out the position. The bias isn't measured directly. The filter learns it because a biased accelerometer makes predictions that GPS keeps contradicting in the same direction.

```swift
import simd

/// Everything the fusion engine consumes, as one Sendable type so both sources can share one ordered stream.
enum SensorInput: Sendable {
    case acceleration(time: Double, forward: Double)              // m/s², along the direction of travel
    case fix(time: Double, position: Double, accuracy: Double)    // meters along the road, 1σ in meters
}

/// A Kalman filter on position, velocity, and accelerometer bias along a road.
/// The accelerometer drives the prediction; GPS fixes correct it, and teach the filter the bias.
struct RoadKalman {
    private(set) var x = SIMD3<Double>(0, 0, 0)                     // position, velocity, bias
    private(set) var P = simd_double3x3(diagonal: SIMD3(100, 4, 0.04))
    let accelerationNoise: Double                                     // σ of one accelerometer sample, m/s²
    let biasWander: Double                                            // how fast the bias may drift, m/s² per √s
    private var time: Double?

    init(accelerationNoise: Double, biasWander: Double) {
        self.accelerationNoise = accelerationNoise; self.biasWander = biasWander
    }

    var position: Double { x.x }
    var bias: Double { x.z }

    mutating func predict(to t: Double, measuredAcceleration a: Double) {
        defer { time = t }
        guard let last = time, t > last else { return }
        let dt = t - last
        // p += v dt + ½ (a - b) dt², v += (a - b) dt, b stays.
        let F = simd_double3x3(rows: [SIMD3(1, dt, -dt * dt / 2), SIMD3(0, 1, -dt), SIMD3(0, 0, 1)])
        x = F * x + SIMD3(dt * dt / 2, dt, 0) * a
        let g = SIMD3(dt * dt / 2, dt, 0)
        let q = accelerationNoise * accelerationNoise
        var Q = simd_double3x3(rows: [g * g.x * q, g * g.y * q, SIMD3(0, 0, 0)])
        Q[2, 2] = biasWander * biasWander * dt
        P = F * P * F.transpose + Q
    }

    mutating func correct(position z: Double, accuracy: Double) {
        let H = SIMD3<Double>(1, 0, 0)
        let S = simd_dot(H, P * H) + accuracy * accuracy
        let K = (P * H) / S
        x += K * (z - simd_dot(H, x))
        let I = simd_double3x3(diagonal: SIMD3(1, 1, 1))
        let KH = simd_double3x3(rows: [K * H.x, K * H.y, K * H.z]).transpose
        P = (I - KH) * P
    }
}

/// The fusion engine: one actor owns the filter; one stream feeds it, in the order the sources produced.
actor FusionEngine {
    private var filter = RoadKalman(accelerationNoise: 0.1, biasWander: 0.002)
    private var lastAcceleration = 0.0
    private(set) var estimates: [(time: Double, position: Double)] = []

    func run(_ inputs: AsyncStream<SensorInput>) async {
        for await input in inputs {
            switch input {
            case .acceleration(let t, let a):
                filter.predict(to: t, measuredAcceleration: lastAcceleration)
                lastAcceleration = a
                estimates.append((t, filter.position))
            case .fix(let t, let p, let accuracy):
                filter.predict(to: t, measuredAcceleration: lastAcceleration)
                filter.correct(position: p, accuracy: accuracy)
            }
        }
    }

    var bias: Double { filter.bias }
}
```

## A drive through a tunnel

The test drive lasts 120 seconds. The car accelerates to 20 m/s, cruises, slows to 8 m/s, then drives through a tunnel from 50 to 80 seconds, where GPS has no signal, and accelerates again after it. The accelerometer reports at 50 Hz with a bias of 0.05 m/s² and noise of 0.1 m/s². GPS reports once a second with 4 m of noise. These are illustrative values, like the rest of the series' sensor models.

```swift
/// A 120 s drive: speed up to 20 m/s, cruise, slow to 8 m/s before a tunnel from 50 s to 80 s, speed up after it.
func trueAcceleration(_ t: Double) -> Double {
    switch t {
    case ..<10: return 2.0
    case 44..<50: return -2.0
    case 82..<88: return 2.0
    default: return 0
    }
}
func inTunnel(_ t: Double) -> Bool { t >= 50 && t < 80 }

let imuRate = 50.0, steps = Int(120 * imuRate), dt = 1 / imuRate
var truth: [Double] = []
var truthPosition = 0.0, truthVelocity = 0.0
for i in 0..<steps {
    let a = trueAcceleration(Double(i) * dt)
    truth.append(truthPosition)
    truthPosition += truthVelocity * dt + 0.5 * a * dt * dt
    truthVelocity += a * dt
}

// Sensors: the accelerometer has a 0.05 m/s² bias and 0.1 m/s² of noise; GPS has 4 m of noise, once a second,
// and nothing in the tunnel.
var noise = SeededGenerator(seed: 23)
let measured = (0..<steps).map { trueAcceleration(Double($0) * dt) + 0.05 + 0.1 * noise.gaussian() }
let fixes = stride(from: 0, to: steps, by: Int(imuRate)).filter { !inTunnel(Double($0) * dt) }
    .map { (index: $0, position: truth[$0] + 4 * noise.gaussian()) }
```

The producers model the two callback sources: each runs on its own and delivers samples at the pace its sensor produces them, on a clock sped up 20 times so the test takes six seconds instead of two minutes. Two alternatives provide comparison: integrating the accelerometer alone, and extrapolating from the last two GPS fixes.

```swift
// Two producers, like Core Motion's queue and Core Location's delegate, each delivering at the pace its sensor
// produces (with the clock sped up 20 times), into one stream.
let (sensorStream, sensorContinuation) = AsyncStream.makeStream(of: SensorInput.self)
let engine = FusionEngine()
let running = Task { await engine.run(sensorStream) }
let clock = ContinuousClock(), origin = clock.now
let speedUp = 20.0
let imuProducer = Task.detached {
    for i in 0..<steps {
        let t = Double(i) * dt
        try? await clock.sleep(until: origin + .seconds(t / speedUp))
        sensorContinuation.yield(.acceleration(time: t, forward: measured[i]))
    }
}
let gpsProducer = Task.detached {
    for fix in fixes {
        let t = Double(fix.index) * dt
        try? await clock.sleep(until: origin + .seconds(t / speedUp))
        sensorContinuation.yield(.fix(time: t, position: fix.position, accuracy: 4))
    }
}
await imuProducer.value; await gpsProducer.value
sensorContinuation.finish()
await running.value
let fused = await engine.estimates.sorted { $0.time < $1.time }.map(\.position)
let learnedBias = await engine.bias

// Alternative 1: integrate the accelerometer alone, from the true start.
var reckoned: [Double] = [], speed = 0.0, position = 0.0
for i in 0..<steps { reckoned.append(position); position += speed * dt; speed += measured[i] * dt }

// Alternative 2: GPS alone, extrapolating at the speed between the last two fixes.
var extrapolated: [Double] = []
var fixIterator = 0
for i in 0..<steps {
    while fixIterator + 1 < fixes.count && fixes[fixIterator + 1].index <= i { fixIterator += 1 }
    let last = fixes[fixIterator]
    let previous = fixes[max(fixIterator - 1, 0)]
    let velocity = last.index == previous.index ? 0 : (last.position - previous.position) / (Double(last.index - previous.index) * dt)
    extrapolated.append(last.position + velocity * Double(i - last.index) * dt)
}

func errors(_ estimate: [Double], against truth: [Double], where keep: (Int) -> Bool) -> (rms: Double, max: Double) {
    let e = (0..<min(estimate.count, truth.count)).filter(keep).map { abs(estimate[$0] - truth[$0]) }
    return ((e.map { $0 * $0 }.reduce(0, +) / Double(e.count)).squareRoot(), e.max()!)
}
let tunnel: (Int) -> Bool = { inTunnel(Double($0) / 50) }
let open: (Int) -> Bool = { !inTunnel(Double($0) / 50) && $0 > 250 }
print("fused estimates", fused.count, "learned bias", learnedBias)
for (name, estimate) in [("accelerometer only", reckoned), ("GPS only", extrapolated), ("fused", fused)] {
    let outside = errors(estimate, against: truth, where: open), inside = errors(estimate, against: truth, where: tunnel)
    print(name.padding(toLength: 20, withPad: " ", startingAt: 0),
          String(format: "open road RMS %6.1f m | tunnel RMS %6.1f m, max %6.1f m", outside.rms, inside.rms, inside.max))
}
```

| Estimate | Open road, RMS error | Tunnel, RMS error | Tunnel, worst error |
| --- | --- | --- | --- |
| Accelerometer only | 183.7 m | 111.5 m | 161.7 m |
| GPS only, extrapolated | 6.2 m | 141.9 m | 241.7 m |
| Fused | **2.7 m** | **5.3 to 7.5 m** | **7.8 to 11.6 m** |

Each source alone fails in its own way. The accelerometer alone drifts with its bias, by about half of $0.05\,t^2$ meters, which is 360 m after two minutes. GPS alone is decent in the open, but extrapolating through the tunnel at the speed between the last two fixes is a disaster, because that speed is computed from two fixes each 4 m off, so it's uncertain by about $\sqrt 2 \times 4 = 5.7$ m/s. The fused estimate beat GPS even in the open, because the accelerometer smooths the jitter between fixes, and through the tunnel it never strayed more than 11.6 m. The fused numbers vary slightly between runs, because the two paced producers interleave a little differently each time, which shifts when each fix is applied. The single-sensor rows don't depend on timing and were identical in every run. It learned the bias as 0.055 to 0.057 m/s², against a true value of 0.05, from the open-road stretch before the tunnel. That's what kept dead reckoning honest for 30 seconds without GPS.

### The version that ignored arrival time

The first version of this test produced every sample at once: each producer looped over its sensor's whole recording and yielded as fast as it could. The fused result was absurd: an open-road error of 678 m, and a learned bias of 2.0 m/s², forty times the truth. The accelerometer producer had pushed all 6,000 samples through before the consumer saw most GPS fixes, so each fix arrived after the filter had already predicted to the end of the drive. Each correction was applied 'now' to a fix taken minutes earlier, and the filter explained the mismatch the only way it could, with an enormous bias.

Real sensors don't do that, because they produce samples in real time, which is why the paced producers fixed it. But replaying a recording at full speed, which is exactly what the [testing article](/ios-sensor-recorded-data-tests/) will do, recreates the problem. A fusion engine that might ever see replayed data has to order by timestamp, not arrival, using a reorder buffer, or a replay source that releases events in timestamp order on a virtual clock.

## Summary

- Writing shared state from Core Motion's queue and Core Location's delegate is a data race. Swift 6.4 only warns about it with Dispatch, `@unchecked Sendable` silences even the warning, and Thread Sanitizer reported it immediately.
- Hopping to an actor with one `Task` per sample doesn't preserve order: 1.3% to 3.9% of 10,000 ordered samples arrived out of order. One `AsyncStream` with a single consumer preserved order exactly.
- A closure written in main-actor code and handed to Dispatch is main-actor isolated. `DispatchGroup.notify` on a global queue trapped.
- Merge both sensors into one stream of a `Sendable` enum and let one actor own the fusion state.
- A three-state Kalman filter (position, velocity, accelerometer bias) fused a 50 Hz accelerometer with 1 Hz GPS. Through a 30 s tunnel it stayed within 7.8 to 11.6 m, against 242 m for GPS extrapolation and 162 m for the accelerometer alone. It learned the bias to within 14%.
- Fusion depends on event time. Feeding samples in arrival order from a full-speed replay produced a 678 m error and a fortyfold bias. Order by timestamp whenever producers aren't real-time.

## Exercise

Add the [reorder buffer](/ios-sensor-timestamps/#out-of-order-events) to `FusionEngine` so it processes inputs in timestamp order, with an allowed lateness in *event time* rather than arrival time. Then reproduce the failing full-speed replay, with every sample yielded at once, and show that the buffered engine gives the same answer as the paced one. Finally, let the GPS fixes arrive 300 ms late, as fixes from a busy main thread might, and measure what the allowed lateness must be for the result not to change.

## Further reading

- R. E. Kalman, "A New Approach to Linear Filtering and Prediction Problems", *Journal of Basic Engineering* 82(1), 1960, [doi:10.1115/1.3662552](https://doi.org/10.1115/1.3662552)
- Greg Welch and Gary Bishop, [An Introduction to the Kalman Filter](https://techreports.cs.unc.edu/papers/95-041.pdf), University of North Carolina TR 95-041, a short and practical derivation
- [`AsyncStream`](https://developer.apple.com/documentation/swift/asyncstream) and [`AsyncStream.Continuation`](https://developer.apple.com/documentation/swift/asyncstream/continuation)
- [Thread Sanitizer](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early), in Xcode's guide to diagnosing issues early

Previous: [Timestamps, Stale Samples, and Out-of-Order Events](/ios-sensor-timestamps/)

Next: [Distinguishing Missing Data from a Valid Zero Reading](/ios-sensor-missing-data/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
