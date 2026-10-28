---
layout: post
hidden: true
title: "Handling Permission Changes and Reduced Accuracy"
date: "2026-02-06"
last_modified_at: "2026-02-06"
permalink: /ios-location-permission-changes/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Privacy, Sensors]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
The permission an app gets at the alert isn't the permission it keeps. Users change their minds in Settings, Allow Once expires, temporary full accuracy runs out, and a switch called Precise Location turns every fix into the center of a region several kilometers wide. None of this happens inside the app. The app learns about it from a delegate callback, often while it's in the background, and it has to keep every feature honest with whatever grant is left.

This article measures those changes the way a user makes them. A UI test opened Settings, went to Privacy & Security, then Location Services, then the test app, and flipped the real controls while the app ran. The results: switching Precise Location off delivered a callback even though the app was in the background, approximate fixes came with a `horizontalAccuracy` of 5,411.8 m and a `speed` of exactly 0, and temporary full accuracy expired about 11 seconds after the app left the foreground. The second half is about design: which features survive reduced accuracy, and why a distance computed from approximate fixes can't be fixed by smoothing.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. iOS code ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The plain Swift blocks also ran as a macOS command-line program on macOS 26. The [permissions article](/ios-sensor-permissions/) shows the alert-tapping UI test. Here it also drives the Settings app, through a script that opens the app's page and taps the given labels.

```swift
import Foundation
import CoreLocation
```

## Where permission changes come from

An app's location grant can change for these reasons, none of which the app starts:

| Change | Who makes it | What the app sees |
| --- | --- | --- |
| Never, Ask Next Time, While Using, Always | The user, in Settings | Authorization callback |
| Precise Location switched off or on | The user, in Settings | Authorization callback with a new `accuracyAuthorization` |
| Location Services switched off for the whole device | The user, in Settings | Callback with `.denied` |
| Allow Once expires | The system, after the app leaves the foreground | Callback with `.notDetermined` |
| Temporary full accuracy expires | The system | Callback with `.reducedAccuracy` |
| Provisional Always confirmed or downgraded | The user, at the system's second prompt | Callback, or nothing when Always is confirmed |
| Restricted by a configuration profile | Device management | `.restricted` |

`locationManagerDidChangeAuthorization(_:)` is the single place where all of these arrive, and `accuracyAuthorization` changes come through the same callback, even when the status stays the same. An app that only reads the status at launch misses all of them.

## Watching the changes happen

The test grants When In Use access, makes sure Precise Location is on, and holds the simulated device still at Westminster Bridge. A fixed point avoids a simulator quirk: a moving route started with `simctl location start` stopped advancing once the app went to the background, so later fixes from a route are just the last point repeated.

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
./settings-host.sh "SWITCHON:Precise Location"
```

A recorder logs every delegate call with a timestamp and whether the app was in the foreground. This is iOS code:

<!-- ios -->
```swift
/// One thing Core Location told the app, stamped with the seconds since the recorder started.
struct LocationEvent: Sendable {
    enum Kind: Sendable, Equatable {
        case authorization(status: CLAuthorizationStatus, fullAccuracy: Bool)
        case failure(code: Int)
        case fix(CLLocation)
    }
    let time: Double
    let kind: Kind
    let inForeground: Bool
}

@MainActor final class LocationRecorder: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private let start = Date()
    private(set) var events: [LocationEvent] = []

    override init() {
        super.init()
        manager.delegate = self
    }

    var now: Double { Date().timeIntervalSince(start) }

    private func record(_ kind: LocationEvent.Kind) {
        let foreground = UIApplication.shared.applicationState != .background
        events.append(LocationEvent(time: now, kind: kind, inForeground: foreground))
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        record(.authorization(status: manager.authorizationStatus,
                              fullAccuracy: manager.accuracyAuthorization == .fullAccuracy))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        record(.failure(code: (error as NSError).code))
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { record(.fix(location)) }
    }

    func events(after time: Double) -> [LocationEvent] { events.filter { $0.time > time } }

    func backgroundEvents(from start: Double, to end: Double) -> [LocationEvent.Kind] {
        events(after: start).filter { $0.time < end && !$0.inForeground }.map(\.kind)
    }

    func fixes(after time: Double) -> [CLLocation] {
        events(after: time).compactMap { if case .fix(let location) = $0.kind { location } else { nil } }
    }
}

let bridge = CLLocation(latitude: 51.5007, longitude: -0.1246)
let recorder = LocationRecorder()
recorder.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(3))
assert(recorder.manager.accuracyAuthorization == .fullAccuracy)
assert(recorder.fixes(after: 0).allSatisfy { $0.horizontalAccuracy == 5 && $0.distance(from: bridge) < 1 })
let leftForSettings = recorder.now
```

The simulator reports precise fixes with a `horizontalAccuracy` of 5 m. Now the user switches to Settings and turns Precise Location off for the app:

<!-- sim-run -->
```sh
./settings-host.sh "SWITCHOFF:Precise Location"
```

Then they come back to the app:

<!-- sim-run -->
```sh
xcrun simctl launch booted dev.swiftbydeya.Host
```

<!-- ios -->
```swift
let cameBack = recorder.now
try await Task.sleep(for: .seconds(5))
let whileAway = recorder.events(after: leftForSettings).filter { $0.time < cameBack }
let accuracyDropped = whileAway.first { $0.kind == .authorization(status: .authorizedWhenInUse, fullAccuracy: false) }
assert(accuracyDropped != nil && accuracyDropped?.inForeground == false, "the change arrived in the background")
assert(whileAway.contains { $0.kind == .failure(code: CLError.denied.rawValue) && !$0.inForeground })

var approximate = recorder.fixes(after: leftForSettings).filter { $0.horizontalAccuracy > 100 }
while approximate.isEmpty && recorder.now < cameBack + 60 {
    try await Task.sleep(for: .seconds(1))
    approximate = recorder.fixes(after: leftForSettings).filter { $0.horizontalAccuracy > 100 }
}
let blurred = approximate[0]
let offset = blurred.distance(from: bridge)
assert(blurred.horizontalAccuracy > 1_000 && offset > 500 && offset < blurred.horizontalAccuracy)
assert(blurred.speed == 0 && blurred.course == 0)
print("approximate fix:", blurred.coordinate, "accuracy", blurred.horizontalAccuracy, "offset", offset)
```

Two events arrived while the app was in the background. The first was `didFailWithError` with `CLError.denied`, code 1. It came because a When In Use app that leaves the foreground without a background session loses access, a subject for the [background location article](/ios-background-location/). The second was the authorization callback, with the status still When In Use but `fullAccuracy` now `false`. So the app doesn't have to be running in the foreground to hear about the change, but it does have to be alive. A suspended app gets the callback when it resumes.

Back in the foreground, the next fix was approximate:

| Property | Precise fix | Approximate fix |
| --- | --- | --- |
| Coordinate | 51.5007, −0.1246 | 51.514684, −0.114204 |
| `horizontalAccuracy` | 5 m | 5,411.8 m |
| Distance from the true position | 0 m | 1,715 m |
| `speed`, `course` | −1, −1 (invalid, the device is still) | 0, 0 |

The center of the approximate fix was 1.7 km north-east of the bridge, inside its own 5.4 km accuracy radius, as it should be. The center changed from run to run: five runs from the same true position put it 1,715 m, 1,881 m, 1,981 m, 2,025 m, and 2,072 m away. The accuracy didn't change. Every approximate fix in every run had a `horizontalAccuracy` of 5,411.8 m.

The last row is a trap. In a precise fix, `speed` and `course` are −1 when they're unknown, which is Core Location's documented signal for "invalid". The approximate fix reported 0 for both, which reads as a valid measurement: standing still, facing due north. Code that checks `speed >= 0` before using it will accept the zero. The [missing data article](/ios-sensor-missing-data/) is about exactly this, values that look like data but aren't.

## What reduced accuracy means

Apple explained the design in the WWDC20 session [What's new in location](https://developer.apple.com/videos/play/wwdc2020/10660/). An approximate location isn't the true location plus noise. The true location is *quantized*: snapped to one of a set of regions, and the app gets that region's center. Regions vary in size, "a couple of kilometers" in dense cities and "10 kilometers or a bit more" in rural areas, with "a typical value for this quantization radius" of "around five kilometers". The session also says these locations "are recomputed about four times per hour."

Three consequences follow, and the measurements show each one:

- **The center isn't where the user is.** It's 1.7 km off in the run above, and it could just as well be in the next town.
- **The center is stable while the app runs.** Later in the same test, the app asked for reduced accuracy on its own, and the fix it received had exactly the same coordinate as the first approximate fix, to the last digit. Snapping, unlike random noise, gives the same answer for the same place, so averaging many approximate fixes doesn't recover the true position. Separate runs got different centers for the same place, so the snapping isn't a fixed public grid either.
- **Some services stop.** The session says region entry and exit events "will not be delivered for apps that are not authorized for full accuracy." Visits are still delivered, at approximate coordinates.

### Distance from snapped positions

Snapping has a property that matters to any app that measures distance. Model the regions as a square grid of side $L$, and a user walking a straight line of length $d$ at a random angle $\theta$ from a random starting point. The walk crosses vertical grid lines about $d\,\lvert\cos\theta\rvert / L$ times and horizontal lines about $d\,\lvert\sin\theta\rvert / L$ times. Each crossing moves the reported center by $L$ along the corresponding axis. Averaging over the angle, with $\mathbb{E}\lvert\cos\theta\rvert = \mathbb{E}\lvert\sin\theta\rvert = 2/\pi$, the expected distance traced by the reported centers is

$$
\mathbb{E}[\text{reported}] = L \left( \frac{2d}{\pi L} + \frac{2d}{\pi L} \right) = \frac{4}{\pi}\, d \approx 1.27\, d .
$$

$L$ cancels, so on average snapped centers *overstate* the distance by 27% on any grid size. That's the Manhattan distance between grid cells, measured along a diagonal path. But the average hides the distribution. A 3 km run on a 5 km grid usually crosses no boundary at all and reports zero, and occasionally crosses one and reports 5 km. A Monte Carlo simulation checks the formula and shows the spread. It needs reproducible random numbers, so here is a small seeded generator, which later articles reuse for simulated sensor noise:

<!-- sensor-random -->
```swift
/// SplitMix64: a small, fast generator with a seed, so simulations give the same numbers on every run.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

extension RandomNumberGenerator {
    /// A standard normal sample (mean 0, standard deviation 1), by the Box-Muller transform.
    mutating func gaussian() -> Double {
        let u1 = Double.random(in: Double.ulpOfOne..<1, using: &self)
        let u2 = Double.random(in: 0..<1, using: &self)
        return (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
    }
}
```

```swift
/// The distance traced by grid-cell centers along a straight walk, with cells of side `cell`.
func snappedDistance(walk length: Double, cell: Double, using random: inout SeededGenerator) -> Double {
    let angle = Double.random(in: 0..<(2 * .pi), using: &random)
    let x0 = Double.random(in: 0..<cell, using: &random), y0 = Double.random(in: 0..<cell, using: &random)
    let x1 = x0 + length * cos(angle), y1 = y0 + length * sin(angle)
    let columns = abs((x1 / cell).rounded(.down) - (x0 / cell).rounded(.down))
    let rows = abs((y1 / cell).rounded(.down) - (y0 / cell).rounded(.down))
    return (columns + rows) * cell
}

var random = SeededGenerator(seed: 2026)
let trials = 200_000
var longWalk = 0.0
for _ in 0..<trials { longWalk += snappedDistance(walk: 50_000, cell: 5_000, using: &random) }
let longRatio = longWalk / Double(trials) / 50_000

var shortWalks: [Double: Int] = [:]
var shortTotal = 0.0
for _ in 0..<trials {
    let reported = snappedDistance(walk: 3_000, cell: 5_000, using: &random)
    shortWalks[reported, default: 0] += 1
    shortTotal += reported
}
let shortRatio = shortTotal / Double(trials) / 3_000
let reportedZero = Double(shortWalks[0, default: 0]) / Double(trials)
assert(abs(longRatio - 4 / .pi) < 0.01 && abs(shortRatio - 4 / .pi) < 0.01)
print("50 km walk ratio", longRatio, "3 km walk ratio", shortRatio, "zero share", reportedZero, shortWalks)
```

With 200,000 trials on a 5 km grid, the ratio came out at 1.2732 for the 50 km walk and 1.2716 for the 3 km walk, both within 0.2% of $4/\pi = 1.2732$. For the 50 km walk that's a usable if biased number. For the 3 km walk it's an average over nonsense. 35.2% of the walks reported 0 km, 53.4% reported 5 km, and 11.5% reported 10 km. No individual 3 km walk was reported as anything close to 3 km.

Real regions aren't a square grid, but the conclusion doesn't depend on the shape. Snapped positions measure distance in units of the region size. A feature like "distance run" or "pace" has to be off under reduced accuracy, not approximated.

## Asking for full accuracy, temporarily

When a feature needs precision that the user has turned off, the app can ask for it for the current session with `requestTemporaryFullAccuracyAuthorization(withPurposeKey:)`. The purpose key names an entry in the `NSLocationTemporaryUsageDescriptionDictionary` Info.plist dictionary. The test host has one:

| Key | Value |
| --- | --- |
| `RunRoute` | Exact location keeps the run route accurate. |

The alert's title on iOS 27.0 is "Allow "Host" to use your precise location once?", with the purpose string below it and two buttons, Don't Allow and Allow Once:

<!-- ios -->
```swift
let askedForPrecision = recorder.now
let precisionRequest = Task { @MainActor in
    try await recorder.manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "RunRoute")
}
try await Task.sleep(for: .seconds(1))
```

<!-- sim-run -->
```sh
./tap-alert.sh "Allow Once"
```

<!-- ios -->
```swift
try await precisionRequest.value
assert(recorder.manager.accuracyAuthorization == .fullAccuracy)
assert(recorder.events(after: askedForPrecision).contains { $0.kind == .authorization(status: .authorizedWhenInUse, fullAccuracy: true) })
try await Task.sleep(for: .seconds(2))
assert(recorder.fixes(after: askedForPrecision).contains { $0.horizontalAccuracy == 5 })

/// The CLError code a full-accuracy request fails with, or nil if it succeeds.
@MainActor func fullAccuracyError(_ manager: CLLocationManager, purposeKey key: String) async -> Int? {
    do {
        try await manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: key)
        return nil
    } catch {
        return (error as NSError).code
    }
}
let alreadyFull = await fullAccuracyError(recorder.manager, purposeKey: "RunRoute")
let unknownKey = await fullAccuracyError(recorder.manager, purposeKey: "NoSuchKey")
assert(alreadyFull == CLError.promptDeclined.rawValue && unknownKey == CLError.promptDeclined.rawValue)
let leftWithPrecision = recorder.now
```

The `async` form returned after the tap, and the callback reported full accuracy with the status unchanged. The documentation lists three cases in which the request fails with `CLError.promptDeclined` (code 18) without showing anything: the purpose key is missing from the Info.plist, the app already has full accuracy, or the app is in the background. The first two were measured above. One more case appeared during testing. While an earlier full-accuracy alert was still on screen, unanswered, a new request failed at once with code 18 and the message "Outstanding authorization prompt detected."

Code 18 doesn't mean the user said no. When the user taps Don't Allow, the request *succeeds* (the prompt was shown) and `accuracyAuthorization` stays reduced. Check the accuracy after the call, not just whether it threw.

### When temporary precision ends

Apple's documentation says temporary full accuracy lasts "until its permission automatically expires", that expiration "is postponed while your app is actively in use", and that this includes "while a Continuous Background Location session is active with the background location indicator enabled." Without such a session, it ends soon after the app leaves the foreground:

<!-- sim-run -->
```sh
xcrun simctl launch booted com.apple.Preferences
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(30))
let expiry = recorder.events(after: leftWithPrecision).first {
    $0.kind == .authorization(status: .authorizedWhenInUse, fullAccuracy: false)
}
assert(expiry != nil && expiry?.inForeground == false)
let precisionLasted = expiry!.time - leftWithPrecision
assert(precisionLasted > 5 && precisionLasted < 25)
print("temporary full accuracy ended", precisionLasted, "s after leaving the foreground")
let beforeNever = recorder.now
```

The accuracy dropped back to reduced 11.3 seconds after the Settings app came to the front, with the app in the background, delivered through the usual callback. In six runs it took between 11.2 and 11.3 seconds. So "temporary" means *this visit to the foreground*. A run tracker that needs precision for the whole run has to keep a background session going, or ask again when the user returns.

## Never, Ask Next Time, and back

The user's other choices on the same Settings page behave like the transitions in the [permissions article](/ios-sensor-permissions/#the-location-authorization-lifecycle), but with no alert involved. The test switches Precise Location back on, then picks Never, then Ask Next Time, and finally While Using the App. Each callback arrives while the Settings script is still running, so the test notes the time before each step:

<!-- sim-run -->
```sh
./settings-host.sh "SWITCHON:Precise Location|Never"
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(2))
let beforeAskNextTime = recorder.now
```

<!-- sim-run -->
```sh
./settings-host.sh "Ask Next Time or When I Share"
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(2))
let beforeWhileUsing = recorder.now
```

<!-- sim-run -->
```sh
./settings-host.sh "While Using the App"
```

<!-- sim-run -->
```sh
xcrun simctl launch booted dev.swiftbydeya.Host
```

<!-- ios -->
```swift
let returned = recorder.now
try await Task.sleep(for: .seconds(3))
let neverEvents = recorder.backgroundEvents(from: beforeNever, to: beforeAskNextTime)
let askEvents = recorder.backgroundEvents(from: beforeAskNextTime, to: beforeWhileUsing)
let whileUsingEvents = recorder.backgroundEvents(from: beforeWhileUsing, to: returned)
assert(neverEvents.contains(.failure(code: CLError.denied.rawValue)))
assert(neverEvents.contains(.authorization(status: .denied, fullAccuracy: false)))
assert(askEvents.contains(.authorization(status: .notDetermined, fullAccuracy: true)))
assert(whileUsingEvents.contains(.authorization(status: .authorizedWhenInUse, fullAccuracy: true)))
assert(recorder.manager.authorizationStatus == .authorizedWhenInUse)
while !recorder.fixes(after: beforeWhileUsing).contains(where: { $0.horizontalAccuracy == 5 }) && recorder.now < returned + 20 {
    try await Task.sleep(for: .seconds(1))
}
assert(recorder.fixes(after: beforeWhileUsing).contains { $0.horizontalAccuracy == 5 }, "updates resumed by themselves")
```

| Choice in Settings | Callback |
| --- | --- |
| Precise Location off | status 4, `fullAccuracy` false |
| Never | `didFailWithError` code 1, then status 2 with `fullAccuracy` false |
| Ask Next Time or When I Share | status 0 with `fullAccuracy` *true* |
| While Using the App | status 4, `fullAccuracy` true |

All four arrived while the app was in the background. Two details are worth noticing. Under `.denied` the accuracy reads as reduced, and under `.notDetermined` it reads as full. Neither means anything, since there is no access to be accurate about. Read `accuracyAuthorization` only when the status is an authorized one. And `startUpdatingLocation()` was never called again: after the user restored access, fixes resumed on their own once the app was in the foreground. Core Location keeps the app's request alive through a denial. That's convenient, but it also means updates the app has forgotten to stop will resume as soon as the user grants access again.

The same held for `CLLocationUpdate.liveUpdates()` in a separate run, with access revoked and granted through `simctl privacy`. The sequence delivered an update with `authorizationDenied == true`, stayed open, and resumed delivering locations after the grant. Neither revoke nor grant terminated the app, even though `simctl` warns that "some permission changes will terminate the application if running."

## The app can choose to blur

Reduced accuracy can also be the app's own choice. Setting `desiredAccuracy` to `kCLLocationAccuracyReduced` makes Core Location deliver approximate fixes even with full accuracy granted. That's the right setting for features that only need a city, such as weather, regional content, or time zones. Apple's documentation for the related `NSLocationDefaultAccuracyReduced` Info.plist key describes it as a way "to leverage the reduced-accuracy feature to improve privacy in a particular operation":

<!-- ios -->
```swift
let blurOnPurpose = recorder.now
recorder.manager.desiredAccuracy = kCLLocationAccuracyReduced
try await Task.sleep(for: .seconds(5))
let chosen = recorder.fixes(after: blurOnPurpose)
assert(chosen.contains { $0.horizontalAccuracy > 1_000 })
assert(chosen.contains { $0.coordinate.latitude == blurred.coordinate.latitude && $0.coordinate.longitude == blurred.coordinate.longitude },
       "the same place snaps to the same center")
assert(recorder.manager.accuracyAuthorization == .fullAccuracy, "the grant itself is unchanged")
recorder.manager.desiredAccuracy = kCLLocationAccuracyBest
recorder.manager.stopUpdatingLocation()
```

The approximate fix had exactly the coordinate the user's Precise Location switch had produced a few minutes earlier in the same run. That's the stability that snapping promises, measured.

The Info.plist key itself didn't work in the simulator. A second test host with `NSLocationDefaultAccuracyReduced` set to `true` got full accuracy after the user tapped Allow While Using App, and its Precise Location switch in Settings was on. The documentation says the alert should show a map and the switch should start off. The iOS 27.0 simulator's alert has no map or precision control at all, so test reduced accuracy by flipping the switch in Settings, as above, and verify the Info.plist default on a device.

## Designing features for the grant you have

Each feature needs a minimum grant, and it should degrade or switch off as soon as the grant falls below it. Writing the requirements down as data makes the rules visible and testable. The types below don't use `CLAuthorizationStatus`, so the rules compile on every platform:

```swift
enum Access: Equatable { case none, whenInUse, always }
enum Precision: Equatable { case precise, approximate }

struct LocationGrant: Equatable {
    var access: Access
    var precision: Precision
}

enum RunFeature: CaseIterable {
    case cityWeather, liveMap, routeAndDistance, splitAlerts, backgroundRecording
}

enum FeatureState: Equatable {
    case available
    case approximate      // works, but must say it's approximate
    case needsPrecision   // offer temporary full accuracy
    case needsAccess      // offer the permission flow
    case needsAlways
}

func state(of feature: RunFeature, with grant: LocationGrant) -> FeatureState {
    guard grant.access != .none else { return .needsAccess }
    switch feature {
    case .cityWeather:
        return .available
    case .liveMap:
        return grant.precision == .precise ? .available : .approximate
    case .routeAndDistance, .splitAlerts:
        return grant.precision == .precise ? .available : .needsPrecision
    case .backgroundRecording:
        guard grant.access == .always else { return .needsAlways }
        return grant.precision == .precise ? .available : .needsPrecision
    }
}

let approximateGrant = LocationGrant(access: .whenInUse, precision: .approximate)
assert(RunFeature.allCases.map { state(of: $0, with: approximateGrant) }
       == [.available, .approximate, .needsPrecision, .needsPrecision, .needsAlways])
assert(RunFeature.allCases.map { state(of: $0, with: LocationGrant(access: .always, precision: .precise)) }
       .allSatisfy { $0 == .available })
assert(RunFeature.allCases.map { state(of: $0, with: LocationGrant(access: .none, precision: .precise)) }
       .allSatisfy { $0 == .needsAccess })
```

The live map shows a 5.4 km circle instead of a dot. A tiny dot at a snapped center would be a lie, because the user may be anywhere in that circle. The route and the splits are switched off rather than approximated, because of the staircase measured above. Each `needs…` case tells the interface what to offer, and none of them leaves a feature quietly showing wrong numbers.

### Changing grants in the middle of a run

The callback can arrive in the middle of a recording, and the recorder has to keep the data it already has honest. Fixes collected under different grants mustn't be mixed: a distance that adds a snapped jump to precise segments is wrong in a way no one can see later. A recorder can split the run into segments by grant and sum only the precise ones:

```swift
struct RunSegment {
    var precision: Precision
    var points: [CLLocation] = []

    var distance: CLLocationDistance {
        zip(points, points.dropFirst()).reduce(0) { $0 + $1.1.distance(from: $1.0) }
    }
}

struct RunRecording {
    private(set) var segments: [RunSegment] = []

    mutating func grantChanged(to precision: Precision) {
        segments.append(RunSegment(precision: precision))
    }

    mutating func add(_ location: CLLocation) {
        if segments.isEmpty { grantChanged(to: .precise) }
        segments[segments.count - 1].points.append(location)
    }

    /// Distance from precise segments only. Gaps between segments aren't bridged.
    var measuredDistance: CLLocationDistance {
        segments.filter { $0.precision == .precise }.reduce(0) { $0 + $1.distance }
    }

    var hasApproximateGaps: Bool { segments.contains { $0.precision == .approximate } }
}

/// A point `meters` east of the bridge along its parallel, using the WGS 84 ellipsoid's radius of that parallel.
func east(_ meters: Double, accuracy: Double = 5) -> CLLocation {
    let latitude = 51.5007 * .pi / 180, a = 6_378_137.0, e2 = 0.006_694_379_990_14
    let parallelRadius = a * cos(latitude) / (1 - e2 * sin(latitude) * sin(latitude)).squareRoot()
    let degrees = meters / parallelRadius * 180 / .pi
    return CLLocation(coordinate: CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1246 + degrees),
                      altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1, timestamp: Date())
}

var run = RunRecording()
for meters in stride(from: 0.0, through: 1_000, by: 100) { run.add(east(meters)) }
run.grantChanged(to: .approximate)
run.add(CLLocation(coordinate: CLLocationCoordinate2D(latitude: 51.514621, longitude: -0.119289),
                   altitude: 0, horizontalAccuracy: 5_411.8, verticalAccuracy: -1, timestamp: Date()))
run.grantChanged(to: .precise)
for meters in stride(from: 1_500.0, through: 2_000, by: 100) { run.add(east(meters)) }

assert(abs(run.measuredDistance - 1_500) < 1, "1,000 m before the change plus 500 m after")
assert(run.hasApproximateGaps)
let naive = zip(run.segments.flatMap(\.points), run.segments.flatMap(\.points).dropFirst())
    .reduce(0.0) { $0 + $1.1.distance(from: $1.0) }
print("segmented", run.measuredDistance, "naive", naive)
```

The segmented recorder reports 1,500.0 m, the distance actually measured, and flags the gap so the interface can say "1.5 km, with a gap". Joining every fix in order gives 5,090 m instead. The one approximate fix, a real coordinate from an earlier simulator run, turned a 500 m stretch into a 3.6 km trip to the snapped center and back. The true distance was 2,000 m, and no formula can recover the missing 500 m from a snapped center. The run has a gap, and the honest thing is to show it.

There's a side result in that 1,500.0. The helper places points with the WGS 84 ellipsoid's radius of the parallel, and `CLLocation.distance(from:)` agreed with it to the millimeter. With a spherical 111,320 m per degree instead, the same points measured 1,503 m. The [accuracy article](/ios-location-updates-accuracy/) compares distance formulas properly.

## Summary

- Permission changes come from Settings, from expiring grants, and from device management. They all arrive through `locationManagerDidChangeAuthorization(_:)`, including changes to `accuracyAuthorization` with the status unchanged, and often while the app is in the background.
- With Precise Location off, fixes are centers of snapped regions. Measured: `horizontalAccuracy` exactly 5,411.8 m, the center 1.7 to 2.1 km from the true position, and `speed` and `course` reported as 0 rather than the invalid −1.
- Snapping is stable within a run, so averaging doesn't recover the true position. Distance traced by snapped centers averages $4/\pi$ of the true distance on a grid and comes in steps of the region size. A 3 km walk on a 5 km grid reported 0 km about a third of the time, and 5 or 10 km otherwise.
- `requestTemporaryFullAccuracyAuthorization(withPurposeKey:)` shows a two-button alert. `CLError.promptDeclined` means the alert wasn't shown (already full, unknown key, background, or another alert pending), not that the user refused. Temporary precision expired 11.2 to 11.3 seconds after the app left the foreground, in six runs.
- Never, Ask Next Time, and While Using each produce a callback. After access returns, existing updates resume without a new start call. Ignore `accuracyAuthorization` unless the status is authorized.
- `kCLLocationAccuracyReduced` lets the app blur on purpose. `NSLocationDefaultAccuracyReduced` wasn't honored by the iOS 27.0 simulator, so test reduced accuracy through the Settings switch.
- Gate each feature on the minimum grant it needs, and split recorded data by grant so approximate positions never leak into precise measurements.

## Exercise

Extend `RunRecording` so it can bridge short gaps honestly. When a precise segment resumes within 60 seconds of the previous one ending, add the straight-line distance between the last and first precise points, and mark the result as an estimate with an uncertainty equal to the sum of the two fixes' `horizontalAccuracy` values. Test it with the segment sequence above, and with a gap long enough that bridging should be refused.

## Further reading

- [What's new in location](https://developer.apple.com/videos/play/wwdc2020/10660/), the WWDC20 session that introduced approximate location and explains quantization
- [`requestTemporaryFullAccuracyAuthorization(withPurposeKey:completion:)`](https://developer.apple.com/documentation/corelocation/cllocationmanager/requesttemporaryfullaccuracyauthorization(withpurposekey:completion:)), including the cases that fail with `promptDeclined`
- [`NSLocationDefaultAccuracyReduced`](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationdefaultaccuracyreduced), and `kCLLocationAccuracyReduced` for blurring on purpose
- [`CLAccuracyAuthorization`](https://developer.apple.com/documentation/corelocation/claccuracyauthorization)

Previous: [Requesting Motion and Location Permissions in Context](/ios-sensor-permissions/)

Next: [Device Testing vs. Simulator Capabilities](/ios-sensors-simulator-vs-device/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
