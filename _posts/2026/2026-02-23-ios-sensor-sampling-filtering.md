---
layout: post
hidden: true
title: "Sampling Rates, Noise, Filtering, and Drift"
date: "2026-02-23"
last_modified_at: "2026-02-23"
permalink: /ios-sensor-sampling-filtering/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Sensors, Signal Processing, Accelerate]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Every sensor feature is a small signal-processing pipeline, whether or not its author thinks of it that way. A rate is chosen, samples arrive with timestamps, something smooths them, and something interprets the result. Each of those steps can quietly add a bug. A 60 Hz vibration sampled at 50 Hz turns into a 10 Hz wobble that no filter can remove afterwards. Three dropped samples cost 2.7° from an integrated angle. A smoothing filter that looks fine can add 73 ms of lag to a control. And a gyroscope bias that wanders turns a heading into a guess within minutes.

This article works through the pipeline in order: choosing a rate and the aliasing that punishes a wrong one, trusting timestamps rather than nominal intervals, choosing a filter by its measured frequency response and delay, characterizing a sensor's noise with the Allan variance, and controlling drift with rest detection. Every filter's measured gain and delay is checked against its textbook formula, and the Allan variance of a simulated gyroscope recovers its noise parameter to within 1%.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. They ran as a macOS command-line program on macOS 26, because everything here is plain Swift and Accelerate, and it applies unchanged to samples from `CMMotionManager`. Simulated signals use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions). Timings come from an optimized build, as noted where they appear.

<!-- check-uses: sensor-random -->
```swift
import Foundation
import Accelerate
```

## Choosing a rate, and aliasing

Core Motion lets an app choose an update interval, and Apple's documentation says the maximum "is hardware-dependent but is usually at least 100 Hz." Lower rates save power and work. But a sampled signal can only represent frequencies below half the sampling rate, the *Nyquist frequency* $f_s/2$. Anything faster doesn't disappear. It folds back and masquerades as a slower signal at

$$
f_{\text{alias}} = \big\lvert f - k f_s \big\rvert \quad\text{for the integer } k \text{ that brings it into } [0, f_s/2] .
$$

```swift
/// The frequency an oscillation at `f` appears at when sampled at `rate` (folding about multiples of the rate).
func aliasFrequency(of f: Double, sampledAt rate: Double) -> Double {
    let folded = f.truncatingRemainder(dividingBy: rate)
    return min(folded, rate - folded)
}

/// Finds the dominant frequency of a sampled signal by correlating it with sines and cosines on a fine grid.
func dominantFrequency(_ x: [Double], rate: Double, upTo maximum: Double) -> Double {
    var best = (frequency: 0.0, power: 0.0)
    for f in stride(from: 0.1, through: maximum, by: 0.05) {
        var c = 0.0, s = 0.0
        for (i, v) in x.enumerated() {
            let phase = 2 * .pi * f * Double(i) / rate
            c += v * cos(phase); s += v * sin(phase)
        }
        if c * c + s * s > best.power { best = (f, c * c + s * s) }
    }
    return best.frequency
}

// A motor vibrating at 60 Hz, as an accelerometer would sample it at 50 Hz and at 200 Hz.
let vibration = { (t: Double) in 0.2 * sin(2 * .pi * 60 * t) }
let at50 = (0..<500).map { vibration(Double($0) / 50) }
let at200 = (0..<2_000).map { vibration(Double($0) / 200) }
print("sampled at 50 Hz, the 60 Hz vibration appears at", dominantFrequency(at50, rate: 50, upTo: 25), "Hz; predicted", aliasFrequency(of: 60, sampledAt: 50))
print("sampled at 200 Hz it appears at", dominantFrequency(at200, rate: 200, upTo: 100), "Hz")
assert(abs(dominantFrequency(at50, rate: 50, upTo: 25) - 10) < 0.06)
```

A phone on a car's dashboard picks up engine and road vibration at tens of hertz. Sampled at 50 Hz, a 60 Hz vibration appeared as a clean 10 Hz oscillation, exactly as the formula predicts. Sampled at 200 Hz, it appeared at its true 60 Hz. The damage is permanent, because after sampling, a real 10 Hz motion and an aliased 60 Hz vibration are the same numbers. No filter applied later can separate them. Dedicated sensor chips usually filter before sampling, but the rate an app requests from Core Motion may be a decimation of the hardware's own, and nothing in the documentation promises how that decimation filters.

So choose the rate from the fastest motion that matters, not the slowest. A step detector needs the 1 to 4 Hz of gait, and 50 Hz leaves plenty of margin. A vibration or impact detector needs the full rate the hardware offers. A tilt control only needs to track hand motion, so 30 to 60 Hz is enough, provided nothing in the environment vibrates near the chosen rate.

## Trust timestamps, not the nominal interval

The interval property is a request. Apple's documentation for `accelerometerUpdateInterval` says the value "is capped to minimum and maximum values," and that an app sensitive to timing "should always check the timestamps … to determine the true update interval." Samples also arrive with jitter, and a busy queue can lose some. A gyroscope turning at a steady 90°/s for 2 seconds, sampled at 100 Hz with 1 ms of jitter and three samples lost, shows what that costs:

```swift
struct TimedSample { var time: Double; var value: Double }

// 2 s of a gyroscope turning at a steady 90°/s, nominally at 100 Hz, with 1 ms of timing jitter
// and three dropped samples, the way a busy queue loses them.
var timing = SeededGenerator(seed: 11)
var samples: [TimedSample] = []
for i in 0..<200 where ![37, 38, 121].contains(i) {
    samples.append(TimedSample(time: Double(i) * 0.01 + timing.gaussian() * 0.001, value: 90))
}

/// The interval between samples as the timestamps report it: the median, which ignores gaps.
func medianInterval(_ samples: [TimedSample]) -> Double {
    let intervals = zip(samples.dropFirst(), samples).map { $0.time - $1.time }.sorted()
    return intervals[intervals.count / 2]
}
/// Indices after which at least one sample is missing.
func gaps(in samples: [TimedSample], nominal: Double) -> [Int] {
    zip(samples.dropFirst(), samples).enumerated().filter { $0.element.0.time - $0.element.1.time > 1.5 * nominal }.map(\.offset)
}

let nominal = medianInterval(samples)
print("median interval", nominal, "gaps after samples", gaps(in: samples, nominal: nominal))

// Integrate the rate to an angle, once assuming every sample is 10 ms apart, once using the timestamps.
let byIndex = samples.reduce(0) { $0 + $1.value * 0.01 }
let byTime = zip(samples.dropFirst(), samples).reduce(0) { $0 + $1.1.value * ($1.0.time - $1.1.time) } + samples.last!.value * 0.01
let truth = 90 * (samples.last!.time + 0.01 - samples.first!.time)
print("angle by index", byIndex, "by timestamps", byTime, "truth", truth)
assert(abs(byTime - truth) < 0.01 && abs(byIndex - truth) > 2.5)
```

The median interval, 9.93 ms, ignores the gaps and recovers the true rate. Comparing each interval with 1.5 times the median found both gaps, after samples 36 and 118, one of them two samples long. Integrating with a fixed 10 ms per sample gave 177.3°. Integrating with the actual time differences gave 180.07°, which matched the truth. The three lost samples cost 2.7° because nothing noticed they were missing.

Filters such as the ones below assume uniform spacing. When the spacing isn't uniform, resample onto a uniform grid first. Linear interpolation is exact for a signal that changes linearly between samples, as the angle here does:

```swift
/// Linear resampling onto a uniform grid, so filters that assume a fixed interval see one.
func resample(_ samples: [TimedSample], every interval: Double) -> [TimedSample] {
    var output: [TimedSample] = []
    var j = 0
    var t = samples.first!.time
    while t <= samples.last!.time {
        while j + 1 < samples.count - 1 && samples[j + 1].time < t { j += 1 }
        let (a, b) = (samples[j], samples[j + 1])
        let f = (t - a.time) / (b.time - a.time)
        output.append(TimedSample(time: t, value: a.value + f * (b.value - a.value)))
        t += interval
    }
    return output
}

let ramp = samples.map { TimedSample(time: $0.time, value: 90 * $0.time) }   // the angle itself, which grows linearly
let uniform = resample(ramp, every: 0.01)
let worst = uniform.map { abs($0.value - 90 * $0.time) }.max()!
print("resampled", uniform.count, "points, worst error", worst)
assert(worst < 1e-9)
```

All 200 resampled points sat on the true line to within $3 \times 10^{-14}$. For signals with curvature, linear interpolation is a low-pass filter of its own, which is usually harmless at rates well above the signal's bandwidth.

## Three filters, measured

Every smoothing filter trades noise for lag, and the useful way to compare filters is by their frequency response: how much of a signal at each frequency gets through, and how late it comes out. Three filters cover most needs:

- The **moving average** of $N$ samples: $y_k = \frac{1}{N}\sum_{i=0}^{N-1} x_{k-i}$.
- The **exponential** filter: $y_k = y_{k-1} + \alpha(x_k - y_{k-1})$.
- A second-order **Butterworth** low-pass, built as a *biquad*, a section with two past inputs and two past outputs. Its coefficients come from the bilinear transform of the analog prototype $H(s) = \omega_c^2 / (s^2 + \sqrt 2\, \omega_c s + \omega_c^2)$.

The code measures each one by running long sines through it and reading the steady-state amplitude, and runs a slow ramp through it to measure the delay:

```swift
protocol Filter {
    mutating func process(_ x: Double) -> Double
}

struct MovingAverage: Filter {
    let length: Int
    private var buffer: [Double] = [], sum = 0.0
    init(length: Int) { self.length = length }
    mutating func process(_ x: Double) -> Double {
        buffer.append(x); sum += x
        if buffer.count > length { sum -= buffer.removeFirst() }
        return sum / Double(buffer.count)
    }
}

struct Exponential: Filter {
    let alpha: Double
    private var y: Double? = nil
    init(alpha: Double) { self.alpha = alpha }
    mutating func process(_ x: Double) -> Double {
        let next = y.map { $0 + alpha * (x - $0) } ?? x
        y = next
        return next
    }
}

/// A second-order section in direct form I. `butterworthLowPass` builds one from the bilinear transform
/// (the "Audio EQ Cookbook" formulas with Q = 1/√2).
struct Biquad: Filter {
    let b0, b1, b2, a1, a2: Double
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
    init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) { (self.b0, self.b1, self.b2, self.a1, self.a2) = (b0, b1, b2, a1, a2) }

    static func butterworthLowPass(cutoff: Double, rate: Double) -> Biquad {
        let w0 = 2 * .pi * cutoff / rate, alpha = sin(w0) / (2 * (0.5).squareRoot())
        let a0 = 1 + alpha
        return Biquad(b0: (1 - cos(w0)) / 2 / a0, b1: (1 - cos(w0)) / a0, b2: (1 - cos(w0)) / 2 / a0,
                      a1: -2 * cos(w0) / a0, a2: (1 - alpha) / a0)
    }

    mutating func process(_ x: Double) -> Double {
        let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        (x2, x1, y2, y1) = (x1, x, y1, y)
        return y
    }
}

let rate = 100.0
let filters: [(String, () -> any Filter)] = [
    ("moving average, 9", { MovingAverage(length: 9) }),
    ("exponential, α 0.12", { Exponential(alpha: 0.12) }),
    ("Butterworth, 5 Hz", { Biquad.butterworthLowPass(cutoff: 5, rate: 100) }),
]
/// Steady-state gain at a frequency, measured by running a 20 s sine through a fresh filter.
func gain(_ make: () -> any Filter, _ frequency: Double, rate: Double) -> Double {
    var filter = make()
    let n = Int(rate * 20)
    var peak = 0.0
    for i in 0..<n {
        let y = filter.process(sin(2 * .pi * frequency * Double(i) / rate))
        if i > n / 2 { peak = max(peak, abs(y)) }
    }
    return peak
}

/// How far behind a slow ramp the output runs, in seconds: the delay for slowly changing signals.
func delay(_ make: () -> any Filter, rate: Double) -> Double {
    var filter = make()
    var lag = 0.0
    for i in 0..<Int(rate * 20) {
        let x = Double(i) / rate
        lag = x - filter.process(x)
    }
    return lag
}
print("filter                 1 Hz    5 Hz    10 Hz   25 Hz   delay")
for (name, make) in filters {
    print(name.padding(toLength: 22, withPad: " ", startingAt: 0),
          [1.0, 5, 10, 25].map { String(format: "%6.3f", gain(make, $0, rate: rate)) }.joined(separator: "  "),
          String(format: "%6.1f ms", delay(make, rate: rate) * 1000))
}

// The textbook predictions for the same three filters.
let w5 = 2 * Double.pi * 5 / rate
let movingAverageGain5 = abs(sin(9 * w5 / 2) / (9 * sin(w5 / 2)))
let exponentialGain5 = 0.12 / ((1 - 0.88 * cos(w5)) * (1 - 0.88 * cos(w5)) + 0.88 * sin(w5) * 0.88 * sin(w5)).squareRoot()
assert(abs(gain(filters[0].1, 5, rate: rate) - movingAverageGain5) < 0.002)
assert(abs(gain(filters[1].1, 5, rate: rate) - exponentialGain5) < 0.002)
assert(abs(delay(filters[0].1, rate: rate) - 4 / rate) < 1e-9, "(N - 1) / 2 samples")
assert(abs(delay(filters[1].1, rate: rate) - (0.88 / 0.12) / rate) < 1e-6, "(1 - α) / α samples")
print("Butterworth delay, analog prediction:", 2.0.squareRoot() / (2 * .pi * 5) * 1000, "ms")
```

At 100 Hz, with each filter tuned to pass roughly 5 Hz:

| Filter | 1 Hz | 5 Hz | 10 Hz | 25 Hz | Delay |
| --- | --- | --- | --- | --- | --- |
| Moving average, 9 samples | 0.987 | 0.702 | 0.106 | 0.111 | 40.0 ms |
| Exponential, α = 0.12 | 0.898 | 0.377 | 0.201 | 0.068 | 73.3 ms |
| Butterworth, 5 Hz | 0.999 | 0.707 | 0.226 | 0.024 | 44.6 ms |

Each column agrees with its formula, and the assertions check the first two:

- **Moving average**: $\lvert H(f)\rvert = \left\lvert \frac{\sin(N\pi f/f_s)}{N \sin(\pi f / f_s)} \right\rvert$, 0.7015 at 5 Hz, and the delay is $(N-1)/2$ samples, 40 ms.
- **Exponential**: $\lvert H(f)\rvert = \alpha / \lvert 1 - (1-\alpha)e^{-i\omega}\rvert$, 0.378 at 5 Hz, and the delay for slow signals is $(1-\alpha)/\alpha$ samples, 73.3 ms.
- **Butterworth**: the analog prototype's delay at low frequencies is $\sqrt 2 / \omega_c$, which is 45.0 ms at 5 Hz. The digital filter measured 44.6 ms, slightly less because the bilinear transform warps frequencies.

The table explains why the Butterworth filter is worth its few extra lines. It's flat in the passband: 0.999 at 1 Hz, where the exponential filter already loses 10%. And it keeps falling past the cutoff: 0.024 at 25 Hz, where the moving average lets 11% through, from a sidelobe of its sinc-shaped response. The exponential filter is the worst of the three on both counts, with the longest delay. Its virtues are one line of code, one multiply, and no history, which makes it the right choice when the signal is far below the noise frequency and the lag doesn't matter.

Delay is the number to watch in interactive features. A tilt game with 73 ms of filter lag feels sluggish, while one with 40 ms feels direct. A rule of thumb: halving the cutoff doubles the delay, for all three filters.

### The same filter with Accelerate

For filtering recordings or long buffers, Accelerate's `vDSP.Biquad` runs the same section natively:

```swift
// The same Butterworth section through Accelerate, checked sample by sample and timed against the loop above.
let design = Biquad.butterworthLowPass(cutoff: 5, rate: 100)
var noisy = SeededGenerator(seed: 12)
let input = (0..<1_000_000).map { i in sin(2 * .pi * 2 * Double(i) / 100) + 0.3 * noisy.gaussian() }

let clock = ContinuousClock()
var handWritten = design
var start = clock.now
let ours = input.map { handWritten.process($0) }
let loopTime = clock.now - start

var accelerate = vDSP.Biquad(coefficients: [design.b0, design.b1, design.b2, design.a1, design.a2],
                             channelCount: 1, sectionCount: 1, ofType: Double.self)!
start = clock.now
let theirs = accelerate.apply(input: input)
let vDSPTime = clock.now - start

let largestDifference = zip(ours, theirs).map { abs($0 - $1) }.max()!
print("largest difference", largestDifference, "loop", loopTime, "vDSP", vDSPTime)
assert(largestDifference < 1e-9)
```

The two outputs agreed to $4 \times 10^{-15}$ over a million samples. In an optimized build, the Swift loop took about 92 ms and `vDSP.Biquad` about 1.6 ms, roughly 55 times faster. For live sensor data the difference doesn't matter: at 100 Hz, even the loop spends under 10 µs per second of data. It matters for batch work, such as filtering an hour of recorded motion on a background task.

## Characterizing noise with the Allan variance

Datasheets describe sensor noise with two numbers that an app developer can measure on any phone: the **angle random walk** $N$, which is white noise on the rate, integrated into angle, and the **rate random walk** $K$, a bias that wanders. The Allan variance separates them. Average the rate over clusters of length $\tau$, and take half the mean squared difference between neighboring clusters:

$$
\sigma_A^2(\tau) = \tfrac{1}{2} \left\langle \big(\bar\Omega_{k+1}(\tau) - \bar\Omega_k(\tau)\big)^2 \right\rangle .
$$

For a sensor with only those two noise terms, the theory gives

$$
\sigma_A^2(\tau) = \frac{N^2}{\tau} + \frac{K^2 \tau}{3} ,
$$

so on a log-log plot, white noise falls with slope −½ and the wandering bias rises with slope +½. The curve's minimum, at $\tau^* = \sqrt 3\, N / K$, is where averaging stops helping. The computation below uses the overlapping estimator, written with the integrated angle so each cluster mean is a single difference:

```swift
/// Overlapping Allan deviation of a rate signal sampled every `dt`, at averaging times m·dt.
/// Uses the integrated signal θ: σ²(τ) = Σ (θ[k+2m] − 2θ[k+m] + θ[k])² / (2 τ² (N − 2m)).
func allanDeviation(_ rate: [Double], dt: Double, clusterSizes: [Int]) -> [(tau: Double, deviation: Double)] {
    var theta = [0.0]
    theta.reserveCapacity(rate.count + 1)
    for r in rate { theta.append(theta.last! + r * dt) }
    return clusterSizes.map { m in
        let tau = Double(m) * dt
        var sum = 0.0
        let count = theta.count - 2 * m
        for k in 0..<count {
            let d = theta[k + 2 * m] - 2 * theta[k + m] + theta[k]
            sum += d * d
        }
        return (tau, (sum / (2 * tau * tau * Double(count))).squareRoot())
    }
}

// Two hours of a still gyroscope axis at 100 Hz: white noise plus a slowly wandering bias (a rate random walk).
let dt = 0.01
let whiteSigma = 0.002                       // rad/s per sample
let angleRandomWalk = whiteSigma * dt.squareRoot()   // N, in rad/√s
let rateRandomWalk = 2e-5                    // K, in rad/s/√s
var gyroRandom = SeededGenerator(seed: 13)
var bias = 0.0
var still: [Double] = []
for _ in 0..<720_000 {
    bias += rateRandomWalk * dt.squareRoot() * gyroRandom.gaussian()
    still.append(bias + whiteSigma * gyroRandom.gaussian())
}

let clusters = [1, 3, 10, 30, 100, 300, 1_000, 3_000, 10_000, 30_000, 100_000]
let curve = allanDeviation(still, dt: dt, clusterSizes: clusters)
print("    τ (s)   Allan dev (rad/s)   theory")
for point in curve {
    let theory = (angleRandomWalk * angleRandomWalk / point.tau + rateRandomWalk * rateRandomWalk * point.tau / 3).squareRoot()
    print(String(format: "%9.2f   %.3e           %.3e", point.tau, point.deviation, theory))
}
let atOneSecond = allanDeviation(still, dt: dt, clusterSizes: [100])[0].deviation
print("read off at τ = 1 s:", atOneSecond, "rad/√s; true angle random walk", angleRandomWalk)
```

| $\tau$ | Allan deviation | Theory |
| --- | --- | --- |
| 0.01 s | 1.997 × 10⁻³ | 2.000 × 10⁻³ |
| 0.1 s | 6.322 × 10⁻⁴ | 6.325 × 10⁻⁴ |
| 1 s | 1.984 × 10⁻⁴ | 2.003 × 10⁻⁴ |
| 10 s | 7.244 × 10⁻⁵ | 7.303 × 10⁻⁵ |
| 30 s | 6.964 × 10⁻⁵ | 7.303 × 10⁻⁵ |
| 100 s | 1.035 × 10⁻⁴ | 1.172 × 10⁻⁴ |
| 1,000 s | 4.509 × 10⁻⁴ | 3.652 × 10⁻⁴ |

Two hours of simulated data reproduced both slopes. Read at τ = 1 s, where the white-noise term $N/\sqrt\tau$ equals $N$, the curve gave 1.984 × 10⁻⁴ rad/√s against a true angle random walk of 2.000 × 10⁻⁴, within 1%. The minimum fell between 10 and 30 s, around the predicted $\tau^* = 17$ s. At long $\tau$ the estimate scatters, because two hours hold only a handful of 1,000-second clusters. A real measurement needs a recording several times longer than the largest $\tau$ of interest.

On a device, record a still phone's raw gyroscope for an hour or two, with the screen locked out of reach of fingers and on a surface that doesn't vibrate, then run `allanDeviation` on each axis. The value at 1 s is the angle random walk, the minimum is roughly the bias instability, and the right-hand slope says how fast the bias wanders. Those three numbers replace the illustrative parameters in the rest of this series.

## Controlling drift

A bias that wanders defeats a one-time calibration. The simulation below integrates a z-axis gyroscope into a heading for ten minutes. The phone rests for 5 seconds at the start of every minute and turns in between. Its bias starts at 0.003 rad/s and wanders with $K = 2 \times 10^{-4}$ rad/s/√s, ten times faster than in the Allan example, to make the effect visible within ten minutes. Three strategies compete:

1. Never correct the bias.
2. Estimate it once, during the first rest.
3. Re-estimate it during every rest, and hold the heading fixed while resting. This is the technique pedestrian navigation calls a *zero-velocity update*.

```swift
/// Ten minutes of heading from a z-axis gyroscope whose bias wanders. The phone rests for 5 s at the start of every
/// minute and turns at a varying rate otherwise. Returns the final heading error, in degrees, for three strategies:
/// never correct the bias, estimate it once during the first rest, or re-estimate it (and hold the heading) at every rest.
func headingErrors(seed: UInt64, initialBias: Double, wander: Double, noise: Double, dt: Double)
    -> (none: Double, once: Double, rests: Double) {
    var random = SeededGenerator(seed: seed)
    var bias = initialBias, truth = 0.0
    var none = 0.0, once = 0.0, rests = 0.0
    var onceEstimate = 0.0, restEstimate = 0.0
    var restSum = 0.0, restCount = 0
    for i in 0..<Int(600 / dt) {
        let t = Double(i) * dt
        let resting = t.truncatingRemainder(dividingBy: 60) < 5
        let turnRate = resting ? 0 : 0.3 * sin(t / 7) + 0.2 * sin(t / 3.1)
        bias += wander * dt.squareRoot() * random.gaussian()
        let reading = turnRate + bias + noise * random.gaussian()
        truth += turnRate * dt
        if resting {
            restSum += reading; restCount += 1
            if t < 5 { onceEstimate = restSum / Double(restCount) }
            restEstimate = restSum / Double(restCount)
        } else {
            restSum = 0; restCount = 0
        }
        none += reading * dt
        once += (reading - onceEstimate) * dt
        rests += resting ? 0 : (reading - restEstimate) * dt     // at rest, the heading is known not to change
    }
    let degrees = 180 / Double.pi
    return ((none - truth) * degrees, (once - truth) * degrees, (rests - truth) * degrees)
}

let single = headingErrors(seed: 14, initialBias: 0.003, wander: 2e-4, noise: whiteSigma, dt: dt)
print(String(format: "one run: no correction %.1f°, calibrated once %.1f°, re-estimated at rests %.1f°", single.none, single.once, single.rests))

var squares = (none: 0.0, once: 0.0, rests: 0.0)
let runs = 200
for seed in 0..<runs {
    let e = headingErrors(seed: UInt64(100 + seed), initialBias: 0.003, wander: 2e-4, noise: whiteSigma, dt: dt)
    squares.none += e.none * e.none; squares.once += e.once * e.once; squares.rests += e.rests * e.rests
}
let rmsError = (none: (squares.none / Double(runs)).squareRoot(), once: (squares.once / Double(runs)).squareRoot(),
                rests: (squares.rests / Double(runs)).squareRoot())
print(String(format: "RMS over %d runs: no correction %.1f°, calibrated once %.1f°, re-estimated at rests %.1f°",
             runs, rmsError.none, rmsError.once, rmsError.rests))
assert(rmsError.rests < rmsError.once && rmsError.once < rmsError.none)

// Predictions: a constant bias b gives b·T; a bias that random-walks with K gives K·T^(3/2)/√3 on top.
let fromInitial = 0.003 * 600 * 180 / .pi
let fromWander = 2e-4 * pow(600, 1.5) / 3.0.squareRoot() * 180 / .pi
print(String(format: "predicted: initial bias %.1f°, wander %.1f°, both %.1f°", fromInitial, fromWander,
             (fromInitial * fromInitial + fromWander * fromWander).squareRoot()))
```

| Strategy | One run | RMS over 200 runs | Prediction |
| --- | --- | --- | --- |
| No correction | 43.1° | 143.5° | 141.7° |
| Calibrated once | −52.4° | 93.1° | 97.2° (wander only) |
| Re-estimated at rests | −5.3° | 9.0° | |

A single run is misleading. In this one, calibrating once did *worse* than doing nothing, because the bias wandered past where it started, and the uncorrected error happened to partly cancel. Over 200 runs, the picture is clear and matches the error-growth formulas from the [accelerometer article](/ios-accelerometer-gyroscope/#integrating-rotation-correctly). A constant bias $b$ grows into $bT$, 103°. A random-walk bias adds $K T^{3/2} / \sqrt 3$, 97°, independently. Calibrating once removes only the first. Re-estimating at every rest restarts the random walk each minute, so its error grows over minutes instead of over the whole session, and it cut the RMS error by a factor of ten.

The lesson generalizes beyond gyroscopes. Any slowly wandering error, whether barometric drift or magnetometer offsets, is best controlled by finding moments when the truth is known (the phone is still, the user is on a known floor, a GPS fix arrives) and re-anchoring at each one. Detecting rest reliably is its own small problem. The usual test is a low variance of the accelerometer magnitude and a small gyroscope magnitude over a window of a second or two, and Core Motion's device-motion service does something like it internally to remove gyroscope bias.

## Summary

- Sample at least twice the fastest frequency present, not just the fastest one of interest. A 60 Hz vibration sampled at 50 Hz became a permanent 10 Hz artifact.
- Use timestamps. The median interval recovers the true rate, and intervals over 1.5 times the median reveal gaps. Three lost samples cost 2.7° from a fixed-interval integration. Resample onto a uniform grid before applying filters that assume one.
- Compare filters by frequency response and delay. At 100 Hz, a 9-sample moving average delays by 40 ms but leaks 11% at 25 Hz. An exponential filter with α = 0.12 delays by 73 ms. A 5 Hz Butterworth biquad is flat to 1 Hz, passes 2.4% at 25 Hz, and delays by 45 ms. All matched their formulas.
- `vDSP.Biquad` matched a hand-written section to $10^{-14}$ and ran about 55 times faster, which matters for recordings, not live data.
- The Allan deviation separates white noise (slope −½) from a wandering bias (slope +½). On simulated data, its value at τ = 1 s recovered the angle random walk within 1%. Measure your own device this way.
- A wandering bias defeats one-time calibration. Re-estimating at every rest cut a ten-minute heading error from 93° to 9° RMS, and re-anchoring at moments of known truth is the general cure.

## Exercise

Write a `RestDetector` that consumes accelerometer and gyroscope samples and reports rest when, over the last 1.5 seconds, the standard deviation of the accelerometer magnitude is below 0.01 g and the mean gyroscope magnitude is below 0.02 rad/s. Feed it a synthetic session built with `SensorModel` from the accelerometer article, with the phone resting, then walking, then resting again, and measure its detection delay and how often it reports rest while walking. Then replace the fixed rest schedule in `headingErrors` with the detector's output and compare the RMS heading error.

## Further reading

- [`accelerometerUpdateInterval`](https://developer.apple.com/documentation/coremotion/cmmotionmanager/accelerometerupdateinterval), on caps and checking timestamps
- [`vDSP.Biquad`](https://developer.apple.com/documentation/accelerate/vdsp/biquad), Accelerate's biquad filter
- Robert Bristow-Johnson, [Cookbook formulae for audio EQ biquad filter coefficients](https://www.w3.org/TR/audio-eq-cookbook/), published as a W3C note, the source of the low-pass coefficients above
- [IEEE Standard Specification Format Guide and Test Procedure for Single-Axis Interferometric Fiber Optic Gyros](https://doi.org/10.1109/IEEESTD.1998.86153), IEEE Std 952-1997, whose Annex C defines the Allan variance analysis used for inertial sensors

Previous: [Altitude, Pressure, and Relative Measurements](/ios-altimeter-pressure/)

Next: [Location Updates and Accuracy Requirements](/ios-location-updates-accuracy/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
