---
layout: post
hidden: true
title: "Location Updates and Accuracy Requirements"
date: "2026-02-25"
last_modified_at: "2026-02-25"
permalink: /ios-location-updates-accuracy/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Sensors, Geodesy]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A `CLLocation` looks like an answer and is really a claim: "the device is probably within this many meters of this point, as of this moment." Every field of it has conditions. The accuracy can be negative, which means the coordinate is invalid. The timestamp can be minutes old. The speed can be −1, meaning unknown. And `horizontalAccuracy` is a radius whose confidence level Apple doesn't state. An app that wants a location for a purpose, such as "where to start the run" or "which store is nearest", has to turn that claim into a decision.

This article covers the pieces of that decision. It explains what each property of a fix means, according to Apple's documentation, and what an accuracy radius means statistically. It measures distances, and finds that `CLLocation.distance(from:)` agrees with Vincenty's ellipsoidal formula to within 2 mm across 10,000 km, while the popular haversine formula is off by up to 0.56%. It builds a selector that waits for a good enough fix within a time budget, and on a simulated cold start the first fix it saw was a cached one from the previous location. And it builds a filter that rejects impossible jumps, cutting a 4.2 km track with one outlier back to its true 177 m.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, where `CLLocation` math works without any permission, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, with locations scripted by `simctl`. One simulation uses the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
import CoreLocation
```

## What a fix contains

Apple's documentation gives each property of `CLLocation` a meaning and an invalid value:

| Property | Meaning | Invalid when |
| --- | --- | --- |
| `coordinate` | Latitude and longitude, WGS 84 | `horizontalAccuracy` is negative |
| `horizontalAccuracy` | "The radius of uncertainty for the location, measured in meters" | negative |
| `altitude` | Height above mean sea level, approximated by the EGM2008 geoid | `verticalAccuracy` is 0 or negative |
| `ellipsoidalAltitude` | Height above the WGS 84 ellipsoid | `verticalAccuracy` is 0 or negative |
| `verticalAccuracy` | "Approximately 68 percent, or one standard deviation" | 0 or negative |
| `speed` | Instantaneous speed, m/s, "for informational purposes only" | negative |
| `speedAccuracy` | ± m/s | negative |
| `course` | Degrees clockwise from true north | negative |
| `courseAccuracy` | ± degrees | negative |
| `timestamp` | When the fix was determined, not when it was delivered | |
| `sourceInformation` | Simulated by software, or produced by an accessory | `nil` |

The vertical accuracy has a stated confidence level. The horizontal accuracy doesn't. That gap matters for any feature that tests whether the user is inside something, and the next section returns to it.

Two more facts from the documentation set expectations for `desiredAccuracy`, the classic way to ask for precision. First, "the location service does its best to achieve the requested accuracy; however, apps must be prepared to use less accurate data", and "more accurate location data also takes more time to become available". Second, on iOS the default is `kCLLocationAccuracyBest`. The constants are ordinary numbers, and printing them in the simulator gave:

| Constant | Value |
| --- | --- |
| `kCLLocationAccuracyBestForNavigation` | −2 |
| `kCLLocationAccuracyBest` | −1 |
| `kCLLocationAccuracyNearestTenMeters` | 10 |
| `kCLLocationAccuracyHundredMeters` | 100 |
| `kCLLocationAccuracyKilometer` | 1,000 |
| `kCLLocationAccuracyThreeKilometers` | 3,000 |
| `kCLLocationAccuracyReduced` | 6,380,000 |

The negative values are markers, not distances. `kCLLocationAccuracyReduced` is roughly the Earth's radius, a number that can only mean "as coarse as you like", and the [permission changes article](/ios-location-permission-changes/#the-app-can-choose-to-blur) measured what it does.

`CLLocationUpdate.liveUpdates(_:)` replaces `desiredAccuracy` with a `LiveConfiguration` that describes the activity rather than a number: `.default`, `.automotiveNavigation`, `.otherNavigation` ("transportation that doesn't, or may not, adhere to roads"), `.fitness` ("dedicated fitness sessions"), `.airborne`, and new in iOS 27, `.maritime`. The configuration tells Core Location which assumptions it can make, for example that a car stays on roads, which lets it trade power for accuracy in ways a number can't express.

## What the accuracy radius means

Suppose position errors are Gaussian, independent along east and north, with standard deviation $\sigma$ on each axis. The distance $d$ between the fix and the truth then follows a Rayleigh distribution, and the probability that the truth lies within a radius $r$ is

$$
P(d \le r) = 1 - e^{-r^2 / 2\sigma^2} .
$$

So a "radius of uncertainty" means very different things depending on what it was computed as:

```swift
// If position errors are Gaussian with standard deviation σ along each axis, the distance from the truth follows a
// Rayleigh distribution, and the chance of being inside a circle of radius r is 1 - exp(-r²/2σ²).
func probabilityInside(radius r: Double, sigma: Double) -> Double { 1 - exp(-r * r / (2 * sigma * sigma)) }
func radius(containing p: Double, sigma: Double) -> Double { sigma * (-2 * log(1 - p)).squareRoot() }

var errorRandom = SeededGenerator(seed: 15)
let draws = (0..<200_000).map { _ in (east: errorRandom.gaussian(), north: errorRandom.gaussian()) }
for k in [1.0, radius(containing: 0.5, sigma: 1), 2, radius(containing: 0.95, sigma: 1)] {
    let inside = Double(draws.filter { ($0.east * $0.east + $0.north * $0.north).squareRoot() <= k }.count) / Double(draws.count)
    print(String(format: "r = %.4f σ: %.1f%% predicted, %.1f%% simulated", k, probabilityInside(radius: k, sigma: 1) * 100, inside * 100))
}
```

| Radius | Contains the truth | Simulated |
| --- | --- | --- |
| $\sigma$ | 39.3% | 39.4% |
| $1.1774\,\sigma$ (circular error probable) | 50.0% | 50.1% |
| $2\,\sigma$ | 86.5% | 86.6% |
| $2.4477\,\sigma$ | 95.0% | 95.1% |

If `horizontalAccuracy` were one standard deviation per axis, as `verticalAccuracy` is documented to be, the truth would be outside the circle 61% of the time. If it's a 95% radius, only 5%. Apple doesn't say which, and the real error distribution of a phone in a city isn't Gaussian anyway, because of multipath, reflections, and Wi-Fi positioning. The responsible design is to treat the radius as a scale and calibrate the threshold on real data: record fixes on a path whose truth you know, such as a surveyed track or a walk along a straight street, and count how often the truth falls inside $k$ times the reported radius, for a few values of $k$. The [uncertainty article](/ios-sensor-uncertainty/) builds geofence decisions on that idea.

## Measuring distance

`CLLocation.distance(from:)` is documented only as returning "the distance (measured in meters)". Measuring it against two textbook formulas shows which model of the Earth it uses. The **haversine** formula assumes a sphere of radius $R$:

$$
d = 2R \arcsin \sqrt{\sin^2\frac{\Delta\varphi}{2} + \cos\varphi_1 \cos\varphi_2 \sin^2\frac{\Delta\lambda}{2}} .
$$

**Vincenty's inverse formula** solves the geodesic on the WGS 84 ellipsoid by iteration, and it's accurate to fractions of a millimeter. Both are below, followed by a comparison with `CLLocation` over distances from 100 m to a quarter of the globe:

```swift
/// Great-circle distance on a sphere of the mean Earth radius (haversine formula).
func haversine(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, radius: Double = 6_371_008.8) -> Double {
    let (p1, p2) = (a.latitude * .pi / 180, b.latitude * .pi / 180)
    let dp = p2 - p1, dl = (b.longitude - a.longitude) * .pi / 180
    let h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
    return 2 * radius * asin(min(1, h.squareRoot()))
}

/// Geodesic distance on the WGS 84 ellipsoid by Vincenty's inverse formula. Returns nil if it fails to converge,
/// which happens only for nearly antipodal points.
func vincenty(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double? {
    let major = 6_378_137.0, flattening = 1 / 298.257_223_563
    let minor = (1 - flattening) * major
    let L = (b.longitude - a.longitude) * .pi / 180
    let U1 = atan((1 - flattening) * tan(a.latitude * .pi / 180))
    let U2 = atan((1 - flattening) * tan(b.latitude * .pi / 180))
    let (sinU1, cosU1, sinU2, cosU2) = (sin(U1), cos(U1), sin(U2), cos(U2))
    var lambda = L
    for _ in 0..<200 {
        let sinLambda = sin(lambda), cosLambda = cos(lambda)
        let sinSigma = ((cosU2 * sinLambda) * (cosU2 * sinLambda) +
                        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)).squareRoot()
        if sinSigma == 0 { return 0 }
        let cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
        let sigma = atan2(sinSigma, cosSigma)
        let sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma
        let cos2Alpha = 1 - sinAlpha * sinAlpha
        let cos2SigmaM = cos2Alpha == 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cos2Alpha
        let C = flattening / 16 * cos2Alpha * (4 + flattening * (4 - 3 * cos2Alpha))
        let previous = lambda
        lambda = L + (1 - C) * flattening * sinAlpha *
            (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
        if abs(lambda - previous) < 1e-12 {
            let u2 = cos2Alpha * (major * major - minor * minor) / (minor * minor)
            let A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
            let B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
            let deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
                B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))
            return minor * A * (sigma - deltaSigma)
        }
    }
    return nil
}

func coordinate(_ latitude: Double, _ longitude: Double) -> CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
}

let pairs: [(String, CLLocationCoordinate2D, CLLocationCoordinate2D)] = [
    ("100 m east, London", coordinate(51.5007, -0.1246), coordinate(51.5007, -0.12316)),
    ("1 km north, Quito", coordinate(-0.1807, -78.4678), coordinate(-0.1717, -78.4678)),
    ("1 km north, Oslo", coordinate(59.9139, 10.7522), coordinate(59.9229, 10.7522)),
    ("London to Paris", coordinate(51.5007, -0.1246), coordinate(48.8584, 2.2945)),
    ("San Francisco to New York", coordinate(37.629538, -122.395733), coordinate(40.628083, -73.768254)),
    ("Equator, 90° of longitude", coordinate(0, 0), coordinate(0, 90)),
    ("Pole to equator", coordinate(90, 0), coordinate(0, 0)),
]
print("pair                          CLLocation        Vincenty      CL - Vincenty   haversine error")
for (name, a, b) in pairs {
    let cl = CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
    let v = vincenty(a, b)!
    let h = haversine(a, b)
    assert(abs(cl - v) < 0.002, "CLLocation measures on the ellipsoid")
    print(name.padding(toLength: 28, withPad: " ", startingAt: 0),
          String(format: "%14.3f  %14.3f  %12.6f   %+.3f%%", cl, v, cl - v, (h - v) / v * 100))
}
```

| Pair | `CLLocation` | Vincenty | Difference | Haversine error |
| --- | --- | --- | --- | --- |
| 100 m east, London | 99.993 m | 99.993 m | 0 | −0.317% |
| 1 km north, Quito | 995.169 m | 995.169 m | 0 | +0.561% |
| 1 km north, Oslo | 1,002.698 m | 1,002.698 m | 0 | −0.194% |
| London to Paris | 340,894.816 m | 340,894.816 m | −0.2 mm | −0.104% |
| San Francisco to New York | 4,164,327.256 m | 4,164,327.256 m | 0.05 mm | −0.242% |
| Equator, 90° of longitude | 10,018,754.170 m | 10,018,754.171 m | −1.3 mm | −0.112% |
| Pole to equator | 10,001,965.729 m | 10,001,965.729 m | 0 | +0.056% |

`CLLocation` agrees with Vincenty to within 1.3 mm everywhere, on macOS and on the iOS simulator alike, so it measures on the ellipsoid. The haversine formula's error depends on direction and latitude, because the ellipsoid's radius of curvature does. A north-south kilometer at the equator is 995.17 m of ellipsoid but 1,000.76 m of sphere, an error of +0.56%. That's 5.6 m per kilometer. It's harmless for "3.2 km away" and not harmless for a running app that totals a marathon, where it amounts to 236 m.

So use `distance(from:)` and don't reimplement it. When code must run without Core Location, for example in a server or a shared package, use Vincenty or a geodesic library, not the haversine formula. Note the half-meter error in the "100 m" row too: the test points were placed 0.00144° apart using a spherical rule of thumb, and they came out 99.993 m apart. Converting meters to degrees deserves the same care as converting back.

## Waiting for a good enough fix

A feature rarely needs "the location". It needs a location good enough for its purpose, within a time it can afford to wait. That's three parameters:

- **Accuracy**: the largest `horizontalAccuracy` that's acceptable.
- **Maximum age**: how long before the request a fix may have been taken. Core Location often delivers a cached fix first.
- **Time budget**: how long to wait before settling for the best fix seen so far, or for none.

The selector below applies them to each arriving fix. It skips invalid and stale fixes, remembers the best usable one, accepts the first that meets the accuracy, and settles when the budget runs out:

```swift
/// What a feature needs from a fix, and how long it will wait for one.
struct LocationRequirement {
    var accuracy: CLLocationAccuracy     // meters; accept a fix whose horizontalAccuracy is at most this
    var maximumAge: TimeInterval         // how long before the request started a fix may have been taken
    var timeBudget: TimeInterval         // after this long, settle for the best fix seen
}

enum FixDecision: Equatable {
    case accept(CLLocation)
    case wait
    case settle(for: CLLocation?)       // the budget ran out; the best fix so far, if any
}

struct FixSelector {
    let requirement: LocationRequirement
    let started: Date
    private(set) var best: CLLocation?

    init(_ requirement: LocationRequirement, started: Date) { self.requirement = requirement; self.started = started }

    mutating func consider(_ fix: CLLocation, now: Date) -> FixDecision {
        let usable = fix.horizontalAccuracy >= 0 && started.timeIntervalSince(fix.timestamp) <= requirement.maximumAge
        if usable, best.map({ fix.horizontalAccuracy < $0.horizontalAccuracy }) ?? true { best = fix }
        if usable, fix.horizontalAccuracy <= requirement.accuracy { return .accept(fix) }
        return now.timeIntervalSince(started) >= requirement.timeBudget ? .settle(for: best) : .wait
    }
}

func fix(_ accuracy: Double, age: TimeInterval, at now: Date) -> CLLocation {
    CLLocation(coordinate: CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1246), altitude: 0,
               horizontalAccuracy: accuracy, verticalAccuracy: -1, timestamp: now.addingTimeInterval(-age))
}

let t0 = Date(timeIntervalSinceReferenceDate: 800_000_000)
var selector = FixSelector(LocationRequirement(accuracy: 35, maximumAge: 10, timeBudget: 20), started: t0)
let arrivals: [(Double, CLLocation)] = [
    (0.1, fix(10, age: 900, at: t0.addingTimeInterval(0.1))),     // a cached fix from 15 minutes ago
    (1.0, fix(-1, age: 0, at: t0.addingTimeInterval(1))),        // invalid
    (2.0, fix(1_500, age: 0, at: t0.addingTimeInterval(2))),
    (4.0, fix(65, age: 0, at: t0.addingTimeInterval(4))),
    (6.0, fix(50, age: 0, at: t0.addingTimeInterval(6))),
    (8.0, fix(30, age: 0, at: t0.addingTimeInterval(8))),
]
var decisions: [String] = []
for (time, location) in arrivals {
    switch selector.consider(location, now: t0.addingTimeInterval(time)) {
    case .accept(let chosen): decisions.append("accept \(Int(chosen.horizontalAccuracy)) m at \(time) s")
    case .wait: decisions.append("wait")
    case .settle(let chosen): decisions.append("settle \(chosen.map { "\(Int($0.horizontalAccuracy))" } ?? "none")")
    }
}
print(decisions)
assert(decisions == ["wait", "wait", "wait", "wait", "wait", "accept 30 m at 8.0 s"])

var impatient = FixSelector(LocationRequirement(accuracy: 10, maximumAge: 10, timeBudget: 5), started: t0)
_ = impatient.consider(fix(65, age: 0, at: t0.addingTimeInterval(4)), now: t0.addingTimeInterval(4))
assert(impatient.consider(fix(80, age: 0, at: t0.addingTimeInterval(6)), now: t0.addingTimeInterval(6))
       == .settle(for: impatient.best) && impatient.best?.horizontalAccuracy == 65)
```

The synthetic arrivals show each rule. A cached fix from 15 minutes earlier is rejected despite its tempting 10 m accuracy. An invalid fix and a 1,500 m fix are passed over. The first fix within 35 m is accepted at 8 seconds. A second selector, with a strict 10 m requirement and a 5-second budget, settles for the best fix it saw, the 65 m one, when time runs out. The caller can then decide whether "65 m after 5 seconds" is still worth showing.

Then on the simulator. The test grants access, places the device at Westminster Bridge, and checks first whether `desiredAccuracy` changes anything there:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant location dev.swiftbydeya.Host
xcrun simctl location booted set 51.5007,-0.1246
```

<!-- ios -->
```swift
print("accuracy constants:", kCLLocationAccuracyBestForNavigation, kCLLocationAccuracyBest, kCLLocationAccuracyNearestTenMeters,
      kCLLocationAccuracyHundredMeters, kCLLocationAccuracyKilometer, kCLLocationAccuracyThreeKilometers, kCLLocationAccuracyReduced)

@MainActor final class Fixes: NSObject, @preconcurrency CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var received: [(at: Date, fix: CLLocation)] = []
    override init() { super.init(); manager.delegate = self }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { received.append((Date(), location)) }
    }
    func since(_ date: Date) -> [CLLocation] { received.filter { $0.at > date }.map(\.fix) }
}

// Ask for kilometer accuracy, then drive a route: does the simulator deliver anything different?
let coarse = Fixes()
coarse.manager.desiredAccuracy = kCLLocationAccuracyKilometer
coarse.manager.startUpdatingLocation()
try await Task.sleep(for: .seconds(1))
let routeStart = Date()
```

<!-- sim-run -->
```sh
xcrun simctl location booted start --speed=10 --interval=1 51.5007,-0.1246 51.5007,-0.1100
```

<!-- ios -->
```swift
try await Task.sleep(for: .seconds(8))
let coarseFixes = coarse.since(routeStart.addingTimeInterval(0.5))
print("kilometer accuracy requested:", coarseFixes.count, "fixes in 8 s, accuracies", Set(coarseFixes.map(\.horizontalAccuracy)))
assert(coarseFixes.count >= 6 && coarseFixes.allSatisfy { $0.horizontalAccuracy == 5 })
coarse.manager.stopUpdatingLocation()
```

With `kCLLocationAccuracyKilometer` requested, the simulator still delivered a 5 m fix every second along the route, 7 or 8 in 8 seconds across runs. Simulated location ignores the request, so tests of accuracy-dependent logic must script the accuracies themselves, as the Apple scenario does. That scenario is the cold start to test against: it reports 500 m, then 65 m, then 50 m, then 30 m, while the device stands still. The selector requires 40 m, measuring freshness from the moment of the request:

<!-- sim-run -->
```sh
xcrun simctl location booted clear
xcrun simctl location booted run "Apple"
```

<!-- ios -->
```swift
// The Apple scenario starts with poor accuracy and improves: a good stand-in for a cold start.
try await Task.sleep(for: .seconds(1))
let started = Date()
var chooser = FixSelector(LocationRequirement(accuracy: 40, maximumAge: 0, timeBudget: 20), started: started)
var outcome: FixDecision = .wait
var seen: [String] = []
search: for try await update in CLLocationUpdate.liveUpdates(.fitness) {
    guard let location = update.location else { continue }
    seen.append(String(format: "%.0f m, %.1f s old", location.horizontalAccuracy, started.timeIntervalSince(location.timestamp)))
    outcome = chooser.consider(location, now: Date())
    switch outcome {
    case .wait: continue
    case .accept, .settle: break search
    }
}
let elapsed = Date().timeIntervalSince(started)
print("accuracies seen", seen, "outcome", outcome, "after", elapsed, "s")
guard case .accept(let chosen) = outcome else { fatalError("expected an accepted fix") }
assert(chosen.horizontalAccuracy <= 40 && abs(chosen.coordinate.latitude - 37.33) < 0.01)
```

The first update from `liveUpdates(.fitness)` was a 5 m fix from London, taken 1.5 seconds before the request. It was the last position of the previous route, delivered again even after `simctl location clear`. With a maximum age of zero, the selector rejected it. Then came 500 m, three fixes at 65 m, two at 50 m, and a fix at 30 m, accepted 10.1 seconds after the request, in Cupertino. With the original rule, age measured at arrival with a 10-second limit, the first run of this test accepted the London fix immediately. On a phone, that's the user's position from wherever the last app saw it, presented as current. Measure freshness from the request, not from arrival.

## Rejecting impossible jumps

Even good fixes occasionally jump: a reflection off a building, a Wi-Fi access point that moved, a moment of bad geometry. A jump that implies an impossible speed is easy to catch, as long as the test allows for the fixes' own uncertainty. Two fixes with accuracies $h_1$ and $h_2$ can legitimately be up to $h_1 + h_2$ apart while the device stands still, so only the distance beyond that counts:

$$
v_{\text{implied}} = \frac{d - h_1 - h_2}{\Delta t} > v_{\max} \implies \text{reject} .
$$

```swift
/// Rejects fixes that imply impossible speed. Two fixes can be up to the sum of their accuracies apart without moving,
/// so only the distance beyond that counts against the speed limit.
struct PlausibilityFilter {
    var maximumSpeed: CLLocationSpeed            // m/s, chosen for the activity
    private(set) var last: CLLocation?
    private(set) var rejected = 0

    init(maximumSpeed: CLLocationSpeed) { self.maximumSpeed = maximumSpeed }

    mutating func accept(_ fix: CLLocation) -> Bool {
        guard fix.horizontalAccuracy >= 0 else { rejected += 1; return false }
        if let last {
            let elapsed = max(fix.timestamp.timeIntervalSince(last.timestamp), 0.001)
            let unexplained = fix.distance(from: last) - fix.horizontalAccuracy - last.horizontalAccuracy
            if unexplained / elapsed > maximumSpeed { rejected += 1; return false }
        }
        last = fix
        return true
    }
}

// A run at 3 m/s along a parallel, one fix per second, with one wild fix 2 km off at second 30.
func runFix(_ second: Int, offsetNorth: Double = 0, accuracy: Double = 8,
            from start: Date = Date(timeIntervalSinceReferenceDate: 800_000_000)) -> CLLocation {
    let east = 3.0 * Double(second)
    return CLLocation(coordinate: CLLocationCoordinate2D(latitude: 51.5007 + offsetNorth / 111_250,
                                                         longitude: -0.1246 + east / 69_440),
                      altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1,
                      timestamp: start.addingTimeInterval(Double(second)))
}
func length(_ track: [CLLocation]) -> CLLocationDistance {
    zip(track.dropFirst(), track).reduce(0) { $0 + $1.0.distance(from: $1.1) }
}
let raw = (0..<60).map { $0 == 30 ? runFix($0, offsetNorth: 2_000, accuracy: 50) : runFix($0) }
var filter = PlausibilityFilter(maximumSpeed: 8)
let kept = raw.filter { filter.accept($0) }
print("rejected", filter.rejected, String(format: "track %.0f m raw, %.0f m filtered, %.0f m true",
                                          length(raw), length(kept), runFix(59).distance(from: runFix(0))))
assert(filter.rejected == 1)
```

On a simulated one-minute run at 3 m/s, with one fix 2 km off at second 30, the filter rejected exactly that fix. Summing the raw track gave 4,171 m, two 2 km legs out to the outlier and back. The filtered track gave 177 m, the true distance. The speed limit is the activity's: 8 m/s rejects nothing a runner can do, while a driving app needs 60 m/s or more. The filter compares each fix with the last *accepted* one, so a single outlier can't drag the reference away. A long run of rejections is itself a signal: either the device really moved fast, perhaps onto a train, or the reference fix was the bad one. A production version should reset after a few consecutive rejections.

## Summary

- Every `CLLocation` field has an invalid marker, usually a negative number, and `verticalAccuracy` of 0 is invalid too. Check before you use the value.
- `verticalAccuracy` is documented as one standard deviation. `horizontalAccuracy` is "the radius of uncertainty", with no stated confidence. Under a Gaussian model, a 1σ circle contains the truth only 39% of the time, so calibrate thresholds on known paths.
- `CLLocation.distance(from:)` matched Vincenty's ellipsoidal formula to within 1.3 mm over 10,000 km. The haversine formula was off by up to 0.56%, 5.6 m per kilometer.
- The simulator ignores `desiredAccuracy`. A kilometer request still got 5 m fixes at 1 Hz. Script accuracies instead, for example with the Apple scenario, which improves from 500 m to 30 m.
- Select fixes by accuracy, freshness measured from the request, and a time budget. On the simulator, the first live update was a stale fix from the previous location. The selector rejected it and accepted a 30 m fix after 10.1 s.
- Reject fixes whose implied speed beyond their combined accuracies exceeds the activity's limit. One outlier inflated a 177 m track to 4,171 m, and the filter removed it.

## Exercise

Combine `FixSelector` and `PlausibilityFilter` into a `LocationRequest` that wraps `CLLocationUpdate.liveUpdates()` and returns a single fix with an `async` method: `func fix(for requirement: LocationRequirement) async throws -> CLLocation?`. It should return the accepted fix, the best fix when the budget runs out, or `nil` if nothing usable arrived, and it should stop iterating, which ends the live updates, as soon as it has an answer. Test it in the simulator with the Apple scenario and with a route that starts after a 3-second delay.

## Further reading

- [`CLLocation`](https://developer.apple.com/documentation/corelocation/cllocation), especially [`horizontalAccuracy`](https://developer.apple.com/documentation/corelocation/cllocation/horizontalaccuracy) and [`verticalAccuracy`](https://developer.apple.com/documentation/corelocation/cllocation/verticalaccuracy)
- [`desiredAccuracy`](https://developer.apple.com/documentation/corelocation/cllocationmanager/desiredaccuracy) and [`CLLocationUpdate.LiveConfiguration`](https://developer.apple.com/documentation/corelocation/cllocationupdate/liveconfiguration)
- Thaddeus Vincenty, "Direct and Inverse Solutions of Geodesics on the Ellipsoid with Application of Nested Equations", *Survey Review* 23(176), 1975, [doi:10.1179/sre.1975.23.176.88](https://doi.org/10.1179/sre.1975.23.176.88)
- Charles F. F. Karney, "Algorithms for geodesics", *Journal of Geodesy* 87, 2013, [doi:10.1007/s00190-012-0578-z](https://doi.org/10.1007/s00190-012-0578-z), which fixes Vincenty's convergence failures for nearly antipodal points

Previous: [Sampling Rates, Noise, Filtering, and Drift](/ios-sensor-sampling-filtering/)

Next: [Distance Filters and Energy-Aware Tracking](/ios-location-distance-filter-energy/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
