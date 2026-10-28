---
layout: post
hidden: true
title: "Region Monitoring and Geofencing"
date: "2026-03-04"
last_modified_at: "2026-03-04"
permalink: /ios-region-monitoring-geofencing/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Sensors, Probability]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A geofence asks a yes-or-no question, "is the user inside this circle?", of data that only ever answers "probably". Near the edge, the probability hovers around a half, and a rule that flips on every fix produces a storm of enter and exit events. Core Location's monitoring service hides this behind its own logic, takes minutes to decide, and allows only 20 conditions per app. An app that geofences anything at scale, such as stores, stops, or delivery addresses, has to understand both what the system does and what it would take to do it better.

This article starts with the probability itself: the chance that a user is inside a fence given one noisy fix, computed exactly from the Rice distribution and checked against simulation. A fix exactly on the boundary means a 46% chance of being inside, not 50%. On a walk that skirted a fence's edge, the obvious rule changed its mind 35 times, while a rule built on that probability, with hysteresis and a short dwell, changed it 0.46 times on average. Then it covers `CLMonitor`, Core Location's monitoring API since iOS 17, including how its records persist across launches, and a scheme for watching hundreds of places within the 20-condition limit.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, with routes scripted by `simctl`. Simulations use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import CoreLocation
import simd
```

## What Core Location offers

Since iOS 17, region monitoring goes through `CLMonitor`, an actor that monitors *conditions*. A circular geographic condition has a center and a radius. A beacon identity condition matches Bluetooth beacons. The monitor delivers an `AsyncSequence` of events, each with a state: `.satisfied`, `.unsatisfied`, `.unknown`, or `.unmonitored`. Apple's guide [Monitoring the user's proximity to geographic regions](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions) sets the ground rules:

- "Core Location prevents any single app from monitoring more than 20 conditions of any type simultaneously."
- "If an iOS app isn't running when a condition is satisfied, the system tries to launch it." After relaunch, "recreate the monitor with the same identifier".
- "Monitoring can only occur after the user unlocks the device after a reboot."

The older API, `startMonitoring(for:)` with a `CLCircularRegion`, has the same limit of 20 regions. Its documentation adds two facts that apply to the service as a whole. It "requires network connectivity" to report changes in a timely manner. And on its era's devices, "an app can expect to receive the appropriate region entered or region exited notification within 3 to 5 minutes on average, if not sooner." Monitoring is built for errands, not for precision. A user walking at 1.4 m/s covers 250 to 420 m in 3 to 5 minutes.

The [permission changes article](/ios-location-permission-changes/#what-reduced-accuracy-means) found one more condition: region events aren't delivered at all without full accuracy, and a `CLMonitor` event's `accuracyLimited` flag says so.

## The probability of being inside

Treat a fix as the true position plus Gaussian error with standard deviation $\sigma$ on each axis, and let the fix lie at distance $d$ from a fence's center. Given the fix, the true position is a Gaussian centered on the fix, and its distance $\rho$ from the fence's center follows the **Rice distribution**:

$$
f(\rho) = \frac{\rho}{\sigma^2} \exp\!\left(-\frac{\rho^2 + d^2}{2\sigma^2}\right) I_0\!\left(\frac{\rho\, d}{\sigma^2}\right),
\qquad
P(\text{inside}) = \int_0^R f(\rho)\, d\rho ,
$$

where $I_0$ is the modified Bessel function of the first kind and order zero, and $R$ is the fence radius. The integral has no closed form (it's one minus Marcum's Q-function), so the code integrates it numerically:

```swift
/// e^-x · I0(x), the exponentially scaled modified Bessel function of order zero. Scaling keeps it finite:
/// I0 itself overflows a Double above x ≈ 713, which a 5 m fix a few hundred meters from a fence easily reaches.
func scaledBesselI0(_ x: Double) -> Double {
    x < 30 ? scaledBesselI0Series(x) : scaledBesselI0Asymptotic(x)
}

/// The power series of I0, multiplied by e^-x. Accurate for small and moderate x.
func scaledBesselI0Series(_ x: Double) -> Double {
    var sum = 1.0, term = 1.0, k = 1.0
    while term > sum * 1e-17 {
        term *= (x / (2 * k)) * (x / (2 * k))
        sum += term
        k += 1
    }
    return sum * exp(-x)
}

/// The asymptotic expansion e^-x·I0(x) ≈ (1 + 1/8x + 9/2(8x)² + 75/2(8x)³) / √(2πx), accurate for large x.
func scaledBesselI0Asymptotic(_ x: Double) -> Double {
    let t = 1 / (8 * x)
    return (1 + t * (1 + t * (9.0 / 2 + t * (75.0 / 2)))) / (2 * .pi * x).squareRoot()
}

/// Probability that the true position is within `radius` of a fence's center, given a fix `distance` from that center
/// and Gaussian position error with standard deviation `sigma` per axis. The true distance then follows a Rice
/// distribution, integrated here with Simpson's rule. The exponent is written as -(r - d)²/2σ² so that
/// it pairs with the scaled Bessel function.
func probabilityInside(distance d: Double, radius: Double, sigma: Double) -> Double {
    let n = 400, h = radius / Double(n)
    func density(_ r: Double) -> Double {
        r / (sigma * sigma) * exp(-(r - d) * (r - d) / (2 * sigma * sigma)) * scaledBesselI0(r * d / (sigma * sigma))
    }
    var sum = density(0) + density(radius)
    for i in 1..<n { sum += density(Double(i) * h) * (i % 2 == 1 ? 4 : 2) }
    return min(1, sum * h / 3)
}

var random = SeededGenerator(seed: 18)
print(" d (m)   P(inside), R = 100 m, σ = 20 m   simulated")
for d in [0.0, 50, 80, 100, 120, 150] {
    let inside = (0..<100_000).filter { _ in
        simd_length(SIMD2(d + 20 * random.gaussian(), 20 * random.gaussian())) <= 100
    }.count
    print(String(format: "%5.0f    %.4f                             %.4f", d, probabilityInside(distance: d, radius: 100, sigma: 20),
                 Double(inside) / 100_000))
}
// The case that overflowed an unscaled version: a precise fix far outside a small fence.
let far = probabilityInside(distance: 674, radius: 100, sigma: 5)
assert(far == 0 && !far.isNaN)
// And the two branches agree where they meet.
assert(abs(scaledBesselI0Series(30) / scaledBesselI0Asymptotic(30) - 1) < 1e-6)
```

| Fix distance from center | $P(\text{inside})$, $R$ = 100 m, $\sigma$ = 20 m | Simulated |
| --- | --- | --- |
| 0 m | 1.0000 | 1.0000 |
| 50 m | 0.9909 | 0.9908 |
| 80 m | 0.8126 | 0.8117 |
| 100 m (on the edge) | 0.4599 | 0.4588 |
| 120 m | 0.1375 | 0.1377 |
| 150 m | 0.0049 | 0.0045 |

A fix on the boundary gives a 46% chance of being inside. The circle curves away from the fix, so more of the error distribution falls outside than inside. A fix 20 m inside, one standard deviation, is still only 81% likely to be inside.

The implementation detail in the code is not decoration. The first version computed $I_0$ directly, and it passed every macOS check, where $\sigma$ was 20 m. In the simulator, fixes had a 5 m accuracy, and a fix 674 m from a small fence pushes the Bessel function's argument past 2,600. $I_0$ overflows a `Double` above about 713, so the density became $\infty \times 0 = $ NaN. And Swift's `min(1, .nan)` returns 1, because every comparison with NaN is false, so the fence reported "inside" from 674 m away. The fix is to compute $e^{-x} I_0(x)$ instead, with a power series for small arguments and the asymptotic expansion for large ones, and to fold the $e^{x}$ back into the exponent. The two branches agree to within $10^{-6}$ where they meet.

## Deciding with hysteresis

The probability turns a fix into evidence. A decision rule turns evidence into states. The obvious rule, inside whenever the fix is inside, uses none of it. The confident rule below enters only when $P(\text{inside}) > 0.9$, leaves only when $P < 0.1$, and requires the contradicting evidence for three consecutive fixes before switching:

```swift
/// Decides inside or outside from a stream of distances to a fence's center.
protocol FenceRule {
    mutating func update(distance: Double, sigma: Double) -> Bool    // true while inside
}

/// The obvious rule: inside whenever the fix is inside.
struct NaiveFence: FenceRule {
    let radius: Double
    mutating func update(distance: Double, sigma: Double) -> Bool { distance <= radius }
}

/// Enter only when it's very likely the user is inside, leave only when it's very likely they're outside,
/// and require the evidence to hold for `dwell` consecutive fixes.
struct ConfidentFence: FenceRule {
    let radius: Double
    var enter = 0.9, exit = 0.1, dwell = 3
    private(set) var inside = false
    private var streak = 0

    init(radius: Double) { self.radius = radius }

    mutating func update(distance: Double, sigma: Double) -> Bool {
        let p = probabilityInside(distance: distance, radius: radius, sigma: sigma)
        let contradicts = inside ? p < exit : p > enter
        streak = contradicts ? streak + 1 : 0
        if streak >= dwell { inside.toggle(); streak = 0 }
        return inside
    }
}

/// Counts how often a rule changes its mind over a walk, and where it first says "inside" and last says "inside".
func evaluate<R: FenceRule>(_ rule: R, along path: [SIMD2<Double>], sigma: Double, seed: UInt64)
    -> (transitions: Int, firstInside: Int?, lastInside: Int?) {
    var rule = rule
    var random = SeededGenerator(seed: seed)
    var state = false, transitions = 0
    var first: Int?, last: Int?
    for (i, point) in path.enumerated() {
        let fix = point + SIMD2(random.gaussian(), random.gaussian()) * sigma
        let now = rule.update(distance: simd_length(fix), sigma: sigma)
        if now != state { transitions += 1; state = now }
        if now { first = first ?? i; last = i }
    }
    return (transitions, first, last)
}

// A walk at 1.4 m/s past the fence, 95 m from its center at the closest: always just inside the 100 m edge for a while.
let skirting = (0..<300).map { SIMD2(-210 + 1.4 * Double($0), 95.0) }
// A walk straight through the center.
let crossing = (0..<300).map { SIMD2(-210 + 1.4 * Double($0), 0.0) }

let sigma = 8.0
for (name, path) in [("skirting the edge", skirting), ("crossing the center", crossing)] {
    var naiveTotal = 0, confidentTotal = 0
    for seed in 0..<100 {
        naiveTotal += evaluate(NaiveFence(radius: 100), along: path, sigma: sigma, seed: UInt64(seed)).transitions
        confidentTotal += evaluate(ConfidentFence(radius: 100), along: path, sigma: sigma, seed: UInt64(seed)).transitions
    }
    print(name, "- mean transitions: naive", Double(naiveTotal) / 100, "confident", Double(confidentTotal) / 100)
}
let truthFirst = crossing.firstIndex { simd_length($0) <= 100 }!, truthLast = crossing.lastIndex { simd_length($0) <= 100 }!
let confidentCrossing = evaluate(ConfidentFence(radius: 100), along: crossing, sigma: sigma, seed: 7)
print("crossing: truly inside from fix", truthFirst, "to", truthLast, "; confident rule says inside from",
      confidentCrossing.firstInside!, "to", confidentCrossing.lastInside!)
```

Two walks at 1.4 m/s, with 8 m of noise per axis and one fix per second, 100 runs each:

| Walk | Naive rule: transitions | Confident rule: transitions |
| --- | --- | --- |
| Skirting the edge, 95 m from the center | 35.1 | 0.46 |
| Straight through the center | 12.72 | 2.0 |

Skirting the edge, the naive rule flipped 35 times per walk, each flip a notification. The confident rule mostly never entered, which is reasonable, since the walk was never clearly inside, and occasionally entered and left once. Walking straight through, which should produce exactly two events, the naive rule produced almost 13: noise near the boundary on the way in and on the way out. The confident rule produced exactly 2 in every run.

The price is latency. On the crossing walk, the user was truly inside from fix 79 to fix 221. The confident rule said inside from 88 to 232, so it entered 9 fixes, 12.6 m, late and left 11 fixes, 15.4 m, late. That margin is the hysteresis doing its job. The thresholds and dwell are the knobs. Lower thresholds react sooner and flicker more, and a longer dwell suppresses flicker and delays everything. For "you've arrived" notifications, delay is cheap and flicker is expensive. For a turn-by-turn instruction, the balance flips.

## Watching more than 20 places

The 20-condition limit is per app, so a store finder with 500 locations can't monitor them all. The standard workaround monitors the 19 nearest places, plus one *refresh* condition centered on the user, whose radius reaches just short of the next-nearest place's fence. Leaving the refresh circle means the user could be approaching a fence that isn't monitored yet, and that's the signal to choose the nearest 19 again:

```swift
/// Core Location monitors at most 20 conditions per app. To watch more places, monitor the 19 nearest,
/// plus one "refresh" circle around the user that reaches just short of the next-nearest place.
/// Leaving the refresh circle is the signal to choose again.
struct FenceSelection {
    var places: [Int]                    // indices of the places to monitor
    var refreshCenter: SIMD2<Double>
    var refreshRadius: Double
}

func selectFences(around user: SIMD2<Double>, places: [SIMD2<Double>], fenceRadius: Double, limit: Int = 20) -> FenceSelection {
    let sorted = places.indices.sorted { simd_distance(places[$0], user) < simd_distance(places[$1], user) }
    let chosen = Array(sorted.prefix(limit - 1))
    let next = places[sorted[limit - 1]]
    // Reselect before the user could reach the edge of a fence that isn't monitored yet.
    let reach = max(simd_distance(next, user) - fenceRadius, 50)
    return FenceSelection(places: chosen, refreshCenter: user, refreshRadius: reach)
}

// 500 shops scattered over a 10 km square, and a 6 km walk across it.
var placeRandom = SeededGenerator(seed: 19)
let shops = (0..<500).map { _ in SIMD2(Double.random(in: 0..<10_000, using: &placeRandom), Double.random(in: 0..<10_000, using: &placeRandom)) }
var selection = selectFences(around: SIMD2(2_000, 2_000), places: shops, fenceRadius: 100)
var reselections = 0, missed = 0
for step in 1...4_243 {                                     // 1.4 m per step, diagonally
    let user = SIMD2(2_000.0, 2_000.0) + SIMD2(1, 1) * (Double(step) * 1.4 / 2.0.squareRoot())
    if simd_distance(user, selection.refreshCenter) > selection.refreshRadius {
        selection = selectFences(around: user, places: shops, fenceRadius: 100)
        reselections += 1
    }
    // Any shop whose fence the user is inside must be among the monitored ones.
    for (i, shop) in shops.enumerated() where simd_distance(shop, user) <= 100 && !selection.places.contains(i) { missed += 1 }
}
print("6 km walk:", reselections, "reselections, fences missed", missed)
assert(missed == 0)
```

On a 6 km walk across 500 shops scattered over a 10 km square, the selection was recomputed 6 times, and every shop whose 100 m fence the user entered was among the monitored ones at that moment. Reselection is cheap: it's a sort of a few hundred distances. On a device, the refresh condition's exit event wakes the app even when it isn't running, which is the point. The app relaunches, reselects, and updates the monitor. The refresh radius has a floor of 50 m in the code, because Core Location monitors small circles poorly. The legacy documentation's own guidance mentions radii "between 1 and 400 meters" working better on newer hardware, and both APIs take minutes to notice crossings.

## In the simulator: `CLMonitor` and an in-app fence

The simulator can't test `CLMonitor` end to end. As the [simulator article](/ios-sensors-simulator-vs-device/#other-services) found, it reports circular conditions as unsupported. It can test the in-app fence, which runs on ordinary location updates. The test sets up both, with Always authorization, then drives through a 100 m fence at 10 m/s:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location-always dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
// Core Location's own monitor, set up the way a device would use it.
let monitor = await CLMonitor("Shops")
print("IOS: conditions already in the monitor at launch:", await monitor.identifiers,
      await monitor.record(for: "shop-1").map { "last state \($0.lastEvent.state.rawValue)" } ?? "no record")
let shop = CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1146)
await monitor.add(CLMonitor.CircularGeographicCondition(center: shop, radius: 100), identifier: "shop-1")
var monitorEvents: [CLMonitor.Event] = []
let monitorTask = Task { @MainActor in
    for try await event in await monitor.events { monitorEvents.append(event) }
}

// The in-app geofence, fed by live updates.
var fence = ConfidentFence(radius: 100)
let center = CLLocation(latitude: shop.latitude, longitude: shop.longitude)
var transitions: [(inside: Bool, distance: Double)] = []
let fenceTask = Task { @MainActor in
    for try await update in CLLocationUpdate.liveUpdates(.fitness) {
        guard let location = update.location, location.horizontalAccuracy >= 0, location.speed > 0 else { continue }
        let distance = location.distance(from: center)
        let wasInside = fence.inside
        // Treat the reported accuracy as one standard deviation: the cautious reading of an undocumented radius.
        if fence.update(distance: distance, sigma: location.horizontalAccuracy) != wasInside {
            transitions.append((fence.inside, distance))
        }
    }
}
try await Task.sleep(for: .seconds(2))
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1046
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(150))
fenceTask.cancel(); monitorTask.cancel()
print("in-app fence:", transitions.map { "\($0.inside ? "enter" : "exit") at \(Int($0.distance)) m from the center" })
print("CLMonitor:", monitorEvents.map { "state \($0.state.rawValue), unsupported \($0.conditionUnsupported)" })
assert(transitions.map(\.inside) == [true, false])
assert(transitions[0].distance < 100 && transitions[1].distance > 100)
let record = await monitor.record(for: "shop-1")
print("CLMonitor record:", record.map { "state \($0.lastEvent.state.rawValue), unsupported \($0.lastEvent.conditionUnsupported)" } ?? "none")
assert(record?.lastEvent.conditionUnsupported == true)
```

The in-app fence entered at 69 to 70 m from the center and exited at 131 to 132 m, across three runs. That's one entry and one exit, each a few seconds past the true boundary at 10 m/s with 5 m fixes, treating the reported accuracy as one standard deviation. That's the cautious reading of an undocumented radius, discussed in the [accuracy article](/ios-location-updates-accuracy/#what-the-accuracy-radius-means).

`CLMonitor` showed its persistence. On the first run in a clean simulator, it delivered an event at once: state 3, `.unmonitored`, with `conditionUnsupported` set. On every later run, the monitor named "Shops" already contained "shop-1" when the app launched, with the same last state in its record, and adding the condition again produced no new event at all. The `record(for:)` call is how a relaunched app learns where it stands, and it's why the test checks the record rather than the event stream. An app that only listens for events after relaunch would wait forever for a state the system already reported.

## Summary

- `CLMonitor` (iOS 17) monitors at most 20 conditions per app, relaunches the app when a condition is satisfied, keeps records across launches, and starts monitoring only after the first unlock following a reboot. Crossings take minutes to report.
- Given a fix at distance $d$ and per-axis error $\sigma$, the probability of being inside a fence of radius $R$ follows the Rice distribution. On the boundary it's 46%, and one $\sigma$ inside only 81%.
- Compute $e^{-x}I_0(x)$, not $I_0(x)$. The unscaled version overflowed for a precise fix far from a fence, and `min(1, .nan)` silently turned the NaN into "inside".
- Deciding with probability thresholds (0.9 to enter, 0.1 to leave) and a three-fix dwell cut flicker on an edge-skirting walk from 35 transitions to 0.46, and produced exactly two on a crossing where the naive rule produced 12.7, at a cost of 13 to 15 m of latency.
- To watch more than 20 places, monitor the 19 nearest plus a refresh circle around the user. A 6 km walk past 500 shops needed 6 reselections and missed no fence.
- In the simulator, circular `CLMonitor` conditions are unsupported, but records persist across launches, and an in-app fence on live updates entered and exited once, as it should.

## Exercise

Make the confident fence adaptive to speed. A runner crosses a 100 m fence in under a minute, so a three-fix dwell at 1 Hz is fine, but a car crosses it in seven seconds and gets delayed almost through the fence. Replace the fixed dwell with a dwell *distance*: require the contradicting evidence to persist over at least 20 m of movement, or for 3 fixes, whichever comes first. Test it on the crossing walk at 1.4 m/s and at 15 m/s, and report the entry and exit latency in meters for both.

## Further reading

- [Monitoring the user's proximity to geographic regions](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions), Apple's guide to `CLMonitor`
- [`startMonitoring(for:)`](https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoring(for:)) and [`maximumRegionMonitoringDistance`](https://developer.apple.com/documentation/corelocation/cllocationmanager/maximumregionmonitoringdistance), the legacy API and its limits
- Stephen O. Rice, "Mathematical Analysis of Random Noise", *Bell System Technical Journal* 23(3), 1944, [doi:10.1002/j.1538-7305.1944.tb00874.x](https://doi.org/10.1002/j.1538-7305.1944.tb00874.x), where the distribution comes from

Previous: [Heading, Compass Calibration, and Magnetic Interference](/ios-heading-compass/)

Next: [Visits and Significant Location Changes](/ios-visits-significant-location-changes/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
