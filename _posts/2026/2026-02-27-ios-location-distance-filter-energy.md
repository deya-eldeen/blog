---
layout: post
hidden: true
title: "Distance Filters and Energy-Aware Tracking"
date: "2026-02-27"
last_modified_at: "2026-02-27"
permalink: /ios-location-distance-filter-energy/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Energy, Sensors]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Tracking a route costs energy in two places. The radios and the location processors do the measuring, and Core Location decides how hard they work from the accuracy, activity, and pausing settings an app chooses. The app itself wakes up for every update it receives, and it decides how many that is with a distance filter. Most discussions of distance filters stop at energy: fewer updates, less work. But a distance filter is also a sampling decision, and it changes the *answer*. Set it too low and GPS jitter adds distance that was never run. Set it too high and the route cuts every corner.

This article measures both effects. On a simulated 400 m track with 5 m of GPS noise, ten laps measured from every fix came out 169% too long. With a 40 m filter they were 0.5% long, and with a 90 m filter 22% short. A short derivation predicts the best spacing, about 34 m for these numbers. Then it checks what `distanceFilter` really measures in the simulator: walking back and forth over 15 m for 20 seconds produced no updates at all with a 25 m filter. It finishes with the settings that decide the system's share of the energy, including one the simulator silently refuses to change.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The track simulation ran as a macOS command-line program on macOS 26, in an optimized build because it filters 1,600 noisy laps, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, with routes scripted by `simctl`. The noise uses the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import CoreLocation
import simd
```

## What a distance filter does

Apple's documentation defines `distanceFilter` as "the minimum distance in meters the device must move horizontally before an update event is generated", and adds the detail that decides its behavior: "this location manager measures this relative to the previously delivered location." The default is `kCLDistanceFilterNone`, which reads as −1, and means every update.

That definition makes a distance filter a *spatial* sampler. It doesn't sample every few seconds. It waits until the device is far enough from the last fix it delivered. The model below does the same thing with positions in meters, on a standard-shaped running track: a 400 m oval with bends of radius 36.5 m, so each straight is 85.3 m long.

```swift
/// A 400 m oval: two straights joined by semicircular bends of radius 36.5 m. Positions in meters.
struct Track {
    let radius = 36.5
    var straight: Double { (400 - 2 * .pi * radius) / 2 }

    /// The point at distance `s` along the track, measured from the start of the first straight.
    func point(at s: Double) -> SIMD2<Double> {
        let s = s.truncatingRemainder(dividingBy: 400)
        let bend = .pi * radius
        switch s {
        case ..<straight:
            return SIMD2(s, -radius)
        case ..<(straight + bend):
            let angle = -.pi / 2 + (s - straight) / radius
            return SIMD2(straight + radius * cos(angle), radius * sin(angle))
        case ..<(2 * straight + bend):
            return SIMD2(straight - (s - straight - bend), radius)
        default:
            let angle = .pi / 2 + (s - 2 * straight - bend) / radius
            return SIMD2(radius * cos(angle), radius * sin(angle))
        }
    }
}

/// Applies a distance filter the way Core Location documents it: relative to the previously delivered location.
func distanceFiltered(_ fixes: [SIMD2<Double>], minimum: Double) -> [SIMD2<Double>] {
    var delivered: [SIMD2<Double>] = []
    for fix in fixes where delivered.last.map({ simd_distance($0, fix) >= minimum }) ?? true { delivered.append(fix) }
    return delivered
}

func pathLength(_ points: [SIMD2<Double>]) -> Double {
    zip(points.dropFirst(), points).reduce(0) { $0 + simd_distance($1.0, $1.1) }
}

let track = Track()
let clean = (0..<1_143).map { track.point(at: 3.5 * Double($0)) }    // 10 laps at 3.5 m/s, one fix per second
print("straight", track.straight, "clean length", pathLength(clean))
```

A runner at 3.5 m/s produces one fix per second, 1,143 fixes over ten laps. Even with perfect fixes, the polyline through them measures 3,996.1 m for a 3,997 m run, because each segment is a chord across a curve. That's the first of the two effects.

## Two errors that pull in opposite directions

**Cutting corners.** On a bend of radius $R$, a chord spanning an arc of length $s$ has length

$$
c = 2R \sin\frac{s}{2R} \approx s \left(1 - \frac{s^2}{24R^2}\right) ,
$$

so sparse samples *underestimate* a curved path by a fraction $s^2/24R^2$ on its curved parts. At 1 m spacing that's invisible. At 60 m on a 36.5 m bend it's 11%.

**Adding jitter.** Now give every fix an independent error with standard deviation $\sigma$ per axis. A segment between two noisy fixes $s$ apart is the true step plus the difference of two errors, which has standard deviation $\sqrt 2\,\sigma$ per axis. The error along the segment averages out, but the error across it always adds length. For $s \gg \sigma$,

$$
\mathbb{E}\,\lvert \text{segment} \rvert \approx \sqrt{s^2 + 2\sigma^2} \approx s + \frac{\sigma^2}{s} ,
$$

so noise *overestimates* the path by a fraction $\sigma^2/s^2$. With fixes 3.5 m apart and 5 m of noise, the condition $s \gg \sigma$ fails completely and the jitter dominates the path.

The two fractions move in opposite directions as the spacing $s$ grows. With a fraction $f$ of the path curved, they balance when $\sigma^2/s^2 = f s^2 / 24R^2$, at

$$
s^* = \left(\frac{24\,\sigma^2 R^2}{f}\right)^{1/4} \propto \sqrt{\sigma R} .
$$

For 5 m of noise on this track, where the bends are 57% of the distance, $s^* = 34$ m. The best spacing grows with the square root of both the noise and the bend radius: a city street grid with 10 m corners wants a finer filter than a highway.

## Measuring the trade-off

Noise comes in two kinds for this experiment. Independent noise matches the derivation. *Correlated* noise, which keeps most of its value from one second to the next over a correlation time of 30 s, is closer to how GPS errors behave, as the [altitude article](/ios-altimeter-pressure/#absolute-altitude-and-averaging-that-doesnt-average) discussed. Each threshold runs over 100 noisy copies of the ten laps:

```swift
/// Adds GPS-like noise to each fix: σ meters per axis, correlated over `tau` seconds (0 means independent).
func noisy(_ points: [SIMD2<Double>], sigma: Double, tau: Double, using random: inout SeededGenerator) -> [SIMD2<Double>] {
    let phi = tau > 0 ? exp(-1 / tau) : 0
    var error = SIMD2(random.gaussian(), random.gaussian()) * sigma
    return points.map { point in
        defer { error = phi * error + (1 - phi * phi).squareRoot() * sigma * SIMD2(random.gaussian(), random.gaussian()) }
        return point + error
    }
}

let trueLength = 3.5 * 1_142
// Noise inflates each segment by about σ²/s²; bends shorten it by about s²/24R², on the fraction f of the track that bends.
let bendFraction = 2 * Double.pi * track.radius / 400
let bestSpacing = pow(24 * 25 * track.radius * track.radius / bendFraction, 0.25)
print("predicted best spacing for σ = 5 m:", bestSpacing, "m; bends are", bendFraction * 100, "% of the track")
let thresholds: [Double] = [0, 5, 10, 20, 30, 40, 60, 90]
for (label, tau) in [("independent noise", 0.0), ("noise correlated over 30 s", 30)] {
    var random = SeededGenerator(seed: 16)
    var totals = Array(repeating: 0.0, count: thresholds.count)
    var deliveries = Array(repeating: 0, count: thresholds.count)
    let runs = 100
    for _ in 0..<runs {
        let fixes = noisy(clean, sigma: 5, tau: tau, using: &random)
        for (i, threshold) in thresholds.enumerated() {
            let kept = distanceFiltered(fixes, minimum: threshold)
            totals[i] += pathLength(kept)
            deliveries[i] += kept.count
        }
    }
    print(label)
    for (i, threshold) in thresholds.enumerated() {
        let mean = totals[i] / Double(runs)
        print(String(format: "  filter %3.0f m: %4d deliveries, length %6.0f m (%+.1f%%)", threshold,
                     deliveries[i] / runs, mean, (mean / trueLength - 1) * 100))
    }
}
```

| Filter | Independent noise: deliveries | Length | Correlated noise: deliveries | Length |
| --- | --- | --- | --- | --- |
| none | 1,143 | +168.9% | 1,143 | +7.0% |
| 5 m | 917 | +151.7% | 585 | +3.3% |
| 10 m | 521 | +87.8% | 339 | +1.6% |
| 20 m | 186 | +12.1% | 183 | −0.1% |
| 30 m | 121 | +2.7% | 124 | −1.5% |
| 40 m | 92 | +0.5% | 93 | −3.3% |
| 60 m | 61 | −3.6% | 60 | −8.4% |
| 90 m | 34 | −21.8% | 25 | −43.9% |

With independent noise, the measured optimum lies between 30 and 40 m, around the predicted 34 m, and unfiltered fixes overstate ten laps by 6.7 km. Correlated noise is much kinder to unfiltered tracks, at +7%, because consecutive errors nearly cancel within each segment. That moves the optimum down to about 20 m, where the error was −0.1%. In both cases the deliveries fall roughly in proportion to the filter, from 1,143 to about 120 at 30 m. So a well-chosen filter improves accuracy and cuts the app's wake-ups by an order of magnitude at the same time.

A real app doesn't know $\sigma$ in advance, but it receives `horizontalAccuracy` with every fix. A reasonable rule derived from this analysis: a filter of a few times the typical accuracy, scaled up on open roads and down in dense streets. For a runner with 5 m fixes, 20 to 30 m.

## What the simulator shows about `distanceFilter`

The test sets a 25 m filter and drives east at 10 m/s with one fix per second:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
@MainActor final class Deliveries: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var fixes: [(at: Date, location: CLLocation)] = []
    private(set) var pauses = 0
    override init() { super.init(); manager.delegate = self }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { fixes.append((Date(), location)) }
    }
    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) { pauses += 1 }
    func since(_ date: Date) -> [CLLocation] { fixes.filter { $0.at > date.addingTimeInterval(0.5) }.map(\.location) }
}

let filtered = Deliveries()
print("defaults: distanceFilter", filtered.manager.distanceFilter, "pauses automatically", filtered.manager.pausesLocationUpdatesAutomatically,
      "activity type", filtered.manager.activityType.rawValue)
filtered.manager.pausesLocationUpdatesAutomatically = true
print("after setting true:", filtered.manager.pausesLocationUpdatesAutomatically)
assert(!filtered.manager.pausesLocationUpdatesAutomatically, "immutable on this platform")
filtered.manager.distanceFilter = 25
filtered.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(1))
var phase = Date()
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1100
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(15))
let straight = filtered.since(phase)
let spacing = zip(straight.dropFirst(), straight).map { $0.distance(from: $1) }
print("straight route, filter 25 m:", straight.count, "deliveries in 15 s, spacing", spacing.map { String(format: "%.1f", $0) })
assert(spacing.allSatisfy { $0 >= 25 && $0 < 31 })
phase = Date()
```

The deliveries came 30.2 to 30.3 m apart. The filter waited for the first underlying fix at least 25 m from the last delivered one, and at 10 m/s that's every third fix. An app expecting exactly 25 m will see more, by up to one step of the underlying rate.

The second route makes the documented definition concrete. The device walks back and forth between two points 15 m apart, three round trips at 5 m/s:

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=5 --interval=1 51.5007,-0.1246 51.5007,-0.12438 51.5007,-0.1246 51.5007,-0.12438 51.5007,-0.1246 51.5007,-0.12438 51.5007,-0.1246
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(20))
let pacing = filtered.since(phase)
print("pacing back and forth 15 m, filter 25 m:", pacing.count, "deliveries in 20 s")
assert(pacing.isEmpty, "100 m walked, but never 25 m from the last delivered fix")
filtered.manager.stopUpdatingLocation()
```

It covered 100 m in 20 seconds and received **no** updates, because it was never 25 m from the last delivered fix. For pacing on a platform, circling a parking lot, or exploring a room, a distance filter reports a stationary user. An app that uses updates as a heartbeat, for example "the user is still active", must not use a distance filter, or must combine it with a timer.

The test also printed the manager's defaults. `distanceFilter` was −1, `activityType` was 1 (`.other`), and `pausesLocationUpdatesAutomatically` was `false`. Setting it to `true` read back `false`. Apple's documentation explains why: "on supported platforms the default value of this property is true; otherwise the default value is false and is immutable." The iOS simulator is evidently not a supported platform, so automatic pausing can't be tested there. Code that handles `locationManagerDidPauseLocationUpdates(_:)` needs a device, or a test double.

## Standing still with `liveUpdates`

`CLLocationUpdate.liveUpdates()` has no distance filter. Instead, Apple documents a `stationary` property (previously `isStationary`): when "Core Location stops delivering updates because the device is stationary, then it sets isStationary to true," and "the framework can suspend updates until the person starts moving." The test held the device still for 45 seconds:

<!-- sim-run -->
```sh
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
// Standing still under liveUpdates: does Core Location say so?
let stillStart = Date()
var stillUpdates: [(seconds: Double, location: Bool, stationary: Bool)] = []
let watcher = Task { @MainActor in
    for try await update in CLLocationUpdate.liveUpdates() {
        stillUpdates.append((Date().timeIntervalSince(stillStart), update.location != nil, update.stationary))
    }
}
try await Task.sleep(for: .seconds(45))
watcher.cancel()
assert(stillUpdates.count <= 3 && !stillUpdates.contains { $0.stationary })
print("45 s standing still:", stillUpdates.map { String(format: "%.1f s loc %d stationary %d", $0.seconds, $0.location ? 1 : 0, $0.stationary ? 1 : 0) })
```

Two updates arrived in 45 seconds: one with no location at the start, then one fix, then silence. Neither set `stationary`. So in the simulator, a still device simply stops producing updates, and nothing says why. On a device the flag should appear, but code shouldn't depend on it: treat "no update for a while" as "probably not moving" only after checking the other reasons updates stop, such as authorization and availability, which `CLLocationUpdate` also reports. For spatial filtering on top of `liveUpdates`, apply the `distanceFiltered` logic above to the stream in the consumer. It's the same rule, relative to the last fix the consumer kept.

## The system's share of the energy

A distance filter controls the app's wake-ups, but not the hardware. Core Location keeps measuring at the accuracy the app requested, filtered or not. Apple's archived [Energy Efficiency Guide for iOS Apps](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/LocationBestPractices.html) lists the levers for the system's share. Its section titles are a good checklist:

- "Stop Location Services When You Aren't Using Them". The [stopping updates article](/ios-sensor-stopping-updates/) covers this.
- "Reduce Accuracy of Standard Location Updates Whenever Possible". A weather feature doesn't need `kCLLocationAccuracyBest`.
- "Stop Location Updates if Accuracy Doesn't Match Expectations". If good fixes aren't coming indoors, keeping the radios searching won't produce them. The [time budget](/ios-location-updates-accuracy/#waiting-for-a-good-enough-fix) from the accuracy article is the mechanism.
- "Auto-Pause and Specify an Activity Type", so Core Location knows, for example, that a car that stops at a light is still on a trip, but one parked in a garage isn't.
- "Register for Significant-Change Location Updates" and "Restrict Location Updates to Specific Regions or Locations", the subjects of the next articles.

For `liveUpdates`, the `LiveConfiguration` passes the activity, and the [accuracy article](/ios-location-updates-accuracy/#what-a-fix-contains) lists its cases. The simulator can't measure energy at all, since it runs on the Mac's power and has no radios. The [profiling article](/ios-sensor-profiling-battery/) measures it on hardware.

## Summary

- `distanceFilter` delivers a fix only when the device is at least that far from the *last delivered* fix. It's a spatial sampler, not a timer.
- Sparse samples cut corners, underestimating a curve of radius $R$ by $s^2/24R^2$. Noisy samples add jitter, overestimating by $\sigma^2/s^2$. The best spacing is $(24\sigma^2R^2/f)^{1/4}$, about 34 m for 5 m noise on a 400 m track.
- On simulated laps, unfiltered 1 Hz fixes overstated the distance by 169% with independent noise and 7% with correlated noise. A 40 m filter brought the error to 0.5%, and 20 m to 0.1%, while cutting deliveries about tenfold. 90 m understated by 22% to 44%.
- In the simulator, a 25 m filter delivered fixes 30.2 to 30.3 m apart at 10 m/s. Pacing 100 m back and forth over 15 m produced no updates at all.
- `pausesLocationUpdatesAutomatically` is `false` and immutable in the simulator, as Apple documents for unsupported platforms. A still device under `liveUpdates` just went quiet, without setting `stationary`.
- The filter saves the app's work, but accuracy, activity type, pausing, and stopping decide the hardware's. Choose all of them for the feature.

## Exercise

Make the distance filter adaptive. Instead of a fixed threshold, use $k$ times the median `horizontalAccuracy` of the last ten fixes, and search for the $k$ that minimizes the length error on the track simulation, with noise whose $\sigma$ switches between 3 m and 15 m every two laps, like a run that passes between tall buildings. Compare the adaptive filter with the best fixed one, on both length error and number of deliveries.

## Further reading

- [`distanceFilter`](https://developer.apple.com/documentation/corelocation/cllocationmanager/distancefilter) and [`pausesLocationUpdatesAutomatically`](https://developer.apple.com/documentation/corelocation/cllocationmanager/pauseslocationupdatesautomatically)
- [`activityType`](https://developer.apple.com/documentation/corelocation/cllocationmanager/activitytype), the cue Core Location uses to decide when to pause
- [Energy Efficiency Guide for iOS Apps: Reduce Location Accuracy and Duration](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/LocationBestPractices.html), archived but still the clearest list of Apple's location energy practices

Previous: [Location Updates and Accuracy Requirements](/ios-location-updates-accuracy/)

Next: [Heading, Compass Calibration, and Magnetic Interference](/ios-heading-compass/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
