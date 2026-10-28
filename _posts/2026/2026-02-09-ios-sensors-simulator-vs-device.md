---
layout: post
hidden: true
title: "Device Testing vs. Simulator Capabilities"
date: "2026-02-09"
last_modified_at: "2026-02-09"
permalink: /ios-sensors-simulator-vs-device/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Core Motion, Testing, Xcode, Sensors]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
The iOS simulator is the fastest place to run sensor code and the least faithful one. It has no accelerometer, no gyroscope, no magnetometer, and no barometer, so Core Motion has nothing to report. Its location comes from a script, not from satellites. The question for a sensor app isn't whether to test on devices, because it has to. The question is which tests the simulator can carry, so devices are spent on what only devices can show.

This article maps that boundary with measurements on an iPhone 17 simulator running iOS 27.0. It covers what each built-in location scenario actually delivers, how `simctl location start` moves between waypoints, which Core Location services run, and where the simulator departs from a phone. The most surprising result concerns long routes: between distant waypoints, the simulated path is neither a great circle nor a straight line on the map, so geodesy code tested against it is tested against the wrong curve. The article ends with a way to feed the simulator a route it follows exactly, and a checklist for the device.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. iOS code ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, and the shell commands ran on the Mac while the test waited. The plain Swift blocks also ran as a macOS command-line program on macOS 26.

```swift
import Foundation
import CoreLocation
```

## What the simulator has

The [availability article](/ios-sensor-availability/) measured the simulator's hardware flags. Together with the measurements below and in the other articles of this series, here is what an iOS 27.0 simulator provides:

| Capability | Simulator | Notes |
| --- | --- | --- |
| Accelerometer, gyroscope, magnetometer, device motion | No | Start calls succeed and never deliver |
| Pedometer, activity, altimeter, headphone motion | No | Permission alert still appears; queries then fail with error 104 |
| Heading | No | `headingAvailable()` is `false` |
| Location updates | Yes, scripted | `simctl location`, Xcode, or the Simulator's Features menu |
| `CLLocationUpdate.liveUpdates()` | Yes | |
| Precise Location switch in Settings | Yes | But the permission alert has no precision control |
| `NSLocationDefaultAccuracyReduced` | Ignored | [Measured](/ios-location-permission-changes/#the-app-can-choose-to-blur) |
| Significant location changes | Yes, but too often | Measured below |
| `CLMonitor` circular conditions | No | Event reports `conditionUnsupported` |
| Legacy region monitoring | No | Fails with `regionMonitoringFailure` |
| Visits | Nothing delivered | Measured below |
| Geocoding | Yes | Uses the network |
| Permission alerts and Settings | Yes | Real system UI, scriptable from a UI test |

The simulator is good at three things: running the permission and lifecycle code, playing scripted location tracks, and running everything that doesn't touch hardware. That last group is bigger than it looks. Filters, fusion math, step detection, and geofence logic are all pure functions of samples, and they run anywhere once the samples are injected. The [testing article](/ios-sensor-recorded-data-tests/) is built on that idea.

## The built-in location scenarios

`xcrun simctl location booted list` names four built-in scenarios: City Run, City Bicycle Ride, Freeway Drive, and Apple. The same four appear in the Simulator app's Features > Location menu. The test grants location access and records about 12 seconds of each scenario:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location-always dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
@MainActor final class FixLog: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var fixes: [(received: Date, location: CLLocation)] = []

    override init() {
        super.init()
        manager.delegate = self
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { fixes.append((Date(), location)) }
    }

    /// Fixes received more than half a second after `start`, which skips any still in flight from before.
    func locations(since start: Date) -> [CLLocation] {
        fixes.filter { $0.received > start.addingTimeInterval(0.5) }.map(\.location)
    }
}

struct ScenarioSummary: CustomStringConvertible {
    let fixes: Int
    let meanInterval: Double
    let accuracies: [Double]
    let speeds: ClosedRange<Double>
    let invalidCourses: Int
    let speedAccuracies: [Double]
    let simulated: Bool
    let start: CLLocationCoordinate2D

    init(_ locations: [CLLocation]) {
        fixes = locations.count
        let times = locations.map(\.timestamp.timeIntervalSinceReferenceDate)
        meanInterval = (times.last! - times.first!) / Double(max(times.count - 1, 1))
        accuracies = Array(Set(locations.map(\.horizontalAccuracy))).sorted()
        let validSpeeds = locations.map(\.speed).filter { $0 >= 0 }
        speeds = (validSpeeds.min() ?? -1)...(validSpeeds.max() ?? -1)
        invalidCourses = locations.filter { $0.course < 0 }.count
        speedAccuracies = Array(Set(locations.map(\.speedAccuracy))).sorted()
        simulated = locations.allSatisfy { $0.sourceInformation?.isSimulatedBySoftware == true }
        start = locations[0].coordinate
    }

    var description: String {
        String(format: "%d fixes, every %.2f s, accuracy %@ m, speed %.1f–%.1f m/s, %d invalid courses, speed accuracy %@, simulated %@, from %.4f, %.4f",
               fixes, meanInterval, accuracies.map { String(format: "%.0f", $0) }.joined(separator: "/"),
               speeds.lowerBound, speeds.upperBound, invalidCourses,
               speedAccuracies.map { String(format: "%.0f", $0) }.joined(separator: "/"), simulated ? "yes" : "no",
               start.latitude, start.longitude)
    }
}

let log = FixLog()
log.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(2))
```

<!-- sim-run -->
```sh
xcrun simctl location booted run "City Run"
```

<!-- ios -->
```swift
var scenarioStart = Date()
try await Task.sleep(for: .seconds(12))
let cityRun = ScenarioSummary(log.locations(since: scenarioStart))
print("City Run:", cityRun)
```

<!-- sim-run -->
```sh
xcrun simctl location booted run "City Bicycle Ride"
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(12))
let bicycle = ScenarioSummary(log.locations(since: scenarioStart))
print("City Bicycle Ride:", bicycle)
```

<!-- sim-run -->
```sh
xcrun simctl location booted run "Freeway Drive"
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(12))
let freeway = ScenarioSummary(log.locations(since: scenarioStart))
print("Freeway Drive:", freeway)
```

<!-- sim-run -->
```sh
xcrun simctl location booted run "Apple"
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(12))
let applePark = ScenarioSummary(log.locations(since: scenarioStart))
print("Apple:", applePark)
let appleAccuracies = log.locations(since: scenarioStart).map(\.horizontalAccuracy)
print("Apple accuracies in order:", appleAccuracies)
for summary in [cityRun, bicycle, freeway, applePark] {
    assert(summary.simulated && summary.fixes >= 5)
    assert(abs(summary.start.latitude - 37.33) < 0.01 && abs(summary.start.longitude + 122.03) < 0.01, "all four start in Cupertino")
}
assert(applePark.speeds.upperBound <= 0, "the Apple scenario stands still")
assert(appleAccuracies == appleAccuracies.sorted(by: >), "and its accuracy only improves")
```

Each scenario starts in Cupertino, near Apple Park, wherever the device was before:

| Scenario | Fixes per second | `horizontalAccuracy` (m) | Speed (m/s) | Course |
| --- | --- | --- | --- | --- |
| City Run | 1 | 10 or 30 | 3.5 to 4.2 | Valid except the first fix |
| City Bicycle Ride | 1 | 30 or 50 | 1.0 to 4.1 | Often −1 |
| Freeway Drive | 1 | 5 | 1.9 to 10.8 (accelerating) | Always valid |
| Apple | about 0.5 | 65, then 50, then 30 | −1, then 0 | Always −1 |

The scenarios differ in the ways that matter to filtering code. City Run and the bicycle ride switch between two accuracy values, which is enough to exercise an accuracy filter, but not the gradual swings of a real GPS receiver. Freeway Drive, despite its name, spent the first 12 seconds accelerating from 1.9 to 10.8 m/s, so a short test sees a car pulling out of a parking lot, not highway speed. The Apple scenario stands still at Apple Park, and its accuracy only improves: 65 m, then 50 m, then 30 m. That's a useful stand-in for a cold start, the moment a feature has to decide whether a fix is good enough yet. In one exploratory run it also began with a 500 m fix.

Two details don't match a real device. Every fix had `verticalAccuracy` −1 and `altitude` 0, so altitude code gets nothing to test. And the scenarios reported `speedAccuracy` as 0, claiming a perfectly known speed, while the custom routes below report −1, "unknown". A filter that weights speed by its accuracy divides by zero on scenario data. The [missing data article](/ios-sensor-missing-data/) is about telling these values apart.

## Custom routes with `simctl location start`

For a route of your own, `simctl location start` takes waypoints and interpolates between them. Its help text describes two ways to pace the updates: `--interval` issues "updates at fixed times without regard for how much the location moves between updates", and `--distance` issues "an update every <meters> travelled without regard for the time between updates." The default is 20 m/s with an update every second. The test runs one route each way, both heading due east from Westminster Bridge:

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1100
```

<!-- ios -->
```swift
/// Distances and times between consecutive fixes.
func steps(_ locations: [CLLocation]) -> (meters: [Double], seconds: [Double]) {
    let pairs = zip(locations, locations.dropFirst())
    return (pairs.map { $1.distance(from: $0) }, pairs.map { $1.timestamp.timeIntervalSince($0.timestamp) })
}

scenarioStart = Date()
try await Task.sleep(for: .seconds(15))
let timed = log.locations(since: scenarioStart).filter { $0.speed > 0 }
let timedSteps = steps(timed)
print("interval route:", timed.count, "fixes, steps", timedSteps.meters.map { String(format: "%.2f", $0) }.joined(separator: " "))
assert(timed.allSatisfy { $0.speed == 10 && $0.course == 90 && $0.horizontalAccuracy == 5 })
assert(timed.allSatisfy { $0.speedAccuracy == -1 && $0.courseAccuracy == -1 })
assert(timedSteps.meters.allSatisfy { abs($0 - 10) < 0.5 })
assert(timedSteps.seconds.allSatisfy { abs($0 - 1) < 0.1 })
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=25 --distance=50 51.5007,-0.1246 51.5007,-0.1100
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(15))
let spaced = log.locations(since: scenarioStart).filter { $0.speed > 0 }
let spacedSteps = steps(spaced)
print("distance route:", spaced.count, "fixes, steps", spacedSteps.meters.map { String(format: "%.2f", $0) }.joined(separator: " "),
      "times", spacedSteps.seconds.map { String(format: "%.2f", $0) }.joined(separator: " "))
assert(spacedSteps.meters.allSatisfy { abs($0 - 50) < 1 })
assert(spacedSteps.seconds.allSatisfy { abs($0 - 2) < 0.2 })
```

Both modes do what the help text says. With `--interval=1`, fixes came every 1.00 s, 10.0 to 10.1 m apart, measured with `CLLocation.distance(from:)`, at exactly the requested 10 m/s, with a course of exactly 90°, due east. With `--distance=50` at 25 m/s, the fixes were 50.0 to 50.3 m apart and 2.0 s apart, which is the same arithmetic the other way round. Every fix had a `horizontalAccuracy` of 5 m and `speedAccuracy` and `courseAccuracy` of −1. The interpolation isn't perfectly even: the extra 0 to 1% per step is consistent across runs, small enough to ignore for most tests, and too large for a test that asserts exact distances.

The arithmetic makes routes predictable. A route of length $D$ at speed $v$ with interval $\Delta t$ produces about

$$
N \approx \frac{D}{v\,\Delta t} + 1
$$

fixes, and with `--distance=d` it produces about $D/d + 1$ fixes, $d/v$ seconds apart. A test can choose $v$ and $\Delta t$ to compress a 10 km run into 20 seconds, by setting $v = 500$ m/s, and still check that the app's distance comes out at 10 km.

### Long routes don't follow a great circle

The help text's own example is a "direct line between San Francisco and New York City." On a sphere there are at least three candidates for what that means:

- **The great circle**, the shortest path, which curves north across the continent.
- **The rhumb line**, which keeps one compass bearing and is straight on a Mercator map.
- **The straight line on a latitude-longitude chart**, where latitude changes in proportion to longitude.

Geodesy code that computes distances or headings along a route assumes one of these. So the test runs the help text's route quickly, with a fix every 200 km at 100 km/s:

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=100000 --distance=200000 37.629538,-122.395733 40.628083,-73.768254
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(50))
let crossing = log.locations(since: scenarioStart).filter { $0.speed > 0 }
print("long route:", crossing.map { String(format: "%.4f,%.4f", $0.coordinate.latitude, $0.coordinate.longitude) }.joined(separator: " "))
```

To compare that path with the alternatives, the next block computes the latitude each candidate curve has at a given longitude. These are plain Swift functions on a sphere:

```swift
/// Latitude of the great circle through `a` and `b` where it crosses `longitude`. Degrees in and out.
func greatCircleLatitude(at longitude: Double, from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
    let degree = Double.pi / 180
    let (p1, l1, p2, l2, l) = (a.latitude * degree, a.longitude * degree, b.latitude * degree, b.longitude * degree, longitude * degree)
    return atan((tan(p1) * sin(l2 - l) + tan(p2) * sin(l - l1)) / sin(l2 - l1)) / degree
}

/// Latitude of the straight line between `a` and `b` on a latitude-longitude chart.
func chartLineLatitude(at longitude: Double, from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
    a.latitude + (longitude - a.longitude) / (b.longitude - a.longitude) * (b.latitude - a.latitude)
}

/// Latitude of the rhumb line (constant compass bearing), which is straight on a Mercator chart.
func rhumbLatitude(at longitude: Double, from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
    let degree = Double.pi / 180
    func mercator(_ latitude: Double) -> Double { log(tan(.pi / 4 + latitude * degree / 2)) }
    let fraction = (longitude - a.longitude) / (b.longitude - a.longitude)
    let y = mercator(a.latitude) + fraction * (mercator(b.latitude) - mercator(a.latitude))
    return (2 * atan(exp(y)) - .pi / 2) / degree
}

let sanFrancisco = CLLocationCoordinate2D(latitude: 37.629538, longitude: -122.395733)
let newYork = CLLocationCoordinate2D(latitude: 40.628083, longitude: -73.768254)
let middle = -98.0
print("at 98°W: great circle", greatCircleLatitude(at: middle, from: sanFrancisco, to: newYork),
      "chart line", chartLineLatitude(at: middle, from: sanFrancisco, to: newYork),
      "rhumb", rhumbLatitude(at: middle, from: sanFrancisco, to: newYork))
assert(greatCircleLatitude(at: middle, from: sanFrancisco, to: newYork) > 41.5)
```

<!-- ios -->
```swift
var worst = (greatCircle: 0.0, chartLine: 0.0, rhumb: 0.0)
for location in crossing {
    let (lat, lon) = (location.coordinate.latitude, location.coordinate.longitude)
    worst.greatCircle = max(worst.greatCircle, abs(lat - greatCircleLatitude(at: lon, from: sanFrancisco, to: newYork)))
    worst.chartLine = max(worst.chartLine, abs(lat - chartLineLatitude(at: lon, from: sanFrancisco, to: newYork)))
    worst.rhumb = max(worst.rhumb, abs(lat - rhumbLatitude(at: lon, from: sanFrancisco, to: newYork)))
}
print("largest latitude gaps:", worst)
assert(worst.greatCircle > 2 && worst.chartLine > 0.2 && worst.rhumb > 0.2)
```

The simulator's path matched none of them. At 98°W, the great circle is at 41.79°N, the chart line at 39.13°N, and the rhumb line at 39.15°N, and the simulator's path, interpolating between its fixes, was at about 38.9°N. It bowed *south* of both the chart line and the rhumb line, by up to 0.28° and 0.29° of latitude, about 31 km, and it was 2.9° away from the great circle, about 320 km. The reported course started at 86.5° and turned slowly north toward the end, so the path isn't a constant-bearing curve either. I tested two guesses at the rule, stepping along a bearing recomputed toward the destination with and without the cos(latitude) correction. Neither reproduced the points to better than 0.2°, so the algorithm remains undocumented.

For the short routes most tests use, none of this matters. The gap between a great circle and a straight east-west line along a parallel at latitude $\varphi$ peaks in the middle of the route. For a route of length $d$ on a sphere of radius $R$, it is about

$$
s \approx \frac{d^2 \tan\varphi}{8R} .
$$

At London's latitude that's 2.5 m for a 10 km route, comparable to the simulator's own interpolation error. It's 250 m for a 100 km route, and kilometers across a continent. So any test that crosses more than a city, and any test of the great-circle math itself, needs a route the simulator follows exactly.

### Feeding the simulator a route it can follow

The fix is to compute the curve yourself and give the simulator waypoints close enough together that its interpolation between them can't wander. Spherical linear interpolation, *slerp*, gives evenly spaced points along a great circle. Treat the two endpoints as unit vectors $\mathbf{u}$ and $\mathbf{v}$ separated by the angle $\Omega$, and the point a fraction $t$ of the way along is

$$
\mathbf{w}(t) = \frac{\sin\big((1-t)\,\Omega\big)}{\sin\Omega}\,\mathbf{u} + \frac{\sin(t\,\Omega)}{\sin\Omega}\,\mathbf{v} .
$$

`simctl location start` reads waypoints from standard input when the waypoint argument is `-`, one `lat,lon` pair per line:

```swift
/// Points spaced evenly along the great circle from `a` to `b`, by spherical linear interpolation.
func greatCircleWaypoints(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D, count: Int) -> [CLLocationCoordinate2D] {
    let degree = Double.pi / 180
    func vector(_ c: CLLocationCoordinate2D) -> SIMD3<Double> {
        let (p, l) = (c.latitude * degree, c.longitude * degree)
        return SIMD3(cos(p) * cos(l), cos(p) * sin(l), sin(p))
    }
    let (u, v) = (vector(a), vector(b))
    let angle = acos(min(1, max(-1, (u * v).sum())))
    return (0..<count).map { i in
        let t = Double(i) / Double(count - 1)
        let w = (sin((1 - t) * angle) * u + sin(t * angle) * v) / sin(angle)
        return CLLocationCoordinate2D(latitude: asin(w.z) / degree, longitude: atan2(w.y, w.x) / degree)
    }
}

/// The text `simctl location start -` reads from standard input: one "lat,lon" per line.
func simctlWaypoints(_ points: [CLLocationCoordinate2D]) -> String {
    points.map { String(format: "%.6f,%.6f", $0.latitude, $0.longitude) }.joined(separator: "\n") + "\n"
}

let dense = greatCircleWaypoints(from: sanFrancisco, to: newYork, count: 201)
let spacing = zip(dense, dense.dropFirst()).map {
    CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: CLLocation(latitude: $1.latitude, longitude: $1.longitude))
}
print("dense waypoints:", dense.count, "spacing", spacing.min()!, "to", spacing.max()!)
assert(dense.allSatisfy { abs($0.latitude - greatCircleLatitude(at: $0.longitude, from: sanFrancisco, to: newYork)) < 1e-9 })
```

<!-- ios -->
```swift
let routeFile = FileManager.default.temporaryDirectory.appending(path: "route.txt")
try simctlWaypoints(dense).write(to: routeFile, atomically: true, encoding: .utf8)
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=100000 --distance=200000 - \
  < "$(xcrun simctl get_app_container booted dev.swiftbydeya.Host data)/tmp/route.txt"
```

<!-- ios -->
```swift
scenarioStart = Date()
try await Task.sleep(for: .seconds(50))
let followed = log.locations(since: scenarioStart).filter { $0.speed > 0 }
let densified = followed.map { abs($0.coordinate.latitude - greatCircleLatitude(at: $0.coordinate.longitude, from: sanFrancisco, to: newYork)) }.max()!
print("densified route:", followed.count, "fixes, largest gap from the great circle", densified)
assert(densified < 0.01)
```

The 201 waypoints were 20.81 to 20.83 km apart. They're equal on the sphere, and the small spread is the WGS 84 ellipsoid that `CLLocation.distance(from:)` measures on. The simulator followed them closely: its largest gap from the true great circle was 0.00000056° of latitude, about 6 cm. The same technique gives a rhumb line, a road, or a recorded track: compute the curve in Swift, write it out, and let the simulator interpolate only between points a few hundred meters apart.

## Other services

Beyond plain updates, the simulator runs some location services and quietly drops others. The test starts significant-change monitoring, visit monitoring, and a `CLMonitor` with a 200 m circle on the route, then drives through the circle at 50 m/s:

<!-- sim-run -->
```sh
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
@MainActor final class ServiceLog: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private let start = Date()
    private(set) var changes: [(time: Double, location: CLLocation)] = []
    private(set) var visits: [CLVisit] = []

    override init() {
        super.init()
        manager.delegate = self
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { changes.append((Date().timeIntervalSince(start), location)) }
    }

    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) { visits.append(visit) }
}

log.manager.stopUpdatingLocation()
try await Task.sleep(for: .seconds(2))
let significant = ServiceLog()
significant.manager.startMonitoringSignificantLocationChanges()
let visitLog = ServiceLog()
visitLog.manager.startMonitoringVisits()

let monitor = await CLMonitor("SimulatorProbe")
await monitor.add(CLMonitor.CircularGeographicCondition(
    center: CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1046), radius: 200), identifier: "fence")
var monitorEvents: [CLMonitor.Event] = []
let watchMonitor = Task { @MainActor in
    for try await event in await monitor.events { monitorEvents.append(event) }
}
try await Task.sleep(for: .seconds(3))
let significantBefore = significant.changes.count
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=50 --interval=1 51.5007,-0.1246 51.5007,-0.0646
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(80))
let moved = significant.changes[significantBefore...]
let gaps = zip(moved, moved.dropFirst()).map { (seconds: $1.time - $0.time, meters: $1.location.distance(from: $0.location)) }
print("significant changes:", moved.count, gaps)
print("visits:", visitLog.visits.count)
print("monitor:", monitorEvents.map { "\($0.identifier) state \($0.state.rawValue) unsupported \($0.conditionUnsupported)" })
assert(moved.count >= 2 && gaps.allSatisfy { $0.seconds < 300 })
assert(visitLog.visits.isEmpty)
assert(monitorEvents.first?.conditionUnsupported == true && monitorEvents.first?.state == .unmonitored)
watchMonitor.cancel()
await monitor.remove("fence")
significant.manager.stopMonitoringSignificantLocationChanges()
visitLog.manager.stopMonitoringVisits()
```

| Service | What happened in 80 s at 50 m/s |
| --- | --- |
| Significant location changes | An initial fix, then one every 30.1 s and about 1,505 m |
| Visits | Nothing |
| `CLMonitor` circular condition | One event: state `.unmonitored`, `conditionUnsupported == true` |

Significant changes worked, but not the way they work on a phone. Apple's documentation says apps "can expect a notification as soon as the device moves 500 meters or more from its previous notification" and "should not expect notifications more frequently than once every five minutes." The simulator delivered one every 30 seconds. A test that passes in the simulator because a significant change arrived quickly says nothing about the five-minute reality, and code that assumes frequent significant changes will work in the simulator and fail outdoors.

`CLMonitor` reported its circular condition as unsupported instead of failing silently, which matches `isMonitoringAvailable(for:)` returning `false` in the [availability article](/ios-sensor-availability/). No geofence entry or exit can be tested end to end in the simulator. The geofence *logic*, deciding entry from a stream of fixes, can be, and the [geofencing article](/ios-region-monitoring-geofencing/) tests it that way. Visits need minutes of dwell and the system's own classification, and none arrived.

## Knowing where you run

Code sometimes needs to know whether it's running in the simulator. Most of the time the answer belongs in the build, not at runtime:

<!-- ios -->
```swift
#if targetEnvironment(simulator)
let motionStrategy = "replay recorded samples"
#else
let motionStrategy = "live Core Motion"
#endif
assert(motionStrategy == "replay recorded samples")
```

A compile-time switch is the right tool for wiring a replay source into debug builds that run in the simulator. It's the wrong tool for deciding whether a location can be trusted. For that, each fix carries `sourceInformation`. `isSimulatedBySoftware` was `true` for every simulated fix above, and Apple's documentation adds that it's also `true` on a device when the location comes from a GPX file loaded in the Xcode debugger. Its sibling, `isProducedByAccessory`, marks fixes that came from an external accessory rather than the device's own receivers. A fitness app that awards badges for distance can use these flags to refuse simulated runs. A navigation app should usually just accept them, since a developer testing a route on a device is a legitimate user too.

Xcode offers two more ways to simulate location, both documented in [Simulating location in tests](https://developer.apple.com/documentation/xcode/simulating-location-in-tests). A test plan's configuration can set a simulated location or a GPX file for a test run. Apple's documentation notes a limit: the setting applies "only for code running in the test bundle", so a UI test's app process doesn't see it. And a GPX file attached to a scheme replays a recorded journey, "updating the simulated location, elevation, and velocity", which is the one route source that supplies altitude.

## What needs a device

Everything the simulator can't show has to be tested on hardware, and it helps to list it explicitly so a release isn't signed off on simulator runs:

| Area | Why the simulator can't show it | What to check on a device |
| --- | --- | --- |
| Core Motion | No sensors | Sample rates, noise, the [first-sample deadline](/ios-sensor-availability/#a-deadline-for-the-first-sample), handler threads |
| Heading | No magnetometer | Calibration prompts, interference near metal and magnets |
| GPS behavior | Fixes are scripted and arrive on time | Cold start, accuracy that improves slowly, urban canyons, tunnels, indoors |
| Reduced accuracy | Alert has no precision control, Info.plist default ignored | The alert with its map, `NSLocationDefaultAccuracyReduced` |
| Significant changes | Delivered every 30 s | Real cadence, and relaunch after termination |
| Region monitoring and `CLMonitor` | Unsupported | Entry and exit latency, the limit on monitored regions |
| Visits | Never delivered | Arrival and departure times |
| Background behavior | Simulated route freezes in the background | Updates with the screen off, the location indicator |
| Energy | No battery | Instruments and MetricKit on hardware |

Hardware variety matters too. An iPhone, a Wi-Fi-only iPad without GPS, and a Mac running the iPad app give three different location stories, and the [availability flags](/ios-sensor-availability/#the-availability-apis) differ across them.

## Summary

- The iOS 27.0 simulator has no motion sensors, no compass, no barometer, no region monitoring, and no visits. It does have scripted location, `liveUpdates()`, significant changes, permission UI, and Settings.
- The four built-in scenarios all start in Cupertino. City Run and the bicycle ride alternate between two accuracy values. Freeway Drive accelerates for its first seconds. Apple stands still while its accuracy improves from 65 m to 30 m. All of them report altitude 0 and `speedAccuracy` 0.
- `simctl location start` paces fixes by time (`--interval`) or distance (`--distance`), with steps 0 to 1% longer than requested, so a route's fix count is predictable.
- Between distant waypoints, the simulated path follows neither the great circle, the rhumb line, nor the straight chart line. It was 2.9° from the great circle across the US. Densify long routes yourself with slerp and pass them on standard input, which cut the error to 6 cm.
- Significant changes arrived every 30 s in the simulator, against a documented minimum of five minutes on devices. `CLMonitor` reported its condition as unsupported.
- Use `#if targetEnvironment(simulator)` to wire in replay sources, and `sourceInformation` to judge individual fixes.
- Keep a written list of what needs a device: motion, heading, real GPS behavior, reduced-accuracy UI, region monitoring, visits, background behavior, and energy.

## Exercise

Write a function that turns a recorded track, an array of `CLLocation` with timestamps, into the simplest `simctl location start` command that replays it faithfully. Choose `--speed` from the median speed, and drop waypoints with a Douglas-Peucker simplification so that no dropped point is more than 5 m from the simplified path. Measure how many waypoints a 30-minute run needs at 5 m tolerance, then replay it in the simulator and check the largest gap between the replayed fixes and the original track.

## Further reading

- [Simulating location in tests](https://developer.apple.com/documentation/xcode/simulating-location-in-tests)
- [`CLLocationSourceInformation`](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation), with `isSimulatedBySoftware` and `isProducedByAccessory`
- [`startMonitoringSignificantLocationChanges()`](https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges())

Previous: [Handling Permission Changes and Reduced Accuracy](/ios-location-permission-changes/)

Next: [Accelerometer and Gyroscope Measurements](/ios-accelerometer-gyroscope/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
