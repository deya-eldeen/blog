---
layout: post
hidden: true
title: "Altitude, Pressure, and Relative Measurements"
date: "2026-02-20"
last_modified_at: "2026-02-20"
permalink: /ios-altimeter-pressure/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Sensors, Physics]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A barometer is a remarkable altimeter over a minute and a poor one over an afternoon. Air pressure falls by about one hectopascal for every eight meters of climb near sea level, and a phone's pressure sensor resolves a small fraction of that, so a single flight of stairs shows up clearly. But the weather moves the same pressure by hectopascals over hours, and the sensor can't tell a falling barometer from a rising user. Every altitude feature on iOS is built around that conflict between resolution and drift.

This article starts from the physics: the hypsometric equation behind `CMAltimeter`, how it scales with altitude and temperature, and how wind fools it. Then it builds a floor counter on simulated data with weather drift. After 28 minutes, the raw relative altitude had drifted 3.85 m and put the user on the wrong floor, while counting only rapid changes got the floor right. It ends with absolute altitude and a statistical trap: averaging ten minutes of GPS altitude cuts its error to 4.4 m, not the 0.4 m the textbook formula promises.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS block ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0, which has no barometer. Simulations use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions), and their sensor parameters are stated where they're used.

<!-- check-uses: sensor-random -->
```swift
import Foundation
```

## What Core Motion reports

`CMAltimeter` offers two services, both behind the Motion & Fitness permission:

| Service | Reports | Availability |
| --- | --- | --- |
| Relative altitude | `relativeAltitude` in meters since the first event, and `pressure` in **kilopascals** | `isRelativeAltitudeAvailable()` |
| Absolute altitude | `altitude` in meters, `accuracy` and `precision` in meters | `isAbsoluteAltitudeAvailable()`. Apple's documentation says "iPhone 12 and later" |

Apple's documentation describes the timing plainly: Core Motion "generates events at regular intervals (regardless of whether the data has changed)". Relative altitude starts at zero with the first event, so "if the altitude changed five meters between the first and second events, the value in this property is 5 for the second event." Absolute altitude's `accuracy` is "the estimated uncertainty of the altimeter in meters, based on one standard deviation", and `precision` is "the recommended resolution for the altitude", which is how many digits are worth displaying.

The pressure unit deserves a warning. Core Motion reports kilopascals, while weather services and most physics references use hectopascals (equal to millibars). A factor of ten is easy to lose. The service later in this article converts at the boundary.

## The physics of pressure and height

In a column of air at rest, pressure falls with height because each layer carries the weight of the air above it. For air at temperature $T$, combining the hydrostatic balance $dp = -\rho g\, dh$ with the ideal gas law $\rho = pM/(RT)$ gives $dp/p = -\frac{gM}{RT}\, dh$. Integrating between two pressures gives the **hypsometric equation**:

$$
h_2 - h_1 = \frac{R\,\bar T}{g\,M} \ln\frac{p_1}{p_2} = H \ln\frac{p_1}{p_2} ,
$$

where $R$ is the gas constant, $M$ the molar mass of dry air, $g$ gravity, $\bar T$ the mean temperature of the layer, and $H$ the *scale height*. Differentiating gives the local sensitivity $dh/dp = -H/p$, meters per unit of pressure, which grows as pressure drops:

```swift
/// Physical constants of the International Standard Atmosphere.
enum Atmosphere {
    static let gasConstant = 8.314_462_618      // J/(mol·K)
    static let molarMass = 0.028_964_4          // kg/mol, dry air
    static let gravity = 9.806_65               // m/s²
    static let seaLevelPressure = 1_013.25      // hPa
    static let seaLevelTemperature = 288.15     // K
    static let lapseRate = 0.0065               // K/m, in the troposphere

    /// Height difference between two pressure readings, for air at a mean temperature in kelvin (hypsometric equation).
    static func heightDifference(from p1: Double, to p2: Double, meanTemperature: Double) -> Double {
        gasConstant * meanTemperature / (molarMass * gravity) * log(p1 / p2)
    }

    /// Standard-atmosphere pressure at an altitude, in hPa.
    static func pressure(atAltitude h: Double) -> Double {
        seaLevelPressure * pow(1 - lapseRate * h / seaLevelTemperature, gravity * molarMass / (gasConstant * lapseRate))
    }

    /// How many meters one hectopascal is worth at an altitude in the standard atmosphere.
    static func metersPerHectopascal(atAltitude h: Double) -> Double {
        let p = pressure(atAltitude: h)
        return heightDifference(from: p + 0.5, to: p - 0.5, meanTemperature: seaLevelTemperature - lapseRate * h)
    }
}

for h in [0.0, 1_500, 3_000] {
    print(String(format: "%5.0f m: %.1f hPa, %.2f m per hPa", h, Atmosphere.pressure(atAltitude: h), Atmosphere.metersPerHectopascal(atAltitude: h)))
}
let scaleHeight = Atmosphere.gasConstant * Atmosphere.seaLevelTemperature / (Atmosphere.molarMass * Atmosphere.gravity)
print("scale height at 15 °C:", scaleHeight)

// A three-floor climb, 9 m, computed with the wrong temperature.
let ground = Atmosphere.pressure(atAltitude: 0), third = Atmosphere.pressure(atAltitude: 9)
for celsius in [-10.0, 15, 35] {
    print(String(format: "%3.0f °C: 9 m climb reads as %.3f m", celsius,
                 Atmosphere.heightDifference(from: ground, to: third, meanTemperature: 288.15 + (celsius - 15))))
}
```

| Altitude (standard atmosphere) | Pressure | Height per hPa |
| --- | --- | --- |
| 0 m | 1,013.2 hPa | 8.32 m |
| 1,500 m | 845.6 hPa | 9.64 m |
| 3,000 m | 701.1 hPa | 11.22 m |

At 15 °C, the scale height is 8,435 m. A sensor that resolves 0.01 hPa resolves about 8 cm of height at sea level. That's why a phone notices a single step up a staircase.

Temperature is the hidden parameter. The conversion depends on the *mean temperature of the air between the two heights*, which the phone doesn't know. Its sensor sits in a warm pocket, not in the stairwell. Getting the temperature wrong scales every height difference by $T_{\text{assumed}}/T_{\text{true}}$. In the standard atmosphere at 15 °C, a 9 m climb read as 8.22 m when converted assuming −10 °C, and 9.63 m assuming 35 °C. That's about 0.35% per kelvin. For counting floors it's irrelevant. For a hiking app summing 1,000 m of ascent, a 25 K error is 87 m.

## The weather problem

The equation turns *pressure differences* into *height differences*. Between two readings taken minutes apart, the pressure difference is almost entirely height. Between readings hours apart, it's height plus whatever the weather did. Pressure changes of a few hectopascals over a few hours are ordinary as weather systems pass, and each hectopascal is worth 8.3 m.

The simulation below models a building visit, sampled once per second:

- 2 minutes standing in the lobby.
- A climb of 3 floors by stairs, at 0.25 m/s.
- 20 minutes working.
- An elevator ride down 4 floors, to the basement, at 2 m/s.
- 5 minutes standing.

Floors are 3 m apart, as Apple's documentation assumes for `floorsAscended`. The barometer has 0.012 hPa of noise, about 0.1 m, and the weather lowers pressure at a steady 1 hPa per hour. Both values are illustrative.

```swift
/// A visit to a building, sampled once per second: true height in meters, and the barometer's relative altitude,
/// which also sees the weather. Floors are 3 m apart. Illustrative numbers: 0.012 hPa of noise (about 0.1 m),
/// and sea-level pressure falling 1 hPa per hour.
struct BuildingVisit {
    var trueHeight: [Double] = []
    var relativeAltitude: [Double] = []
    var events: [(time: Int, floors: Int)] = []
}

func simulateVisit(seed: UInt64) -> BuildingVisit {
    var random = SeededGenerator(seed: seed)
    var visit = BuildingVisit()
    var height = 0.0
    // (seconds, vertical speed in m/s): stand, climb 3 floors by stairs, work, take the elevator down 4, stand.
    let plan: [(Int, Double)] = [(120, 0), (36, 0.25), (1_200, 0), (6, -2.0), (300, 0)]
    let p0 = Atmosphere.pressure(atAltitude: 0)
    var t = 0
    for (seconds, speed) in plan {
        if speed != 0 { visit.events.append((t, Int((Double(seconds) * speed / 3).rounded()))) }
        for _ in 0..<seconds {
            height += speed
            let weather = -1.0 * Double(t) / 3_600                       // hPa change since the start
            let pressure = Atmosphere.pressure(atAltitude: height) + weather + random.gaussian() * 0.012
            visit.trueHeight.append(height)
            visit.relativeAltitude.append(Atmosphere.heightDifference(from: p0, to: pressure, meanTemperature: 288.15))
            t += 1
        }
    }
    return visit
}

let visit = simulateVisit(seed: 9)
let naiveFloor = Int((visit.relativeAltitude.last! / 3).rounded())
let trueFloor = Int((visit.trueHeight.last! / 3).rounded())
print("after", visit.trueHeight.count, "s: true floor", trueFloor, "relative altitude", visit.relativeAltitude.last!, "naive floor", naiveFloor)
```

After 1,662 seconds, the user was on floor −1, the basement. The relative altitude said +0.85 m, which rounds to the lobby. The weather had added 3.85 m of apparent climb in 28 minutes, enough to cancel more than a floor. Any feature that reads "current floor" from `relativeAltitude` directly is wrong within the hour, and the error grows for as long as the session runs.

## Counting only fast changes

The two signals differ in speed. Stairs move the user at about 0.25 m/s and elevators at a few meters per second. The weather in this scenario moves apparent height at 1 hPa × 8.3 m/hPa per hour, or 0.0023 m/s, about a hundred times slower than stairs. A floor counter can look only at stretches where the height changes faster than a threshold, measure each stretch's total change, round it to whole floors, and ignore everything between stretches:

```swift
/// Counts floor changes from relative altitude by looking only at the moments the height is changing fast.
/// Slow drift between those moments is weather, and it's ignored.
struct FloorCounter {
    var floorHeight = 3.0
    var movingRate = 0.1          // m/s over a 10 s window; weather of 1 hPa/h is about 0.0023 m/s
    private(set) var floor = 0
    private(set) var transitions: [(time: Int, floors: Int)] = []

    mutating func run(_ altitude: [Double]) {
        // Smooth over 5 s, then compare each point with the one 10 s earlier.
        let smoothed = altitude.indices.map { i in
            let window = altitude[max(0, i - 4)...i]
            return window.reduce(0, +) / Double(window.count)
        }
        var segmentStart: Int? = nil
        for i in 10..<smoothed.count {
            let rate = (smoothed[i] - smoothed[i - 10]) / 10
            let moving = abs(rate) > movingRate
            if moving, segmentStart == nil { segmentStart = max(0, i - 15) }
            if !moving, let start = segmentStart, i - start > 20 {
                let change = smoothed[i] - smoothed[start]
                let floors = Int((change / floorHeight).rounded())
                if floors != 0 { transitions.append((start, floors)); floor += floors }
                segmentStart = nil
            }
        }
    }
}

var counter = FloorCounter()
counter.run(visit.relativeAltitude)
print("events", visit.events.map { "\($0.floors) at \($0.time) s" }, "detected", counter.transitions.map { "\($0.floors) at \($0.time) s" }, "floor", counter.floor)
assert(counter.floor == trueFloor && naiveFloor != trueFloor)

let drift = visit.relativeAltitude.last! - visit.trueHeight.last!
print("weather drift after \(visit.trueHeight.count) s:", drift, "m")
```

The counter found both events, +3 floors at 111 s and −4 at 1,342 s, slightly before their true start times because it backs up 15 seconds to catch the beginning of the motion. It ended on floor −1. The 20 minutes of drift between the two trips didn't matter, because the counter never looked at it.

The thresholds are trade-offs, and they're easy to state. Weather faster than the moving rate, 0.1 m/s, would be counted as climbing: that's 43 hPa per hour, so it never happens. A ramp shallower than the threshold, such as a long, gentle walkway, wouldn't count as moving. Over a long climb, the drift inside the moving stretch adds a fraction of a meter, which rounding to whole floors absorbs. Pressure changes from doors and ventilation are quick but small, and the minimum stretch duration of 20 seconds filters most of them.

Wind is a different matter. Air moving across a pressure port changes the pressure the port sees, by up to the *dynamic pressure* $q = \tfrac{1}{2}\rho v^2$:

```swift
/// GPS altitude errors are correlated in time. Model them as a first-order Gauss-Markov process:
/// each second's error keeps a fraction exp(-1/τ) of the last one, with a stationary spread of `sigma`.
func gpsAltitudeErrors(seconds: Int, sigma: Double, correlationTime tau: Double, using random: inout SeededGenerator) -> [Double] {
    let phi = exp(-1 / tau)
    var error = random.gaussian() * sigma
    var errors: [Double] = []
    for _ in 0..<seconds {
        errors.append(error)
        error = phi * error + (1 - phi * phi).squareRoot() * sigma * random.gaussian()
    }
    return errors
}

var gpsRandom = SeededGenerator(seed: 10)
let sigma = 10.0, tau = 60.0
for window in [60, 600, 3_600] {
    var squares = 0.0
    let trials = 2_000
    for _ in 0..<trials {
        let errors = gpsAltitudeErrors(seconds: window, sigma: sigma, correlationTime: tau, using: &gpsRandom)
        let mean = errors.reduce(0, +) / Double(window)
        squares += mean * mean
    }
    let simulated = (squares / Double(trials)).squareRoot()
    let independent = sigma / Double(window).squareRoot()
    // Exact variance of the mean of an AR(1) process, and its large-window approximation σ·sqrt(2τ/T).
    let phi = exp(-1 / tau)
    let n = Double(window)
    var factor = 1.0
    for k in 1..<window { factor += 2 * (1 - Double(k) / n) * pow(phi, Double(k)) }
    let exact = sigma * (factor / n).squareRoot()
    print(String(format: "%5d s: simulated %.2f m, formula %.2f m, approximation %.2f m, if independent %.2f m",
                 window, simulated, exact, sigma * (2 * tau / n).squareRoot(), independent))
}
```

| Wind on the port | Pressure | Apparent height |
| --- | --- | --- |
| 5 m/s | 0.15 hPa | 1.3 m |
| 10 m/s | 0.61 hPa | 5.1 m |
| 20 m/s | 2.45 hPa | 20.4 m |

These are upper bounds for wind blowing straight into the port. A phone in a pocket sees much less, and how much depends on the case and the pocket. But gusts are fast, so a 10 m/s gust can look like two floors of elevator. Outdoors, floor counting is the wrong question, and the elevation features of outdoor apps combine the barometer with GPS instead.

## Absolute altitude, and averaging that doesn't average

Absolute altitude needs a reference: the barometer measures height *differences*, so something must say where zero is. A natural approach is to use GPS altitude as that reference and average it to beat its noise. Averaging $N$ independent samples divides the error by $\sqrt N$, so 600 samples of a GPS altitude with 10 m of error should give 0.41 m.

They don't, because GPS errors aren't independent from second to second. They come from satellite geometry and atmospheric delays that change over minutes. A standard model is the first-order Gauss-Markov process, in which each second's error keeps a fraction $\varphi = e^{-1/\tau}$ of the previous one, for a correlation time $\tau$. For that process, the variance of the mean of $N$ samples is

$$
\operatorname{Var}(\bar e) = \frac{\sigma^2}{N} \left[ 1 + 2\sum_{k=1}^{N-1} \Big(1 - \frac{k}{N}\Big)\varphi^k \right] \approx \sigma^2\, \frac{2\tau}{T} \quad \text{for } T \gg \tau ,
$$

where $T = N\Delta t$ is the averaging time. Roughly, a correlated series of length $T$ contains only $T / 2\tau$ independent samples. With $\sigma = 10$ m and an illustrative $\tau = 60$ s:

```swift
// Wind blowing into a pressure port adds dynamic pressure q = ½ρv². How tall does it make the user look?
let airDensity = 1.225   // kg/m³ at 15 °C, sea level
for speed in [5.0, 10, 20] {
    let pascals = 0.5 * airDensity * speed * speed
    print(String(format: "%2.0f m/s wind: %.0f Pa = %.2f hPa ≈ %.1f m", speed, pascals, pascals / 100,
                 pascals / 100 * Atmosphere.metersPerHectopascal(atAltitude: 0)))
}
```

| Averaging time | Simulated error | Exact formula | $\sigma\sqrt{2\tau/T}$ | If samples were independent |
| --- | --- | --- | --- | --- |
| 1 minute | 8.55 m | 8.58 m | 14.14 m | 1.29 m |
| 10 minutes | 4.43 m | 4.24 m | 4.47 m | 0.41 m |
| 1 hour | 1.84 m | 1.81 m | 1.83 m | 0.17 m |

The simulation agreed with the exact formula to within 5% at every length. The independent-sample formula was off by a factor of 7 to 11. The approximation is useless for a one-minute average, where $T$ is barely longer than $\tau$: it predicts 14 m, more than the 10 m error of a single sample, which is impossible. It's good for longer averages. The practical consequence: when an app calibrates the barometer against GPS, the uncertainty of the calibration falls with the square root of *minutes*, not of samples, and an hour of GPS buys a couple of meters. `CMAbsoluteAltitudeData.accuracy` reports Core Motion's own estimate of this uncertainty as a one-sigma value, which is the number to show.

## Receiving altitude in Swift 6

The altimeter wrapper follows the pattern from the earlier articles: an availability check, a handler from a `nonisolated` factory, `Sendable` samples, and the pressure converted from kilopascals to hectopascals at the boundary. The test grants motion access first:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted grant motion dev.swiftbydeya.Host
```

<!-- ios -->
```swift
import CoreMotion

struct AltitudeSample: Sendable {
    var timestamp: TimeInterval
    var relativeAltitude: Double    // meters since the first sample
    var pressure: Double            // hPa (Core Motion reports kilopascals)
}

@MainActor final class AltimeterService {
    private let altimeter = CMAltimeter()
    private let queue = OperationQueue()

    func relativeAltitudes() -> AsyncThrowingStream<AltitudeSample, any Error> {
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: AltitudeSample.self, throwing: (any Error).self)
        guard CMAltimeter.isRelativeAltitudeAvailable() else {
            continuation.finish()
            return stream
        }
        altimeter.startRelativeAltitudeUpdates(to: queue, withHandler: Self.handler(continuation))
        continuation.onTermination = { [weak self] _ in Task { @MainActor in self?.altimeter.stopRelativeAltitudeUpdates() } }
        return stream
    }

    private nonisolated static func handler(_ continuation: AsyncThrowingStream<AltitudeSample, any Error>.Continuation) -> CMAltitudeHandler {
        { data, error in
            if let error { return continuation.finish(throwing: error) }
            guard let data else { return }
            continuation.yield(AltitudeSample(timestamp: data.timestamp, relativeAltitude: data.relativeAltitude.doubleValue,
                                              pressure: data.pressure.doubleValue * 10))
        }
    }
}

assert(CMAltimeter.authorizationStatus() == .authorized)
assert(!CMAltimeter.isRelativeAltitudeAvailable() && !CMAltimeter.isAbsoluteAltitudeAvailable())
let altimeterService = AltimeterService()   // must outlive the stream; see below
var altitudeSamples = 0
for try await _ in altimeterService.relativeAltitudes() { altitudeSamples += 1 }
assert(altitudeSamples == 0)
```

On the simulator, neither altitude service is available, so the stream finishes immediately, which is the [availability check](/ios-sensor-availability/#what-happens-when-you-start-anyway) doing its job, since a start call there "does nothing".

One line in the test is there because of a compiler warning. The first version iterated `AltimeterService().relativeAltitudes()` directly, and Swift 6.4 warned: "weak reference will always be nil because the referenced object is deallocated here." The service was a temporary, so it, and the `CMAltimeter` it owned, would be deallocated as soon as the stream was created. On a device, updates would have stopped at once, without any error. The fix is to keep the service alive for as long as the stream is consumed. The [stopping updates article](/ios-sensor-stopping-updates/) treats ownership and lifetime properly.

## Summary

- Relative altitude is in meters since the first event. Pressure is in kilopascals, ten times hectopascals. Absolute altitude, on iPhone 12 and later, comes with a one-sigma `accuracy` and a display `precision`.
- The hypsometric equation turns pressure ratios into height, with a scale height of 8,435 m at 15 °C: 8.32 m per hPa at sea level, 11.22 m per hPa at 3,000 m.
- The conversion depends on air temperature, at about 0.35% per kelvin. That doesn't matter for floors, but it does for summed ascent.
- Weather drift is indistinguishable from climbing. 1 hPa per hour put a simulated user on the wrong floor within 28 minutes.
- Counting only fast height changes, and rounding each one to whole floors, ignores drift between them. The simulated counter got both trips and the final floor right.
- Wind on the pressure port can mimic meters of height, up to 5 m for a 10 m/s wind into the port, so floor counting is an indoor feature.
- Averaging correlated GPS altitude gains $\sqrt{T/2\tau}$, not $\sqrt N$: ten minutes cut 10 m to 4.4 m, not to 0.41 m.
- Keep the object that owns a `CMAltimeter` alive for as long as its stream runs. Swift 6.4 warns when it can see the mistake.

## Exercise

Turn `FloorCounter` into a streaming type that consumes `AltitudeSample` values one at a time and publishes the current floor. Then make it robust to a missed transition: when the counter has been still for ten minutes and its accumulated relative altitude, corrected for the floors it counted, differs from a whole number of floors by more than 1.5 m, flag the floor as uncertain rather than silently guessing. Test it against `simulateVisit` with the weather drift raised to 3 hPa per hour, and with a second, slower elevator.

## Further reading

- [`CMAltimeter`](https://developer.apple.com/documentation/coremotion/cmaltimeter), [`CMAltitudeData`](https://developer.apple.com/documentation/coremotion/cmaltitudedata), and [`CMAbsoluteAltitudeData`](https://developer.apple.com/documentation/coremotion/cmabsolutealtitudedata)
- NOAA's [U.S. Standard Atmosphere, 1976](https://www.ngdc.noaa.gov/stp/space-weather/online-publications/miscellaneous/us-standard-atmosphere-1976/us-standard-atmosphere_st76-1562_noaa.pdf), the reference for the standard-atmosphere constants used here
- Arthur Gelb (ed.), *Applied Optimal Estimation*, MIT Press, 1974, on Gauss-Markov error models and why correlated errors average slowly

Previous: [Pedometer Data and Activity Recognition](/ios-pedometer-activity/)

Next: [Sampling Rates, Noise, Filtering, and Drift](/ios-sensor-sampling-filtering/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
