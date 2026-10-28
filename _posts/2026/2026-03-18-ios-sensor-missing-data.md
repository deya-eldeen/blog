---
layout: post
hidden: true
title: "Distinguishing Missing Data from a Valid Zero Reading"
date: "2026-03-18"
last_modified_at: "2026-03-18"
permalink: /ios-sensor-missing-data/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Core Motion, Data Modeling, Sensors]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Zero is a measurement. A speed of 0 means standing still, zero floors means a flat day, and a heading of 0 means north. The sensor frameworks also need a way to say "I don't know", and because most of their APIs predate Swift's optionals, they say it with numbers: −1 for an unknown speed, `distantPast` for an unknown arrival, a negative accuracy for an invalid coordinate. Every one of those conventions is a chance for "I don't know" to be read as a value, and a value that's wrong in a plausible way survives every test that checks types.

This article collects the conventions Core Location and Core Motion use, including the ones measured in earlier articles where the frameworks broke their own rules. Approximate fixes reported a speed of exactly 0 when the speed was unknown, and simulator scenarios reported a speed accuracy of 0, claiming perfection. It then shows how to carry missing values honestly in Swift, and what the common shortcuts cost. On a simulated hour of cycling with 20% of readings missing, treating them as zero understated the average speed by 20.7%, matching the formula $(1-p)\mu$, while skipping them was off by 0.5%.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The simulation uses the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import CoreLocation
```

## The conventions

| Value | "Unknown" or "invalid" when | Source |
| --- | --- | --- |
| `CLLocation.coordinate` | `horizontalAccuracy` < 0, or not `CLLocationCoordinate2DIsValid` | documentation |
| `CLLocation.altitude`, `ellipsoidalAltitude` | `verticalAccuracy` ≤ 0 (zero counts as invalid) | documentation |
| `CLLocation.speed`, `course` | < 0 | documentation |
| `speedAccuracy`, `courseAccuracy` | < 0 | documentation |
| `CLHeading.trueHeading` | < 0, also when location updates aren't running | documentation |
| `CLHeading.headingAccuracy` | < 0: "uncalibrated or there is strong interference" | documentation |
| `CMDeviceMotion.heading`, `headingAccuracy` | < 0 in arbitrary reference frames | documentation |
| `CMCalibratedMagneticField` | accuracy `.uncalibrated` | documentation |
| `CLVisit.arrivalDate`, `departureDate` | `distantPast`, `distantFuture` | documentation |
| `CMPedometerData.distance`, `floorsAscended`, `currentCadence` | `nil` | documentation |
| Approximate `CLLocation` | `speed` and `course` read **0**, not −1 | [measured](/ios-location-permission-changes/#watching-the-changes-happen) |
| Simulator scenario fixes | `speedAccuracy` reads **0** | [measured](/ios-sensors-simulator-vs-device/#the-built-in-location-scenarios) |
| Simulator `simctl` route fixes | `speed` is correct, but `speedAccuracy` is −1 | [measured](/ios-sensors-simulator-vs-device/#custom-routes-with-simctl-location-start) |

The documented rules are consistent: negative means invalid. Two details deserve emphasis. A `verticalAccuracy` of exactly 0 is invalid too, so "≥ 0" is the wrong test for altitude. And `trueHeading` can be invalid for a reason that has nothing to do with the compass: no location updates running.

The measured rows are where the rules fail. An approximate fix that reports a speed of 0 claims the user is standing still, and nothing distinguishes it from a real stop except its 5.4 km accuracy. Simulator route fixes go the other way: the speed is exactly right, but its accuracy is −1, so the documentation's own rule, "when this property contains a negative number, the value in the speed property is invalid", would throw away a correct speed. Code has to decide what it trusts, and the decision should be written down in one place.

### Convenience initializers lie too

Test code builds `CLLocation` values constantly, and the short initializers fill in the fields they don't take:

```swift
let quick = CLLocation(latitude: 51.5007, longitude: -0.1246)
print("CLLocation(latitude:longitude:): horizontalAccuracy", quick.horizontalAccuracy, "verticalAccuracy", quick.verticalAccuracy,
      "speed", quick.speed, "course", quick.course, "age", Date().timeIntervalSince(quick.timestamp))
let empty = CLLocation()
print("CLLocation(): coordinate", empty.coordinate.latitude, empty.coordinate.longitude,
      "valid:", CLLocationCoordinate2DIsValid(empty.coordinate), "accuracy", empty.horizontalAccuracy)
print("kCLLocationCoordinate2DInvalid:", kCLLocationCoordinate2DInvalid, "valid:", CLLocationCoordinate2DIsValid(kCLLocationCoordinate2DInvalid))
assert(quick.horizontalAccuracy == 0 && CLLocationCoordinate2DIsValid(empty.coordinate))
```

`CLLocation(latitude:longitude:)` reports a `horizontalAccuracy` of 0, a perfect fix, with a timestamp of now. A test that feeds it to an accuracy filter tests the case where every fix is perfect. `CLLocation()` sits at latitude 0, longitude 0, a point in the Gulf of Guinea that mapping people call Null Island, and `CLLocationCoordinate2DIsValid` accepts it, because it *is* a valid coordinate. The value Core Location uses for "no coordinate" is `kCLLocationCoordinate2DInvalid`, at (−180, −180). In tests, use the full initializer, which takes every accuracy explicitly. The examples in this series all do.

## Optionals at the boundary

The fix is the one every earlier article applied to its own type: convert at the boundary, once, into a type where "missing" can't be confused with a number.

```swift
/// A fix as the app should see it: every value that can be missing is optional.
struct LocationSample: Equatable, Codable {
    var latitude: Double
    var longitude: Double
    var horizontalAccuracy: Double
    var altitude: Double?            // nil unless verticalAccuracy > 0
    var verticalAccuracy: Double?
    var speed: Double?               // nil when CLLocation.speed < 0
    var speedAccuracy: Double?       // nil when negative
    var course: Double?              // nil when CLLocation.course < 0
    var timestamp: Date

    /// Returns nil for a fix whose coordinate itself is invalid.
    init?(_ location: CLLocation) {
        guard location.horizontalAccuracy >= 0, CLLocationCoordinate2DIsValid(location.coordinate) else { return nil }
        latitude = location.coordinate.latitude
        longitude = location.coordinate.longitude
        horizontalAccuracy = location.horizontalAccuracy
        let hasAltitude = location.verticalAccuracy > 0
        altitude = hasAltitude ? location.altitude : nil
        verticalAccuracy = hasAltitude ? location.verticalAccuracy : nil
        speed = location.speed >= 0 ? location.speed : nil
        speedAccuracy = location.speedAccuracy >= 0 ? location.speedAccuracy : nil
        course = location.course >= 0 ? location.course : nil
        timestamp = location.timestamp
    }
}

func fix(speed: Double, speedAccuracy: Double, course: Double, verticalAccuracy: Double = -1, horizontalAccuracy: Double = 5) -> CLLocation {
    CLLocation(coordinate: CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1246), altitude: 12,
               horizontalAccuracy: horizontalAccuracy, verticalAccuracy: verticalAccuracy, course: course, courseAccuracy: course >= 0 ? 10 : -1,
               speed: speed, speedAccuracy: speedAccuracy, timestamp: Date(timeIntervalSinceReferenceDate: 805_000_000))
}

let standing = LocationSample(fix(speed: 0, speedAccuracy: 0.3, course: -1))!
let unknown = LocationSample(fix(speed: -1, speedAccuracy: -1, course: -1))!
let invalid = LocationSample(CLLocation(coordinate: kCLLocationCoordinate2DInvalid, altitude: 0, horizontalAccuracy: -1,
                                        verticalAccuracy: -1, timestamp: Date()))
assert(standing.speed == 0 && unknown.speed == nil && invalid == nil)
assert(standing.altitude == nil, "verticalAccuracy -1 means no altitude, even though altitude reads 12")

let json = String(decoding: try JSONEncoder().encode([standing, unknown]), as: UTF8.self)
print(json)
assert(json.contains("\"speed\":0") && !json.contains("\"speed\":-1"))
```

A standing user has `speed == 0`. An unknown speed is `nil`. A fix with `verticalAccuracy` −1 has no altitude, even though its `altitude` property reads 12. A fix whose coordinate is invalid doesn't become a `LocationSample` at all. Swift's synthesized `Codable` then does the right thing for storage: it omits `nil` properties from the JSON entirely, so the stored record for the unknown speed has no `speed` key, rather than a −1 that a server or a spreadsheet would average.

In the simulator, the conversion behaves as the table predicts:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
@MainActor final class Samples: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var converted: [LocationSample] = []
    override init() { super.init(); manager.delegate = self }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        converted += locations.compactMap(LocationSample.init)
    }
}
let samples = Samples()
samples.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(2))
let stillCount = samples.converted.count
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1146
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(6))
samples.manager.stopUpdatingLocation()
let still = samples.converted.prefix(stillCount), moving = samples.converted.dropFirst(stillCount + 1)
print("standing still:", still.map { "speed \($0.speed as Any) altitude \($0.altitude as Any)" })
print("moving:", moving.map { "speed \($0.speed as Any) accuracy \($0.speedAccuracy as Any) course \($0.course as Any)" })
assert(still.allSatisfy { $0.speed == nil && $0.altitude == nil })
assert(moving.allSatisfy { $0.speed == 10 && $0.speedAccuracy == nil && $0.course == 90 })
```

Standing still, the fix had no speed and no altitude. On the route, every fix had a speed of 10 m/s and a course of 90°, and no speed accuracy. This conversion trusts speed by its own sign and keeps the missing accuracy as `nil`. A filter that weights speeds by their accuracy has to decide what to do with a speed that has none, and making that decision explicit is the point.

## What the shortcuts cost

Missing values have to become *something* when an app computes a total, an average, or a chart. The three common choices are to treat missing as zero, skip it, or carry the last value forward. The simulation below is an hour of cycling at about 6 m/s, with a 30-second stop at a light every five minutes, sampled once a second. GPS drops out in runs of 5 to 20 seconds, under trees and between buildings, for 20% of the hour in total:

```swift
// An hour of a cyclist's speed, one reading a second: around 6 m/s, with stops at lights.
// GPS drops out under trees and between buildings: readings go missing in runs, 20% of the time.
var random = SeededGenerator(seed: 24)
var truth: [Double] = [], observed: [Double?] = []
var missingRun = 0
for t in 0..<3_600 {
    let stopped = (t % 300) >= 270                                   // 30 s at a light every 5 minutes
    let speed = stopped ? 0 : max(0, 6 + 1.5 * sin(Double(t) / 40) + 0.5 * random.gaussian())
    truth.append(speed)
    if missingRun == 0, Double.random(in: 0..<1, using: &random) < 0.02 { missingRun = Int.random(in: 5...20, using: &random) }
    if missingRun > 0 { missingRun -= 1; observed.append(nil) } else { observed.append(speed) }
}
let missingShare = Double(observed.filter { $0 == nil }.count) / Double(observed.count)

let trueMean = truth.reduce(0, +) / Double(truth.count)
let asZero = observed.map { $0 ?? 0 }.reduce(0, +) / Double(observed.count)
let present = observed.compactMap { $0 }
let skipped = present.reduce(0, +) / Double(present.count)
var carried: [Double] = [], last = 0.0
for value in observed { if let value { last = value }; carried.append(last) }
let lastCarried = carried.reduce(0, +) / Double(carried.count)
print(String(format: "missing %.1f%%: true mean %.3f m/s; missing as zero %.3f (%+.1f%%); skipped %.3f (%+.1f%%); last value carried %.3f (%+.1f%%)",
             missingShare * 100, trueMean, asZero, (asZero / trueMean - 1) * 100, skipped, (skipped / trueMean - 1) * 100,
             lastCarried, (lastCarried / trueMean - 1) * 100))
print(String(format: "prediction for zero-filling: (1 - p)·mean = %.3f", (1 - missingShare) * trueMean))
```

| Policy | Average speed | Error |
| --- | --- | --- |
| Truth | 5.398 m/s | |
| Missing as zero | 4.282 m/s | −20.7% |
| Skip missing | 5.373 m/s | −0.5% |
| Carry the last value | 5.422 m/s | +0.5% |

Zero-filling is the default whenever an optional is unwrapped with `?? 0`, and its bias is easy to predict. If a fraction $p$ of values is replaced by zero, the mean becomes

$$
\mathbb{E}[\hat\mu] = (1-p)\,\mu ,
$$

so 20.3% missing predicts 4.302 m/s, close to the measured 4.282. It's not a small effect, and it hides well: the cyclist's average speed drops by a fifth, nothing crashes, and the number looks plausible. Skipping and carrying forward both stay within half a percent here, because the gaps are short and land at random. They fail in different ways when the gaps aren't random. If the GPS drops out exactly when the rider stops under a bridge, skipping overstates the average, and carrying forward through a long gap pretends the rider kept moving at the last speed.

## Saying why

Sometimes "missing" isn't enough for the interface, because what it should show depends on *why* the value is missing. A floors tile with no barometer should say so once and get out of the way. One with Motion & Fitness denied should offer the permission flow. One that hasn't heard yet should show a placeholder. And one with zero floors should show 0. An enum keeps those cases apart, and so does an aggregate that records its own coverage:

```swift
/// When the reason matters to the interface, say why a value is missing instead of just that it is.
enum Reading<Value: Sendable & Equatable>: Sendable, Equatable {
    case value(Value)
    case unavailable        // the device can't measure it at all
    case notAuthorized      // it could, but the user said no
    case notYet             // nothing has arrived since the request started
    case invalid            // something arrived, flagged as unusable

    var value: Value? { if case .value(let v) = self { v } else { nil } }
}

/// The text a floors tile shows. Zero floors is an achievement-free day; no barometer is a different message.
func floorsLabel(_ floors: Reading<Int>) -> String {
    switch floors {
    case .value(let n): "\(n) floors"
    case .unavailable: "Floors aren't counted on this device"
    case .notAuthorized: "Allow Motion & Fitness to count floors"
    case .notYet, .invalid: "–"
    }
}
assert(floorsLabel(.value(0)) == "0 floors" && floorsLabel(.unavailable) != floorsLabel(.value(0)))

/// An hourly total that knows how much of the hour it saw.
struct HourlySteps: Equatable {
    var steps: Int
    var coveredMinutes: Int
    var display: String {
        switch coveredMinutes {
        case 0: "no data"
        case 60: "\(steps)"
        default: "\(steps)+ (\(coveredMinutes) of 60 min)"
        }
    }
}
assert(HourlySteps(steps: 0, coveredMinutes: 0).display == "no data")
assert(HourlySteps(steps: 0, coveredMinutes: 60).display == "0")
assert(HourlySteps(steps: 1_840, coveredMinutes: 42).display == "1840+ (42 of 60 min)")
```

The coverage-aware hourly total separates three states that a bare integer merges: an hour with no data, an hour of sitting still (0 steps, fully observed), and an hour with 1,840 steps counted over 42 minutes, which is a lower bound and is labeled as one. A chart that draws all three as bars of their `steps` value shows a quiet hour where the phone was simply off.

## NaN is not a better sentinel

Floating-point NaN looks like a natural "missing" marker, and it's worse than −1 in two ways:

```swift
// NaN is the other way to say "missing", and JSON has no way to write it.
struct Smoothed: Codable { var heading: Double }
do {
    _ = try JSONEncoder().encode(Smoothed(heading: .nan))
    assertionFailure("expected an encoding error")
} catch {
    print("encoding NaN:", error)
}
// And NaN poisons arithmetic silently: one missing heading in an average makes the whole average NaN.
let headings = [10.0, 12, .nan, 11]
let mean = headings.reduce(0, +) / Double(headings.count)
print("mean with one NaN:", mean, "; equal to itself:", mean == mean, "; filtered mean:",
      headings.filter { !$0.isNaN }.reduce(0, +) / Double(headings.filter { !$0.isNaN }.count))
assert(mean.isNaN && !(mean == mean))
```

`JSONEncoder` refuses to encode it ("Unable to encode Double.nan directly in JSON"), so a model that uses NaN for missing values fails to save at the worst moment. And NaN spreads silently through arithmetic: one NaN in four headings makes the mean NaN, and a NaN isn't even equal to itself, so `==` checks for it fail. The Swift compiler warns about the literal `.nan == .nan` for that reason. Optionals don't have either problem.

## Summary

- The sensor frameworks mark unknown values with numbers: negative accuracies, speeds, courses, and headings, a `verticalAccuracy` of 0 or below, and `distantPast`/`distantFuture` for visit dates. Pedometer data uses real optionals.
- Measured exceptions break the rules. Approximate fixes reported speed and course as 0. Simulator scenarios reported a speed accuracy of 0. Simulator routes gave correct speeds with a speed accuracy of −1.
- `CLLocation(latitude:longitude:)` claims a perfect accuracy of 0. `CLLocation()` is at Null Island, which counts as a valid coordinate. `kCLLocationCoordinate2DInvalid` is (−180, −180). Use the full initializer in tests.
- Convert to optionals once, at the boundary. Synthesized `Codable` then omits missing values from JSON instead of storing −1.
- Treating missing as zero biases a mean to $(1-p)\mu$: 20.7% low with 20% missing. Skipping or carrying forward stayed within 0.5% for short random gaps, but each fails differently when gaps correlate with what's being measured.
- When the interface depends on the reason, model the reason (unavailable, not authorized, not yet, invalid), and keep coverage with every aggregate.
- Don't use NaN for missing: `JSONEncoder` rejects it, and it silently poisons arithmetic.

## Exercise

Write a `Summary` type for a workout that reports distance, average speed, elevation gain, and average heart rate, where each field is a value together with its coverage (the fraction of the workout it was computed from). Build it from a stream of `LocationSample` values with deliberate gaps: a tunnel with no fixes, a stretch with no altitude, and a stretch where speeds are present but `speedAccuracy` is `nil`. Decide and document a policy for each field, and test that a workout with no altitude at all reports "no elevation data" rather than an elevation gain of 0 m.

## Further reading

- [`CLLocation`](https://developer.apple.com/documentation/corelocation/cllocation), whose property pages state each invalid-value rule
- [`kCLLocationCoordinate2DInvalid`](https://developer.apple.com/documentation/corelocation/kcllocationcoordinate2dinvalid) and [`CLLocationCoordinate2DIsValid(_:)`](https://developer.apple.com/documentation/corelocation/cllocationcoordinate2disvalid(_:))
- Roderick J. A. Little and Donald B. Rubin, *Statistical Analysis with Missing Data*, 3rd edition, Wiley, 2019, the standard reference on why missing values that aren't missing at random bias every simple fix

Previous: [Combining Motion and Location Without Shared-State Races](/ios-combining-motion-location/)

Next: [Designing Features Around Uncertainty and Accuracy](/ios-sensor-uncertainty/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
