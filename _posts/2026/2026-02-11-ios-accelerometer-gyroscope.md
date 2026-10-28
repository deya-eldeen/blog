---
layout: post
hidden: true
title: "Accelerometer and Gyroscope Measurements"
date: "2026-02-11"
last_modified_at: "2026-02-11"
permalink: /ios-accelerometer-gyroscope/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Sensors, Concurrency]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Every iPhone carries a three-axis accelerometer and a three-axis gyroscope, and Core Motion will deliver their raw readings a hundred times a second without asking the user for anything. The readings look precise, with six significant digits each. The trouble starts when an app tries to turn them into something physical. Integrate the accelerometer twice to get a position, and a bias of four thousandths of a g puts the phone 70 meters away after one minute on a table. Integrate the gyroscope to get an orientation, and a bias of a fifth of a degree per second turns the phone 13 degrees in the same minute.

This article covers what the two sensors measure, how to receive their data in Swift 6 without tripping actor isolation, how to calibrate away what can be calibrated, and why the rest has to be fused away, which is the subject of the [next article](/ios-device-motion/). The simulator has no motion hardware, so the numbers about sensor behavior come from a stated sensor model run as a Monte Carlo simulation. Each simulation is checked against the closed-form result it should reproduce, and they agreed to within 2%.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The simulations use the seeded random generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions), so they print the same numbers on every run.

<!-- check-uses: sensor-random -->
```swift
import Foundation
import simd
```

## What the sensors measure

Core Motion reports both sensors in the device's own frame. The x axis points to the right edge of the screen, y toward the top edge, and z out of the screen toward the user. The axes are fixed to the device: rotate the phone and they rotate with it.

The **accelerometer** reports acceleration along each axis in units of g. Apple's `CMAcceleration` documentation defines a G as the force "exerted by the earth's gravitational field (9.81 m s−2)". The reading is the total acceleration the device experiences, which Core Motion splits into two parts: "the total acceleration of the device is equal to gravity plus the acceleration the user imparts to the device." Gravity is always there, so a phone lying still on a table reads about 1 g, pointing toward the ground. Face up, toward the ground is −z, so the reading is close to (0, 0, −1). A phone in free fall reads close to zero, because gravity and the motion cancel.

The **gyroscope** reports the rate of rotation about each axis in radians per second. The sign follows the right-hand rule: point your right thumb along the positive axis, and your fingers curl in the positive direction. A phone lying still reads close to zero on all three axes, but not exactly zero. Apple's documentation warns that raw rotation rates "may be biased by other factors such as temperature", and recommends the device-motion interface for bias-corrected rates.

The examples carry samples in a small value type of their own, which works on every platform and crosses actors freely:

<!-- imu-model -->
```swift
/// Standard gravity, the value Core Motion's "g" stands for.
let standardGravity = 9.80665

/// A 3-axis sample in the device frame: x to the right, y toward the top edge, z out of the screen.
struct MotionSample: Sendable, Equatable {
    var timestamp: TimeInterval   // seconds since boot, like CMLogItem.timestamp
    var x: Double, y: Double, z: Double
    var vector: SIMD3<Double> { SIMD3(x, y, z) }
}
```

Why convert at all, when Core Motion has `CMAccelerometerData` and `CMGyroData`? Those are Objective-C classes that aren't `Sendable`, and a sample often needs to cross from Core Motion's queue to an actor that processes it. Copying the three numbers and the timestamp into a struct at the boundary costs nothing and removes every concurrency question about the sample itself.

## A model of a real sensor

A MEMS accelerometer or gyroscope doesn't report the truth. A useful first model of each reading $m$ for a true value $a$ is

$$
m = s\,a + b + n, \qquad n \sim \mathcal{N}(0, \sigma^2),
$$

with a scale factor $s$ close to 1, a bias $b$ that changes slowly (with temperature, and from one power-on to the next), and white noise $n$ that is independent from sample to sample. Real sensors add more effects, such as axis misalignment, nonlinearity, and bias that wanders, but these three already explain most of what goes wrong.

The simulations below use these parameters. They're **illustrative**, chosen only to be plausible for consumer parts, and your device will differ. The [sampling article](/ios-sensor-sampling-filtering/) shows how to measure the noise of an actual phone with an Allan variance plot.

<!-- imu-model -->
```swift
/// A simple model of one MEMS sensor axis group: reading = scale * truth + bias + white noise.
struct SensorModel {
    var bias: SIMD3<Double>
    var scale: SIMD3<Double> = SIMD3(repeating: 1)
    var noise: Double            // standard deviation of the white noise, per sample
    var rate: Double             // samples per second

    func read(_ truth: SIMD3<Double>, at time: TimeInterval, using random: inout SeededGenerator) -> MotionSample {
        let n = SIMD3(random.gaussian(), random.gaussian(), random.gaussian()) * noise
        let v = scale * truth + bias + n
        return MotionSample(timestamp: time, x: v.x, y: v.y, z: v.z)
    }
}

// Illustrative values, in g and rad/s. Measure your own device rather than trusting these.
let accelerometer = SensorModel(bias: SIMD3(0.004, -0.006, 0.010), noise: 0.003, rate: 100)
let gyroscope = SensorModel(bias: SIMD3(0.002, -0.001, 0.003), noise: 0.002, rate: 100)
```

## Why you can't integrate your way to a position

The accelerometer measures acceleration, acceleration integrates to velocity, and velocity integrates to position. With gravity removed, it seems a phone could track its own movement. The arithmetic says otherwise, and the two error terms of the model show why.

A constant **bias** $b$ integrates into a velocity error $b\,t$ and a position error

$$
e_b(t) = \tfrac{1}{2}\, b\, t^2 .
$$

The error grows with the square of time. A bias of 0.004 g, which is 0.039 m/s², gives 70.6 m after 60 seconds.

**White noise** behaves differently, because its errors partly cancel. Sampling at intervals $\Delta t$ for a total time $t = N\Delta t$, the velocity is a sum of $N$ independent terms $n_k \Delta t$, so its standard deviation is

$$
\sigma_v(t) = \sigma \sqrt{\Delta t\, t} ,
$$

which is a random walk. The position sums the velocities, so each noise sample $n_k$ contributes with a weight equal to the number of steps remaining after it. Summing the squared weights, $\sum_{m=1}^{N} m^2 \approx N^3/3$, gives

$$
\sigma_p(t) \approx \sigma\, \Delta t^2 \sqrt{N^3/3} = \sigma \sqrt{\Delta t}\, \frac{t^{3/2}}{\sqrt{3}} .
$$

A Monte Carlo run checks both formulas. It runs 2,000 independent minutes of pure noise at 100 Hz, with $\sigma$ = 0.003 g, integrates each one, and compares the spread of the results with the prediction:

```swift
/// Integrates acceleration (m/s², gravity already removed) twice with the rectangle rule.
func integrate(_ accelerations: [Double], dt: Double) -> (velocity: Double, position: Double) {
    var v = 0.0, p = 0.0
    for a in accelerations {
        v += a * dt
        p += v * dt
    }
    return (v, p)
}

var random = SeededGenerator(seed: 5)
let dt = 1 / accelerometer.rate
let seconds = 60.0
let n = Int(seconds * accelerometer.rate)
let sigma = accelerometer.noise * standardGravity

var velocitySquares = 0.0, positionSquares = 0.0
let trials = 2_000
for _ in 0..<trials {
    let noise = (0..<n).map { _ in random.gaussian() * sigma }
    let (v, p) = integrate(noise, dt: dt)
    velocitySquares += v * v
    positionSquares += p * p
}
let velocitySpread = (velocitySquares / Double(trials)).squareRoot()
let positionSpread = (positionSquares / Double(trials)).squareRoot()
let velocityTheory = sigma * (dt * seconds).squareRoot()
let positionTheory = sigma * dt.squareRoot() * pow(seconds, 1.5) / 3.0.squareRoot()
print("noise only, 60 s: velocity", velocitySpread, "theory", velocityTheory, "position", positionSpread, "theory", positionTheory)
assert(abs(velocitySpread / velocityTheory - 1) < 0.05 && abs(positionSpread / positionTheory - 1) < 0.05)

let biasOnly = integrate(Array(repeating: 0.004 * standardGravity, count: n), dt: dt)
print("bias only, 60 s: velocity", biasOnly.velocity, "position", biasOnly.position, "theory", 0.5 * 0.004 * standardGravity * seconds * seconds)
```

| Error after 60 s | Simulated | Formula |
| --- | --- | --- |
| Velocity, noise only | 0.0228 m/s | 0.0228 m/s |
| Position, noise only | 0.786 m | 0.789 m |
| Velocity, 0.004 g bias only | 2.35 m/s | 2.35 m/s |
| Position, 0.004 g bias only | 70.6 m | 70.6 m |

The noise is the smaller problem. Its position error grows like $t^{3/2}$ and reaches 0.8 m in a minute. The bias error grows like $t^2$ and is ninety times larger. Even after calibration, a residual bias of 0.0001 g still means 1.8 m per minute. And this ignores the largest error source of all. To remove gravity, the app has to know which way is down to a fraction of a degree, since a 1° error in the gravity direction leaves $\sin 1° \approx 0.017$ g in the "user" acceleration. That's four times the bias above.

This is why phones don't do inertial navigation, and why apps that need position use GPS, with the accelerometer only filling short gaps. The [motion and location article](/ios-combining-motion-location/) builds that combination with a Kalman filter.

## Integrating rotation correctly

The gyroscope has the same problem one integration step earlier. Orientation is the integral of the rotation rate, so a bias turns into a steadily growing angle and noise into a random walk. But rotation adds a trap that acceleration doesn't have: rotations don't commute. Rotating 90° about x and then 90° about y leaves the phone in a different orientation than the same two turns in the other order. So the three rates can't be integrated as three independent angles.

The standard tool is the unit quaternion, which `simd` provides as `simd_quatd`. Each sample is a small rotation by angle $\lvert\boldsymbol\omega\rvert\,\Delta t$ about the axis $\boldsymbol\omega / \lvert\boldsymbol\omega\rvert$. Because the rates are measured in the device's own frame, each new rotation multiplies on the right:

$$
q_{k+1} = q_k \otimes \Delta q\big(\boldsymbol\omega_k \Delta t\big) .
$$

```swift
/// Integrates body-frame rotation rates into an orientation, one small rotation per sample.
func integrateRotation(_ rates: [SIMD3<Double>], dt: Double, from start: simd_quatd = simd_quatd(ix: 0, iy: 0, iz: 0, r: 1)) -> simd_quatd {
    var q = start
    for omega in rates {
        let angle = simd_length(omega) * dt
        guard angle > 0 else { continue }
        q = simd_normalize(q * simd_quatd(angle: angle, axis: simd_normalize(omega)))
    }
    return q
}

/// The angle of the rotation that takes `a` to `b`, in radians.
func angleBetween(_ a: simd_quatd, _ b: simd_quatd) -> Double {
    let d = simd_mul(a.inverse, b)
    return 2 * atan2(simd_length(d.imag), abs(d.real))
}

// Turn 90° about x, then 90° about y, each over one second at 100 Hz.
let quarter = Double.pi / 2
let aboutX = Array(repeating: SIMD3(quarter, 0, 0), count: 100)
let aboutY = Array(repeating: SIMD3(0, quarter, 0), count: 100)
let xThenY = integrateRotation(aboutX + aboutY, dt: 0.01)
let yThenX = integrateRotation(aboutY + aboutX, dt: 0.01)
let order = angleBetween(xThenY, yThenX)
print("x then y vs y then x differ by", order * 180 / .pi, "degrees")
assert(abs(order * 180 / .pi - 120) < 0.01)

// Summing the rates per axis, as if the angles were independent, loses the difference entirely.
let summed = (aboutX + aboutY).reduce(SIMD3<Double>(), +) * 0.01
assert(summed == (aboutY + aboutX).reduce(SIMD3<Double>(), +) * 0.01)
```

The two orders end 120° apart. Summing the rates per axis, as if the three angles were independent, gives the same total for both orders, so it loses a 120° difference without a trace. Any code that keeps `pitch += rate.x * dt` and `roll += rate.y * dt` is only correct while one axis moves at a time.

With the integration right, the error terms behave as they did for acceleration. A per-axis random walk with standard deviation $\sigma_\omega \sqrt{\Delta t\, t}$, combined over three axes, and a bias drift of $\lvert\mathbf b\rvert\, t$:

```swift
// A still device, gyro bias and noise only: how far does the integrated orientation wander?
var gyroRandom = SeededGenerator(seed: 6)
func stillGyro(seconds: Double, model: SensorModel, using random: inout SeededGenerator) -> [SIMD3<Double>] {
    (0..<Int(seconds * model.rate)).map { i in model.read(.zero, at: Double(i) / model.rate, using: &random).vector }
}
let noBias = SensorModel(bias: .zero, noise: gyroscope.noise, rate: gyroscope.rate)
var walkSquares = 0.0
for _ in 0..<500 {
    let q = integrateRotation(stillGyro(seconds: 60, model: noBias, using: &gyroRandom), dt: 0.01)
    let a = angleBetween(simd_quatd(ix: 0, iy: 0, iz: 0, r: 1), q)
    walkSquares += a * a
}
let angleWalk = (walkSquares / 500).squareRoot()
// Each axis random-walks with sigma * sqrt(dt * t); the total angle combines three axes.
let angleWalkTheory = gyroscope.noise * (0.01 * 60).squareRoot() * 3.0.squareRoot()
let biasDrift = angleBetween(simd_quatd(ix: 0, iy: 0, iz: 0, r: 1),
                             integrateRotation(Array(repeating: gyroscope.bias, count: 6_000), dt: 0.01))
print("60 s still: random walk", angleWalk * 180 / .pi, "deg, theory", angleWalkTheory * 180 / .pi,
      "; bias drift", biasDrift * 180 / .pi, "deg, theory", simd_length(gyroscope.bias) * 60 * 180 / .pi)
assert(abs(angleWalk / angleWalkTheory - 1) < 0.1)
```

Over 500 simulated minutes, the noise alone moved the integrated orientation by 0.151° (RMS), against 0.154° predicted. The bias of the model, 0.21°/s in total, turned the orientation by 12.86° in the same minute, as predicted. Here the noise is negligible and the bias decides everything. That's why Core Motion's device-motion interface estimates and removes gyro bias continuously, using gravity and the magnetic field as references.

## Calibrating what can be calibrated

Bias and scale factor are constant enough over a session to be measured and removed. The classic method needs nothing but a flat table: rest the device on each of its six faces. On each face, one axis sees +1 g or −1 g, and the other two see nothing. For the axis that points up and then down,

$$
m_{\text{up}} = s + b, \qquad m_{\text{down}} = -s + b
\quad\Longrightarrow\quad
b = \frac{m_{\text{up}} + m_{\text{down}}}{2}, \quad s = \frac{m_{\text{up}} - m_{\text{down}}}{2} .
$$

```swift
/// Six-position calibration: the device rests on each face, so one axis at a time sees +1 g or -1 g.
/// For each axis, (up + down) / 2 is the bias and (up - down) / 2 is the scale factor.
func sixPositionCalibration(up: SIMD3<Double>, down: SIMD3<Double>) -> (bias: SIMD3<Double>, scale: SIMD3<Double>) {
    ((up + down) / 2, (up - down) / 2)
}

let flawed = SensorModel(bias: SIMD3(0.004, -0.006, 0.010), scale: SIMD3(1.002, 0.997, 1.005), noise: 0.003, rate: 100)
var calibrationRandom = SeededGenerator(seed: 7)
/// The mean reading while the device holds still with `truth` acting on it.
func average(_ truth: SIMD3<Double>, seconds: Double, from model: SensorModel, using random: inout SeededGenerator) -> SIMD3<Double> {
    let count = Int(seconds * model.rate)
    var total = SIMD3<Double>()
    for i in 0..<count { total += model.read(truth, at: Double(i) / model.rate, using: &random).vector }
    return total / Double(count)
}
var up = SIMD3<Double>(), down = SIMD3<Double>()
for axis in 0..<3 {
    var face = SIMD3<Double>(); face[axis] = 1
    up[axis] = average(face, seconds: 10, from: flawed, using: &calibrationRandom)[axis]
    down[axis] = average(-face, seconds: 10, from: flawed, using: &calibrationRandom)[axis]
}
let calibration = sixPositionCalibration(up: up, down: down)
print("bias", calibration.bias, "scale", calibration.scale)
let biasError = simd_length(calibration.bias - flawed.bias), scaleError = simd_length(calibration.scale - flawed.scale)
assert(biasError < 0.0005 && scaleError < 0.0005)

let restingReading = average(SIMD3(0, 0, -1), seconds: 10, from: flawed, using: &calibrationRandom)
let correctedReading = (restingReading - calibration.bias) / calibration.scale
print("face-up reading", restingReading, "corrected", correctedReading, "norm", simd_length(restingReading), simd_length(correctedReading))
```

Averaging 10 seconds on each face recovered the model's bias to within 0.00013 g and its scale factors to within 0.00006. The face-up reading's magnitude went from 0.99498 g before correction to 0.99996 g after. Averaging matters: the noise of a single reading is 0.003 g, and 1,000 readings shrink it by $\sqrt{1000} \approx 32$.

Gyroscope bias is easier still. A still device should read zero, so the average of a few seconds of readings at rest is the bias, with an uncertainty of $\sigma_\omega / \sqrt{N}$. An app can take that average whenever it detects that the phone is lying still, which is also what Core Motion's fusion does internally. Bias isn't stable forever, though. It moves with temperature and changes between power cycles, so stored calibration goes stale. In practice, raw readings are for detection tasks such as shakes, taps, and step impacts, while anything that integrates should use device motion.

## Receiving samples in Swift 6

Core Motion offers two ways to receive data. Apple's documentation calls polling, where the app reads `accelerometerData` when it wants a value, "the recommended approach for apps such as games", and notes that handling data in a block "introduces additional overhead". A game already has a frame loop and needs one value per frame. The other way is pushing to an `OperationQueue` with a handler, which suits apps that react to every sample, such as a step detector or a recorder.

Both start with an update interval. The documentation says the maximum rate "is hardware-dependent but is usually at least 100 Hz", that a request above the hardware's maximum gets "the supported maximum instead", and that an app sensitive to timing "should always check the timestamps … to determine the true update interval." The timestamp is "the amount of time in seconds since the device booted", the same clock as `ProcessInfo.systemUptime`.

### The isolation trap

The handler is where Swift 6 bites. This looks like ordinary code:

<!-- ios -->
```swift
// Crashes on a device: the handler is main-actor isolated, and Core Motion calls it on `queue`
import CoreMotion

@MainActor final class TiltIndicator {
    let manager = CMMotionManager()
    var tilt = 0.0

    func start() {
        manager.startAccelerometerUpdates(to: OperationQueue()) { data, _ in
            self.tilt = data?.acceleration.x ?? 0
        }
    }
}
```

The closure is written inside a main-actor method, and Core Motion's handler type isn't `@Sendable`, so Swift infers that the closure is isolated to the main actor too. When Core Motion calls it on a background queue, Swift's runtime isolation check fails and the process stops. The compiler doesn't warn.

The simulator never calls Core Motion handlers, so this crash can't be shown there. I reproduced it with an Objective-C class that has the same shape, a method taking an `NSOperationQueue` and a non-`Sendable` block that it calls with `addOperationWithBlock:`. Called from a main-actor method compiled in Swift 6 mode, the closure stopped in `_dispatch_assert_queue_fail`, on the operation queue's thread, before its first line ran. That's the same check that stops main-actor closures in the [RxSwift schedulers article](/rxswift-schedulers/), where it was measured with a real library.

There are two fixes. Pass `.main` as the queue, which makes the main-actor closure correct. That's fine for a few updates per second, but at 100 Hz it puts every sample on the thread that draws the interface. Or build the handler outside the main actor, so it isn't isolated, and send `Sendable` values from it. The [availability article](/ios-sensor-availability/#applying-the-deadline-to-core-motion) used the second fix for the accelerometer. Here it's generalized to both sensors, along with the polling API:

<!-- ios -->
```swift
import CoreMotion

@MainActor final class RawMotion {
    private let manager: CMMotionManager
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "raw-motion"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInteractive
        return queue
    }()

    init(manager: CMMotionManager) { self.manager = manager }

    /// Pushes every accelerometer sample, in g. The stream's buffering policy decides what happens when the consumer falls behind.
    func accelerations(hz: Double, buffering: AsyncStream<MotionSample>.Continuation.BufferingPolicy = .bufferingNewest(1)) -> AsyncStream<MotionSample> {
        let (stream, continuation) = AsyncStream.makeStream(of: MotionSample.self, bufferingPolicy: buffering)
        guard manager.isAccelerometerAvailable else { continuation.finish(); return stream }
        manager.accelerometerUpdateInterval = 1 / hz
        manager.startAccelerometerUpdates(to: queue, withHandler: Self.accelerationHandler(continuation))
        continuation.onTermination = { [weak self] _ in Task { @MainActor in self?.manager.stopAccelerometerUpdates() } }
        return stream
    }

    /// Pushes every gyroscope sample, in rad/s.
    func rotationRates(hz: Double, buffering: AsyncStream<MotionSample>.Continuation.BufferingPolicy = .bufferingNewest(1)) -> AsyncStream<MotionSample> {
        let (stream, continuation) = AsyncStream.makeStream(of: MotionSample.self, bufferingPolicy: buffering)
        guard manager.isGyroAvailable else { continuation.finish(); return stream }
        manager.gyroUpdateInterval = 1 / hz
        manager.startGyroUpdates(to: queue, withHandler: Self.rotationHandler(continuation))
        continuation.onTermination = { [weak self] _ in Task { @MainActor in self?.manager.stopGyroUpdates() } }
        return stream
    }

    /// The pull model: the latest accelerometer sample, for a frame loop. Needs `startAccelerometerUpdates()` first.
    var latestAcceleration: MotionSample? {
        manager.accelerometerData.map { MotionSample(timestamp: $0.timestamp, x: $0.acceleration.x, y: $0.acceleration.y, z: $0.acceleration.z) }
    }

    private nonisolated static func accelerationHandler(_ continuation: AsyncStream<MotionSample>.Continuation) -> CMAccelerometerHandler {
        { data, _ in
            guard let data else { return }
            continuation.yield(MotionSample(timestamp: data.timestamp, x: data.acceleration.x, y: data.acceleration.y, z: data.acceleration.z))
        }
    }

    private nonisolated static func rotationHandler(_ continuation: AsyncStream<MotionSample>.Continuation) -> CMGyroHandler {
        { data, _ in
            guard let data else { return }
            continuation.yield(MotionSample(timestamp: data.timestamp, x: data.rotationRate.x, y: data.rotationRate.y, z: data.rotationRate.z))
        }
    }
}

let manager = CMMotionManager()
let raw = RawMotion(manager: manager)
manager.accelerometerUpdateInterval = 1 / 500
assert(manager.accelerometerUpdateInterval == 0.01, "the simulator caps requests at 100 Hz")
var simulatorSamples = 0
for await _ in raw.accelerations(hz: 50) { simulatorSamples += 1 }
assert(simulatorSamples == 0, "no accelerometer, so the stream finishes at once")
manager.startAccelerometerUpdates()
assert(raw.latestAcceleration == nil)
manager.stopAccelerometerUpdates()
```

On the simulator, a request for 500 Hz read back as an interval of 0.01 s, so the cap is visible even without hardware. The availability guard finished the stream immediately, so the `for await` loop ended instead of waiting forever, which is the [deadline problem](/ios-sensor-availability/#a-deadline-for-the-first-sample) handled at the source.

### When the consumer falls behind

The buffering policy is the part of the wrapper that's easiest to get wrong, because the default, `.unbounded`, never drops anything. A sensor produces samples at a fixed rate whether or not the consumer keeps up. If processing a sample takes longer than the interval between samples, an unbounded buffer grows without limit and the consumer works through older and older data. The experiment below produces 300 samples at 100 Hz into a consumer that spends 25 ms on each one, keeping up with only 40 Hz:

```swift
/// Feeds `count` samples at `rate` into a stream with the given policy, while a consumer spends `work` on each one.
/// Returns how many samples the consumer saw and the largest delay between a sample's creation and its processing.
func bufferingExperiment(_ policy: AsyncStream<MotionSample>.Continuation.BufferingPolicy,
                         rate: Double, count: Int, work: Duration) async -> (seen: Int, worstDelay: Duration) {
    let (stream, continuation) = AsyncStream.makeStream(of: MotionSample.self, bufferingPolicy: policy)
    let clock = ContinuousClock()
    let origin = clock.now
    let producer = Task.detached {
        for i in 0..<count {
            try? await clock.sleep(until: origin + .seconds(Double(i) / rate))
            continuation.yield(MotionSample(timestamp: Double(i) / rate, x: 0, y: 0, z: -1))
        }
        continuation.finish()
    }
    var seen = 0
    var worst = Duration.zero
    for await sample in stream {
        seen += 1
        worst = max(worst, (clock.now - origin) - .seconds(sample.timestamp))
        try? await clock.sleep(for: work)
    }
    await producer.value
    return (seen, worst)
}

for (name, policy) in [("unbounded", AsyncStream<MotionSample>.Continuation.BufferingPolicy.unbounded),
                       ("newest 1", .bufferingNewest(1)), ("newest 64", .bufferingNewest(64)), ("oldest 64", .bufferingOldest(64))] {
    let result = await bufferingExperiment(policy, rate: 100, count: 300, work: .milliseconds(25))
    print(name, "saw", result.seen, "of 300, worst delay", result.worstDelay)
}
```

| Policy | Samples processed | Worst age at processing |
| --- | --- | --- |
| `.unbounded` | 300 of 300 | 6.0 s |
| `.bufferingNewest(64)` | 176 | 2.0 s |
| `.bufferingOldest(64)` | 176 | 2.0 s |
| `.bufferingNewest(1)` | 113 | 0.024 s |

The unbounded stream processed everything, but by the end it was reacting to the device's position six seconds earlier. For a tilt indicator, that's the interface visibly lagging behind the hand. Both 64-sample buffers capped the lag at about two seconds, which is still too slow to drive a display. They differ in which samples they keep: `.bufferingOldest` drops the newest samples, so its data is stale as well as incomplete. `.bufferingNewest(1)` processed only the latest sample each time, and its worst lag was one processing time, 24 ms.

So pick the policy by what the consumer does with the data:

- **Display and control**, such as a level, a tilt game, or a parallax effect: `.bufferingNewest(1)`. Only the present matters.
- **Detection over a window**, such as steps, shakes, or impacts: a buffer sized to cover processing jitter, and a consumer that's fast enough on average. Dropped samples break the detector's timing, so check the timestamps for gaps.
- **Recording**: no dropping at all. Write samples to a file on Core Motion's queue, outside the async stream, and process the file later.

## Summary

- The accelerometer reports total acceleration in g, gravity plus user acceleration. The gyroscope reports rotation rate in rad/s about the device's own axes. Timestamps are seconds since boot.
- A sensor reading is roughly scale times truth, plus bias, plus white noise. Bias dominates every integrated quantity.
- Double-integrating acceleration multiplies bias by $t^2/2$: 0.004 g becomes 70.6 m in a minute. Noise adds a $t^{3/2}$ random walk of 0.8 m. The simulations matched the formulas to within 2%.
- Rotations don't commute, so integrate rotation rates with quaternions. Turning 90° about x then y ends 120° away from the opposite order. Per-axis angle sums can't tell them apart.
- Gyro bias of 0.21°/s turned a still phone 12.9° in a minute, which is why device motion corrects bias continuously.
- The six-position test recovers accelerometer bias and scale from a table and a few minutes. Averaging $N$ readings divides the noise by $\sqrt{N}$.
- In Swift 6, a handler written in a main-actor method is main-actor isolated and stops when Core Motion calls it on a background queue. Build handlers in `nonisolated` functions and send `Sendable` values.
- Choose the stream's buffering policy deliberately. An unbounded buffer behind a slow consumer fell 6 seconds behind, and `.bufferingNewest(1)` kept the lag at 24 ms.

## Exercise

Write a shake detector that consumes the `accelerations(hz:)` stream. A shake is at least three peaks in acceleration magnitude above 2 g within 800 ms, alternating in direction along the dominant axis. Test it on simulated data from `SensorModel`: a still phone, a phone carried while walking (add a 2 Hz oscillation of 0.3 g on y), and a shake (a 6 Hz oscillation of 2.5 g on x for one second). Then measure how many samples the detector can lose before it misses the shake, by dropping every second or every third sample.

## Further reading

- [Getting raw accelerometer events](https://developer.apple.com/documentation/coremotion/getting-raw-accelerometer-events) and [Getting raw gyroscope events](https://developer.apple.com/documentation/coremotion/getting-raw-gyroscope-events), Apple's guides to the pull and push interfaces
- [`CMMotionManager`](https://developer.apple.com/documentation/coremotion/cmmotionmanager), with the device axes and the advice to create one instance
- [`accelerometerUpdateInterval`](https://developer.apple.com/documentation/coremotion/cmmotionmanager/accelerometerupdateinterval), on caps and checking the true interval from timestamps
- Oliver J. Woodman, [An introduction to inertial navigation](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-696.pdf), University of Cambridge technical report UCAM-CL-TR-696 (2007), the standard short treatment of MEMS error growth

Previous: [Device Testing vs. Simulator Capabilities](/ios-sensors-simulator-vs-device/)

Next: [Device Motion, Gravity, and User Acceleration](/ios-device-motion/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
