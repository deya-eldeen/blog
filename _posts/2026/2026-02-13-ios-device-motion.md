---
layout: post
hidden: true
title: "Device Motion, Gravity, and User Acceleration"
date: "2026-02-13"
last_modified_at: "2026-02-13"
permalink: /ios-device-motion/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Sensors, Signal Processing]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
An accelerometer can't tell gravity from motion. A phone tilted 17 degrees and a phone braking at 0.3 g in a car produce the same reading, and no amount of cleverness applied to that one reading tells them apart. Core Motion's device-motion service splits the reading anyway, into `gravity` and `userAcceleration`, and it does so by bringing in a second sensor. The gyroscope knows how the phone turned, so a change in the reading's direction that the gyroscope didn't see must be motion.

This article builds that split from scratch, to show what the device-motion values mean and where they can still be wrong. Two estimators run on simulated motion with known truth. The first is the low-pass filter that many tutorials use. The second is a gyro-aided complementary filter, the simplest form of the fusion Core Motion performs. During a 60° tilt, the low-pass estimate of "down" lagged by up to 28.7°, while the fused one stayed within 1°. Under a sustained push, both drifted toward the wrong answer, at a rate set by a single time constant. That trade-off is predicted exactly by two short formulas, and every fused motion estimate lives with it.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS block ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The simulations reuse `SensorModel` and its illustrative parameters from the [accelerometer article](/ios-accelerometer-gyroscope/#a-model-of-a-real-sensor), and the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: imu-model -->
<!-- check-uses: sensor-random -->
```swift
import Foundation
import simd
```

## What device motion reports

`CMDeviceMotion` is Core Motion's fused output. Apple's guide to [processed device-motion data](https://developer.apple.com/documentation/coremotion/getting-processed-device-motion-data) lists what it adds over the raw sensors: "the device's attitude", "the unbiased rotation rate", "the current gravity vector", "the device-specific acceleration (without gravity)", and "the current magnetic field vector". The relation that ties the accelerometer to two of them is the one from the [previous article](/ios-accelerometer-gyroscope/#what-the-sensors-measure):

$$
\mathbf{a}_{\text{raw}} = \mathbf{g} + \mathbf{u} ,
$$

where $\mathbf{g}$ is gravity and $\mathbf{u}$ is user acceleration, both in g and in the device's frame. Apple's `CMDeviceMotion` documentation states the reason fusion is needed: "because Core Motion is able to track a device's attitude using both the gyroscope and the accelerometer, it can differentiate between gravity and user acceleration."

| Property | Meaning | Units |
| --- | --- | --- |
| `attitude` | Orientation relative to a reference frame chosen at start | quaternion, matrix, or Euler angles |
| `rotationRate` | Gyroscope rates with bias removed | rad/s, device frame |
| `gravity` | Direction and size of gravity | g, device frame, length about 1 |
| `userAcceleration` | Raw acceleration minus gravity | g, device frame |
| `magneticField` | Calibrated field, with an accuracy level | microtesla, device frame |
| `heading` | Degrees from north, only in north-referenced frames | 0 to 360, negative when invalid |
| `headingAccuracy` (iOS 27) | Maximum heading error | degrees, negative when invalid |

The next article covers `attitude` and its reference frames. This one is about `gravity` and `userAcceleration`, the two halves of the raw reading.

## A testbed with known truth

Judging an estimator needs ground truth, so the examples generate it. A scenario specifies the device's attitude and its acceleration in the world over time. From those, everything a perfect sensor would report follows: gravity is the world's $(0, 0, -1)$ g rotated into the device frame, user acceleration is the world acceleration rotated the same way, and the rotation rate comes from differencing consecutive attitudes.

```swift
/// The truth at one instant: how the device is oriented, and how it's accelerating in the world.
struct MotionTruth {
    var time: Double
    var attitude: simd_quatd          // rotates device-frame vectors into the world frame (z up)
    var rotationRate: SIMD3<Double>   // rad/s, device frame
    var worldAcceleration: SIMD3<Double>  // g, world frame, gravity excluded

    /// Gravity as the device sees it: the world's (0, 0, -1) g, expressed in the device frame.
    var gravity: SIMD3<Double> { attitude.inverse.act(SIMD3(0, 0, -1)) }
    var userAcceleration: SIMD3<Double> { attitude.inverse.act(worldAcceleration) }
    var accelerometer: SIMD3<Double> { gravity + userAcceleration }
}

/// Samples a motion at `rate` Hz, given the attitude and world acceleration as functions of time.
/// Rotation rates come from differencing consecutive attitudes, so they're exactly consistent with them.
func scenario(seconds: Double, rate: Double = 100,
              attitude: (Double) -> simd_quatd, acceleration: (Double) -> SIMD3<Double>) -> [MotionTruth] {
    let dt = 1 / rate
    return (0..<Int(seconds * rate)).map { i in
        let t = Double(i) * dt
        let q0 = attitude(t), q1 = attitude(t + dt)
        let step = q0.inverse * q1
        let omega = step.angle < 1e-12 ? SIMD3<Double>() : step.axis * (step.angle / dt)
        return MotionTruth(time: t, attitude: q0, rotationRate: omega, worldAcceleration: acceleration(t))
    }
}

let level = simd_quatd(ix: 0, iy: 0, iz: 0, r: 1)
/// Smoothly tilts the device by `degrees` about its x axis between `start` and `start + duration`.
func tilt(_ degrees: Double, start: Double, duration: Double) -> (Double) -> simd_quatd {
    { t in
        let f = min(max((t - start) / duration, 0), 1)
        let eased = f * f * (3 - 2 * f)
        return simd_quatd(angle: eased * degrees * .pi / 180, axis: SIMD3(1, 0, 0))
    }
}
let still: (Double) -> SIMD3<Double> = { _ in .zero }

let tilting = scenario(seconds: 6, attitude: tilt(60, start: 2, duration: 1), acceleration: still)
let braking = scenario(seconds: 10, attitude: { _ in level }, acceleration: { t in t >= 2 && t < 7 ? SIMD3(0, 0.3, 0) : .zero })
let walking = scenario(seconds: 10, attitude: { _ in simd_quatd(angle: .pi / 6, axis: SIMD3(1, 0, 0)) },
                       acceleration: { t in SIMD3(0, 0, 0.3 * sin(2 * .pi * 2 * t)) })
assert(abs(simd_length(tilting[0].accelerometer) - 1) < 1e-12)
```

Three scenarios cover the cases that break naive estimators:

- **Tilting**: the phone tips 60° about its x axis over one second, then holds.
- **Pushing**: a level phone accelerates forward at 0.3 g for five seconds, like a car pulling away briskly. The phone doesn't rotate at all.
- **Walking**: a phone held at 30° bounces vertically at 2 Hz with an amplitude of 0.3 g.

## Two ways to find "down"

The **low-pass** estimator treats gravity as the slow part of the accelerometer signal:

$$
\hat{\mathbf g}_k = \hat{\mathbf g}_{k-1} + \alpha\,(\mathbf a_k - \hat{\mathbf g}_{k-1}) .
$$

This is a first-order filter with time constant $\tau \approx \Delta t / \alpha$. With $\alpha = 0.02$ at 100 Hz, $\tau$ is 0.5 s. It needs nothing but the accelerometer, which is why tutorials reach for it.

The **complementary** estimator uses the gyroscope to carry the previous estimate forward. Between samples the device turns by $\boldsymbol\omega\,\Delta t$, so gravity, which is fixed in the world, turns by the opposite rotation in the device frame. Only then does the estimator nudge the result toward the accelerometer:

$$
\hat{\mathbf g}_k = R(-\boldsymbol\omega_k \Delta t)\,\hat{\mathbf g}_{k-1} + \beta\,\big(\mathbf a_k - R(-\boldsymbol\omega_k \Delta t)\,\hat{\mathbf g}_{k-1}\big) .
$$

The name comes from the frequency domain. The gyroscope path passes fast changes and the accelerometer path passes slow ones, with complementary weights, so together they pass everything once. The gyroscope is trusted over short times, where its bias hasn't had time to add up, and the accelerometer over long times, where its disturbances average out.

```swift
/// Estimates gravity by low-pass filtering the accelerometer: g ← g + α (a − g).
struct LowPassGravity {
    var alpha: Double
    var estimate: SIMD3<Double>? = nil
    mutating func update(accelerometer a: SIMD3<Double>) -> SIMD3<Double> {
        let next = estimate.map { $0 + alpha * (a - $0) } ?? a
        estimate = next
        return next
    }
}

/// Estimates gravity by rotating the previous estimate with the gyroscope, then pulling it gently toward the accelerometer.
struct ComplementaryGravity {
    var beta: Double
    var estimate: SIMD3<Double>? = nil
    mutating func update(accelerometer a: SIMD3<Double>, rotationRate omega: SIMD3<Double>, dt: Double) -> SIMD3<Double> {
        guard let previous = estimate else { estimate = a; return a }
        // The world stands still while the device turns by omega·dt, so in the device frame gravity turns the other way.
        let angle = simd_length(omega) * dt
        let rotated = angle > 0 ? simd_quatd(angle: -angle, axis: simd_normalize(omega)).act(previous) : previous
        let blended = rotated + beta * (a - rotated)
        let next = simd_normalize(blended) * simd_length(rotated)
        estimate = next
        return next
    }
}

/// The angle between two directions, in degrees.
func degrees(between a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double {
    acos(min(1, max(-1, simd_dot(simd_normalize(a), simd_normalize(b))))) * 180 / .pi
}

/// Runs both estimators over a scenario with the given sensors, returning the gravity-direction errors over time.
func compare(_ truth: [MotionTruth], accelerometer: SensorModel, gyroscope: SensorModel,
             alpha: Double, beta: Double, seed: UInt64) -> (lowPass: [Double], complementary: [Double]) {
    var random = SeededGenerator(seed: seed)
    var lowPass = LowPassGravity(alpha: alpha), complementary = ComplementaryGravity(beta: beta)
    var lowErrors: [Double] = [], compErrors: [Double] = []
    for state in truth {
        let a = accelerometer.read(state.accelerometer, at: state.time, using: &random).vector
        let w = gyroscope.read(state.rotationRate, at: state.time, using: &random).vector
        lowErrors.append(degrees(between: lowPass.update(accelerometer: a), state.gravity))
        compErrors.append(degrees(between: complementary.update(accelerometer: a, rotationRate: w, dt: 0.01), state.gravity))
    }
    return (lowErrors, compErrors)
}
```

## How they compare

Both estimators use the same constant, $\alpha = \beta = 0.02$, so they have the same 0.5 s time constant. First with perfect sensors, to isolate the algorithms, then with the noisy, biased sensor models:

```swift
func rms(_ values: ArraySlice<Double>) -> Double { (values.reduce(0) { $0 + $1 * $1 } / Double(values.count)).squareRoot() }

let perfect = SensorModel(bias: .zero, noise: 0, rate: 100)
for (name, truth) in [("tilt 60° in 1 s", tilting), ("0.3 g for 5 s", braking), ("walking, 2 Hz", walking)] {
    let ideal = compare(truth, accelerometer: perfect, gyroscope: perfect, alpha: 0.02, beta: 0.02, seed: 1)
    let real = compare(truth, accelerometer: accelerometer, gyroscope: gyroscope, alpha: 0.02, beta: 0.02, seed: 1)
    print(name, String(format: "ideal sensors: low-pass max %.2f°, complementary max %.2f° | model sensors: low-pass max %.2f° rms %.2f°, complementary max %.2f° rms %.2f°",
                       ideal.lowPass.max()!, ideal.complementary.max()!, real.lowPass.max()!, rms(real.lowPass[100...]),
                       real.complementary.max()!, rms(real.complementary[100...])))
}
```

| Scenario | Low-pass, max error | Complementary, max error | Low-pass, RMS (noisy) | Complementary, RMS (noisy) |
| --- | --- | --- | --- | --- |
| Tilt 60° in 1 s | 28.7° | 0.5° | 10.1° | 0.65° |
| Push 0.3 g for 5 s | 16.7° | 16.7° | 11.7° | 11.7° |
| Walk, 2 Hz vertical | 0.00° | 0.00° | 0.63° | 0.66° |

**Tilting** is where the gyroscope earns its place. The low-pass estimate trails the real gravity direction by up to 28.7°, because it can only follow the accelerometer at the speed its time constant allows. The complementary estimate rotates with the phone and stays within half a degree with perfect sensors, and about 1° with noisy ones. For anything that reacts to orientation, such as a level, a tilt control, or a camera horizon, the low-pass filter is visibly slow.

**Pushing** defeats both. A sustained 0.3 g push is physically indistinguishable from a tilt of $\arctan 0.3 = 16.7°$, and the gyroscope sees no rotation to contradict it. With a 0.5 s time constant, both estimators have fully converged to the wrong answer long before the 5 s push ends. The only defense is a longer time constant, which trusts the gyroscope for longer.

**Walking** surprised me until I worked through the geometry. The bounce in this scenario is purely vertical, along gravity, so it changes the size of the reading but not its direction, and neither estimator is fooled. The small errors with real sensors come from bias and noise, not from the bounce. Swaying from side to side would have been a different story.

## The one knob: the time constant

The push results suggest making $\tau$ longer. The cost is the gyroscope's bias, which the estimator now trusts for longer. Both effects can be predicted. Under a sustained horizontal acceleration $a_\perp$, the estimate relaxes toward the false tilt $\theta_\infty = \arctan(a_\perp / g)$ exponentially:

$$
\theta(t) = \theta_\infty \left(1 - e^{-t/\tau}\right).
$$

A gyro bias perpendicular to gravity, $b_\perp$, makes the gyroscope path rotate the estimate at a steady rate, and the accelerometer path pulls it back with rate $1/\tau$. They balance at a constant error

$$
\theta_{\text{bias}} \approx b_\perp\, \tau .
$$

```swift
// Sweep the complementary filter's time constant τ = dt / β, on the push and on a still phone with gyro bias.
let stillLevel = scenario(seconds: 120, attitude: { _ in level }, acceleration: still)
let perpendicularBias = simd_length(SIMD3(gyroscope.bias.x, gyroscope.bias.y, 0))
print("tau     push max   push theory   still-bias error   bias theory")
for beta in [0.02, 0.005, 0.002, 0.0005] {
    let tau = 0.01 / beta
    let push = compare(braking, accelerometer: perfect, gyroscope: perfect, alpha: beta, beta: beta, seed: 2).complementary.max()!
    let pushTheory = atan(0.3) * (1 - exp(-5 / tau)) * 180 / .pi
    let biased = compare(stillLevel, accelerometer: perfect, gyroscope: SensorModel(bias: gyroscope.bias, noise: 0, rate: 100),
                         alpha: beta, beta: beta, seed: 3).complementary.suffix(1000).max()!
    let biasTheory = perpendicularBias * tau * 180 / .pi
    print(String(format: "%5.1f s  %6.2f°     %6.2f°        %6.3f°            %6.3f°", tau, push, pushTheory, biased, biasTheory))
}
```

| $\tau$ | Push error after 5 s | Predicted | Error from gyro bias | Predicted |
| --- | --- | --- | --- | --- |
| 0.5 s | 16.70° | 16.70° | 0.063° | 0.064° |
| 2 s | 15.47° | 15.33° | 0.255° | 0.256° |
| 5 s | 10.79° | 10.56° | 0.639° | 0.641° |
| 20 s | 3.80° | 3.69° | 2.551° | 2.562° |

The simulations follow the formulas closely. The small excess in the push column has a simple cause. The filter blends vectors, not angles, and during the push the accelerometer vector has length $\sqrt{1 + 0.3^2} = 1.044$ g, so each step pulls the direction about 4% harder than the formula assumes. With $\tau$ shortened by that factor, the formula gives 15.47°, 10.82°, and 3.84°, within 0.04° of the simulation. The table is the whole trade-off. A longer time constant resists sustained accelerations but lets gyro bias tilt the estimate, and no single value of $\tau$ is good at both. Real fusion algorithms, Core Motion's included, escape the dilemma in two ways. They estimate the gyroscope's bias and subtract it, which shrinks $b_\perp$; that's the "unbiased rotation rate" in the documentation. And they adapt: when the accelerometer's magnitude is far from 1 g, the phone is clearly accelerating, and the filter can trust it less for a while.

That still leaves the fundamental limit. Any acceleration that lasts longer than the filter is willing to trust the gyroscope looks like gravity. A phone in a car accelerating steadily for 30 seconds will eventually report a tilted gravity, whatever the algorithm. Apps that care, such as dashcams or driving analytics, know from GPS when the car is accelerating, and can treat device-motion gravity with suspicion while it does.

## Using gravity and user acceleration

Once gravity is known, several useful quantities are a dot product away.

**Tilt.** The angle between the screen and the horizontal is the angle between gravity and the device's −z axis. Pitch and roll for a level indicator follow from the components, for example $\text{roll} = \operatorname{atan2}(g_x, -g_z)$ for a phone held flat.

**Vertical acceleration.** The component of user acceleration along gravity is the vertical acceleration in the world, whatever the phone's orientation in the pocket. This signal drives step detection and elevator detection:

```swift
/// Vertical user acceleration in g, positive up: the part of the user acceleration along the gravity estimate.
func verticalAcceleration(accelerometer a: SIMD3<Double>, gravity g: SIMD3<Double>) -> Double {
    let down = simd_normalize(g)
    return -simd_dot(a - g, down)
}

var walkRandom = SeededGenerator(seed: 4)
var walkFilter = ComplementaryGravity(beta: 0.002)
var vertical: [Double] = []
for state in walking {
    let a = accelerometer.read(state.accelerometer, at: state.time, using: &walkRandom).vector
    let w = gyroscope.read(state.rotationRate, at: state.time, using: &walkRandom).vector
    let g = walkFilter.update(accelerometer: a, rotationRate: w, dt: 0.01)
    vertical.append(verticalAcceleration(accelerometer: a, gravity: g))
}
// Correlate the last 8 seconds with sine and cosine at 2 Hz to measure the recovered amplitude.
let window = vertical.suffix(800)
let times = walking.suffix(800).map(\.time)
let inPhase = zip(window, times).reduce(0) { $0 + $1.0 * sin(2 * .pi * 2 * $1.1) } * 2 / 800
let quadrature = zip(window, times).reduce(0) { $0 + $1.0 * cos(2 * .pi * 2 * $1.1) } * 2 / 800
let amplitude = (inPhase * inPhase + quadrature * quadrature).squareRoot()
let offset = window.reduce(0, +) / 800
print("recovered vertical amplitude", amplitude, "g, or", amplitude * standardGravity, "m/s² (truth 0.3 g), mean", offset)
assert(abs(amplitude - 0.3) < 0.01)
```

From noisy, biased samples of a phone tilted 30°, the projection recovered the walking bounce's amplitude as 0.2998 g (2.94 m/s²), against 0.3 g of truth. The mean of 0.0036 g is the accelerometer's bias leaking into the projection. A detector that thresholds this signal should subtract a running mean rather than assume zero.

**Orientation classes.** Face up, face down, and upright are thresholds on gravity's components. A phone face down on a table has $g_z \approx +1$, which is a cheap way to silence notifications without asking for any permission.

## Receiving device motion

The device-motion stream follows the pattern from the [accelerometer article](/ios-accelerometer-gyroscope/#the-isolation-trap): a `nonisolated` handler factory, a `Sendable` sample type, and an availability check before starting. Two values need care at the boundary. `magneticField` comes with an accuracy that can be `.uncalibrated`. And `heading` is negative in arbitrary reference frames, which Apple's documentation uses "to indicate the heading is invalid". The sample turns both into optionals, so invalid values can't be read as data. iOS 27 adds `headingAccuracy`, with the same convention:

<!-- ios -->
```swift
import CoreMotion

struct DeviceMotionSample: Sendable {
    var timestamp: TimeInterval
    var attitude: simd_quatd
    var rotationRate: SIMD3<Double>
    var gravity: SIMD3<Double>
    var userAcceleration: SIMD3<Double>
    var magneticField: SIMD3<Double>?   // nil while the magnetometer is uncalibrated
    var heading: Double?               // degrees from north; nil in arbitrary frames
    var headingAccuracy: Double?       // degrees; iOS 27 and later

    init(_ motion: CMDeviceMotion) {
        timestamp = motion.timestamp
        let q = motion.attitude.quaternion
        attitude = simd_quatd(ix: q.x, iy: q.y, iz: q.z, r: q.w)
        rotationRate = SIMD3(motion.rotationRate.x, motion.rotationRate.y, motion.rotationRate.z)
        gravity = SIMD3(motion.gravity.x, motion.gravity.y, motion.gravity.z)
        userAcceleration = SIMD3(motion.userAcceleration.x, motion.userAcceleration.y, motion.userAcceleration.z)
        let field = motion.magneticField
        magneticField = field.accuracy == .uncalibrated ? nil : SIMD3(field.field.x, field.field.y, field.field.z)
        heading = motion.heading >= 0 ? motion.heading : nil
        if #available(iOS 27, *) {
            headingAccuracy = motion.headingAccuracy >= 0 ? motion.headingAccuracy : nil
        } else {
            headingAccuracy = nil
        }
    }
}

@MainActor final class DeviceMotionService {
    private let manager: CMMotionManager
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "device-motion"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    init(manager: CMMotionManager) { self.manager = manager }

    /// The best reference frame this device supports, preferring true north, then magnetic north.
    static func bestFrame() -> CMAttitudeReferenceFrame? {
        let available = CMMotionManager.availableAttitudeReferenceFrames()
        return [.xTrueNorthZVertical, .xMagneticNorthZVertical, .xArbitraryCorrectedZVertical, .xArbitraryZVertical]
            .first { available.contains($0) }
    }

    func samples(hz: Double) -> AsyncStream<DeviceMotionSample> {
        let (stream, continuation) = AsyncStream.makeStream(of: DeviceMotionSample.self, bufferingPolicy: .bufferingNewest(1))
        guard manager.isDeviceMotionAvailable, let frame = Self.bestFrame() else {
            continuation.finish()
            return stream
        }
        manager.deviceMotionUpdateInterval = 1 / hz
        manager.showsDeviceMovementDisplay = frame == .xTrueNorthZVertical || frame == .xMagneticNorthZVertical
        manager.startDeviceMotionUpdates(using: frame, to: queue, withHandler: Self.handler(continuation))
        continuation.onTermination = { [weak self] _ in Task { @MainActor in self?.manager.stopDeviceMotionUpdates() } }
        return stream
    }

    private nonisolated static func handler(_ continuation: AsyncStream<DeviceMotionSample>.Continuation) -> CMDeviceMotionHandler {
        { motion, _ in
            guard let motion else { return }
            continuation.yield(DeviceMotionSample(motion))
        }
    }
}

let motionService = DeviceMotionService(manager: CMMotionManager())
assert(DeviceMotionService.bestFrame() == nil, "the simulator supports no reference frame")
var delivered = 0
for await _ in motionService.samples(hz: 60) { delivered += 1 }
assert(delivered == 0)
```

On the simulator there's no frame to choose, so the stream finishes at once. On a device, `showsDeviceMovementDisplay` matters for the north-referenced frames. Apple's documentation says that when the device needs movement to calibrate the compass, the handler "reports the `CMErrorDeviceRequiresMovement` error once", and with this property set, the system shows its calibration display. The [heading article](/ios-heading-compass/) explains what that calibration fixes.

The handler ignores errors here for brevity. A production version should forward `CMErrorDeviceRequiresMovement` to the interface, since it means north-referenced values are unreliable until the user moves the phone.

## Summary

- The accelerometer reports gravity plus user acceleration and can't tell them apart on its own. A sustained 0.3 g push looks exactly like a 16.7° tilt.
- A low-pass filter on the accelerometer estimates gravity slowly. During a 60° tilt it lagged by up to 28.7°.
- A complementary filter rotates its estimate with the gyroscope, then corrects it gently toward the accelerometer. It tracked the same tilt within 1°.
- Its time constant $\tau$ is a trade-off with exact predictions. A push of $a_\perp$ tilts the estimate by $\arctan(a_\perp/g)(1-e^{-t/\tau})$, and gyro bias leaves a steady error of $b_\perp\tau$. Simulations matched both within 0.25°.
- Core Motion improves on this by estimating gyro bias and adapting, but any long enough acceleration still leaks into `gravity`.
- Projecting user acceleration onto gravity gives vertical acceleration in any orientation. It recovered a 0.3 g walking bounce to 0.2998 g, with a 0.004 g bias offset to subtract.
- Convert `CMDeviceMotion` to a `Sendable` value at the handler, and turn negative headings and uncalibrated fields into optionals there.

## Exercise

Make the complementary filter adaptive. When $\lvert\lvert\mathbf a\rvert - 1\rvert$ exceeds 0.05 g, multiply $\beta$ by a factor that shrinks toward zero as the excess grows, so the filter stops listening to the accelerometer while the phone is clearly accelerating. Run the push scenario again. Then add a version of the push that also tilts the phone by 10° halfway through, and measure what the adaptation costs when real rotation and acceleration happen together.

## Further reading

- [Getting processed device-motion data](https://developer.apple.com/documentation/coremotion/getting-processed-device-motion-data), Apple's guide to the fused values
- [`CMDeviceMotion`](https://developer.apple.com/documentation/coremotion/cmdevicemotion) and [`showsDeviceMovementDisplay`](https://developer.apple.com/documentation/coremotion/cmmotionmanager/showsdevicemovementdisplay)
- Robert Mahony, Tarek Hamel, and Jean-Michel Pflimlin, "Nonlinear Complementary Filters on the Special Orthogonal Group", *IEEE Transactions on Automatic Control* 53(5), 2008, [doi:10.1109/TAC.2008.923738](https://doi.org/10.1109/TAC.2008.923738), the standard reference for complementary attitude filters with bias estimation

Previous: [Accelerometer and Gyroscope Measurements](/ios-accelerometer-gyroscope/)

Next: [Attitude, Reference Frames, and Coordinate Conversion](/ios-attitude-reference-frames/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
