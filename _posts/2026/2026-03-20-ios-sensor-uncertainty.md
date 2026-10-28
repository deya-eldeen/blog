---
layout: post
hidden: true
title: "Designing Features Around Uncertainty and Accuracy"
date: "2026-03-20"
last_modified_at: "2026-03-20"
permalink: /ios-sensor-uncertainty/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Location, Probability, Sensors, Design]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Every number a sensor produces comes with an error, and most features throw the error away at the first opportunity. A distance becomes "1,234 m away" when the fixes it came from are each good to 65 m. A phone lying on a desk reports a few meters of movement every second, and a fitness app turns that into kilometers. A geofence becomes certain after a minute of fixes that all share the same multipath reflection. The fixes aren't wrong. The feature forgot that they were estimates.

This article is about keeping the uncertainty and designing with it. It measures five things on simulated data, each with a theoretical prediction:

- **Tails.** How far a receiver's errors can stray beyond its reported accuracy: 99% of fixes needed 9 times the reported value, against 3 times for a Gaussian.
- **Phantom movement.** How much movement noise invents: 31.8 km in an hour, for a phone that never moved.
- **Thresholds.** How to set a decision threshold from the costs of the two kinds of mistake.
- **Overconfidence.** Why evidence from correlated fixes turns overconfident: wrong with 99% certainty in up to 29% of runs, and in 0.2% once each fix is discounted properly.
- **Display.** How to show a number with no more precision than it has.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. They ran as a macOS command-line program on macOS 26, and again in the iOS 27.0 simulator's test bundle, though nothing here depends on the platform. The simulations use the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions), and the receiver parameters are illustrative.

<!-- check-uses: sensor-random -->
```swift
import Foundation
import simd
```

## Calibrating the accuracy you're given

The [accuracy article](/ios-location-updates-accuracy/#what-the-accuracy-radius-means) established that `horizontalAccuracy` is "the radius of uncertainty" with no stated confidence level, and showed what a radius means if errors are Gaussian. Real errors aren't. Most fixes behave, but reflections off buildings, multipath, and bad Wi-Fi matches produce a minority of fixes that are much worse than they claim. A simple model: 95% of fixes have the reported error, 5 m per axis, and 5% have 25 m.

The way to find out how a real receiver behaves is to record fixes along a path whose truth you know, and measure, for each fix, its error divided by its reported accuracy:

```swift
/// A receiver model whose reported accuracy isn't the whole story: most errors are Gaussian with the reported σ,
/// but a few fixes (multipath, reflections) are off by much more than they admit. Illustrative numbers.
struct Receiver {
    var reportedSigma = 5.0          // what horizontalAccuracy says, read as 1σ per axis
    var outlierShare = 0.05
    var outlierSigma = 25.0

    func error(using random: inout SeededGenerator) -> SIMD2<Double> {
        let sigma = Double.random(in: 0..<1, using: &random) < outlierShare ? outlierSigma : reportedSigma
        return SIMD2(random.gaussian(), random.gaussian()) * sigma
    }
}

/// For a recorded walk with known truth: the multiple of the reported accuracy that contains a given share of errors.
func calibratedMultiple(errors: [Double], reported: Double, containing share: Double) -> Double {
    errors.sorted()[Int(share * Double(errors.count - 1))] / reported
}

var random = SeededGenerator(seed: 25)
let receiver = Receiver()
let errors = (0..<20_000).map { _ in simd_length(receiver.error(using: &random)) }
for share in [0.5, 0.68, 0.95, 0.99] {
    let gaussian = (-2 * log(1 - share)).squareRoot()
    print(String(format: "%2.0f%% of fixes within %.2f × the reported accuracy (a pure Gaussian would need %.2f ×)",
                 share * 100, calibratedMultiple(errors: errors, reported: receiver.reportedSigma, containing: share), gaussian))
}
```

| Share of fixes | Multiple of reported accuracy needed | Gaussian prediction |
| --- | --- | --- |
| 50% | 1.21 | 1.18 |
| 68% | 1.57 | 1.51 |
| 95% | 3.09 | 2.45 |
| 99% | 8.97 | 3.03 |

The middle of the distribution looks Gaussian, and the tail doesn't. With only 5% of fixes misbehaving, covering 99% of errors needs almost nine times the reported accuracy. A feature that decides with the Gaussian multiple is right about 95% of the time where it believes it's right 99% of the time. The calibration table is cheap to make: an afternoon of walking a measured route, with a few thousand fixes. And it turns "the radius of uncertainty" into a number with a confidence level for *your* users' devices and environments.

## Noise invents movement

Uncertainty doesn't only blur positions. It biases quantities derived from them. The distance between two fixes is always non-negative, so noise can only add to it. For a still phone, two fixes with independent errors of $\sigma$ per axis differ by a vector with $\sigma\sqrt 2$ per axis, whose length follows a Rayleigh distribution with mean

$$
\mathbb{E}[d] = \sigma\sqrt{2} \cdot \sqrt{\pi/2} = \sigma\sqrt{\pi} .
$$

```swift
// Phantom movement: a phone lying still, fixes every second with 5 m of independent error per axis.
var still = SeededGenerator(seed: 26)
let sigma = 5.0
let fixes = (0..<3_600).map { _ in SIMD2(still.gaussian(), still.gaussian()) * sigma }
let steps = zip(fixes.dropFirst(), fixes).map { simd_distance($0, $1) }
let meanStep = steps.reduce(0, +) / Double(steps.count)
print(String(format: "still phone: mean distance between consecutive fixes %.2f m (theory σ√π = %.2f m); an hour adds up to %.1f km",
             meanStep, sigma * Double.pi.squareRoot(), steps.reduce(0, +) / 1_000))

/// Distance between two uncertain fixes: for distances much larger than σ the error is about σ√2;
/// for small distances the measured distance is biased upward, toward the Rice mean.
func distanceSpread(trueDistance d: Double, sigma: Double, using random: inout SeededGenerator) -> (mean: Double, spread: Double) {
    let samples = (0..<20_000).map { _ in
        simd_distance(SIMD2(d, 0) + SIMD2(random.gaussian(), random.gaussian()) * sigma,
                      SIMD2(random.gaussian(), random.gaussian()) * sigma)
    }
    let mean = samples.reduce(0, +) / Double(samples.count)
    let spread = (samples.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(samples.count)).squareRoot()
    return (mean, spread)
}
for d in [0.0, 5, 20, 100] {
    let r = distanceSpread(trueDistance: d, sigma: 5, using: &still)
    print(String(format: "true distance %5.0f m: measured %.1f ± %.1f m", d, r.mean, r.spread))
}
```

With 5 m of noise, a phone lying still moved 8.84 m per second on average, against the predicted 8.86 m, which adds up to **31.8 km in an hour**. Real GPS errors are correlated from second to second, which shrinks the effect (the [distance filter article](/ios-location-distance-filter-energy/#measuring-the-trade-off) measured +7% instead of +169% on a track), but the sign never changes. Noise always adds distance.

The bias fades with distance. For a true distance $d \gg \sigma$, the measured distance is about $d$, with a spread of $\sigma\sqrt 2$, 7.0 m here:

| True distance | Measured |
| --- | --- |
| 0 m | 8.9 ± 4.6 m |
| 5 m | 10.0 ± 5.1 m |
| 20 m | 21.3 ± 6.8 m |
| 100 m | 100.2 ± 7.0 m |

Below a few $\sigma$, measured distances mostly measure noise. That's why every movement feature needs a floor, whether it's a [distance filter](/ios-location-distance-filter-energy/), a minimum speed, or a [rest detector](/ios-sensor-sampling-filtering/#controlling-drift). Without one, a sedentary day accumulates kilometers.

## Thresholds from costs

A feature that acts on a probability needs a threshold, and 50% is rarely right. If acting wrongly costs $C_{\text{false}}$ and failing to act costs $C_{\text{miss}}$, acting when the probability is $p$ has expected cost $(1-p)\,C_{\text{false}}$, and not acting costs $p\,C_{\text{miss}}$. Acting is better when

$$
p > \frac{C_{\text{false}}}{C_{\text{false}} + C_{\text{miss}}} .
$$

```swift
/// Act when the probability of the event exceeds the threshold that balances the two kinds of mistake:
/// acting wrongly costs `falseAlarm`, failing to act costs `miss`.
func decisionThreshold(falseAlarm: Double, miss: Double) -> Double { falseAlarm / (falseAlarm + miss) }

print("arrival notification (a false one is mildly annoying, a missed one is costly):",
      decisionThreshold(falseAlarm: 1, miss: 4))
print("unlocking a door (a false one is very costly):", decisionThreshold(falseAlarm: 99, miss: 1))
assert(decisionThreshold(falseAlarm: 1, miss: 1) == 0.5)
```

An arrival reminder, where a false alert is a mild annoyance and a missed one defeats the feature, should fire at 20% if a miss is four times worse. An automatic door unlock should wait for 99%. The [geofencing article](/ios-region-monitoring-geofencing/#deciding-with-hysteresis) used 0.9 to enter and 0.1 to leave, a pair that encodes "notifications are expensive". The same math with different costs gives different, equally valid thresholds, and writing the costs down is how a team agrees on them.

## Evidence that isn't independent

Accumulating evidence over many fixes is the natural next step: each fix that looks "inside" should raise the belief that the user is inside. In log-odds form, each fix adds the log of its likelihood ratio:

$$
\log\frac{P(\text{inside} \mid z_{1..n})}{P(\text{outside} \mid z_{1..n})} = \log\frac{P(\text{inside})}{P(\text{outside})} + \sum_{i=1}^{n} \log\frac{p(z_i \mid \text{inside})}{p(z_i \mid \text{outside})} .
$$

The sum is correct only if the fixes are independent given the truth. GPS errors aren't. They persist for tens of seconds or minutes, so sixty fixes carry far less than sixty fixes' worth of information. The experiment puts a user 40 m from the center of a 50 m place, inside but near the edge, and feeds sixty fixes with 20 m errors into the accumulator. It counts how often the belief ends more than 99% sure the user is *outside*:

```swift
/// Accumulates evidence that the user is at a place, one fix at a time, as log odds.
/// Each fix contributes the log of its likelihood ratio, as if fixes were independent.
struct PresenceBelief {
    private(set) var logOdds: Double = 0         // prior 50%
    var weight = 1.0                             // how much one fix counts: 1 for independent fixes
    var probability: Double { 1 / (1 + exp(-logOdds)) }

    mutating func observe(distance: Double, radius: Double, sigma: Double) {
        // Likelihood of this distance if inside (centered near the place) versus outside (centered 2 radii away).
        func density(_ center: Double) -> Double { exp(-(distance - center) * (distance - center) / (2 * sigma * sigma)) }
        logOdds += weight * log(max(density(0), 1e-300) / max(density(2 * radius), 1e-300))
        logOdds = min(max(logOdds, -50), 50)
    }
}

/// A user standing 40 m from a place with a 50 m radius, for 60 fixes: honest truth "inside", but near the edge.
/// With independent errors, the evidence piles up as it should. With errors correlated over time,
/// the same rule becomes confident about whatever the current error happens to say.
func wrongConfidentShare(correlation tau: Double, discount: Bool, runs: Int, using random: inout SeededGenerator) -> Double {
    var confidentlyWrong = 0
    let phi = tau > 0 ? exp(-1 / tau) : 0
    for _ in 0..<runs {
        var belief = PresenceBelief()
        // A correlated series of length T holds about T / 2τ independent samples, so each fix is worth 1 / 2τ of one.
        if discount, tau > 0 { belief.weight = min(1, 1 / (2 * tau)) }
        var error = random.gaussian() * 20
        for _ in 0..<60 {
            belief.observe(distance: abs(40 + error), radius: 50, sigma: 20)
            error = phi * error + (1 - phi * phi).squareRoot() * 20 * random.gaussian()
        }
        if belief.probability < 0.01 { confidentlyWrong += 1 }
    }
    return Double(confidentlyWrong) / Double(runs)
}
var beliefRandom = SeededGenerator(seed: 27)
for tau in [0.0, 10, 60, 300] {
    let naive = wrongConfidentShare(correlation: tau, discount: false, runs: 2_000, using: &beliefRandom)
    let discounted = wrongConfidentShare(correlation: tau, discount: true, runs: 2_000, using: &beliefRandom)
    print(String(format: "errors correlated over %3.0f s: confidently wrong in %.1f%% of runs, %.1f%% with discounted evidence",
                 tau, naive * 100, discounted * 100))
}
```

| Error correlation time | Confidently wrong, naive sum | With each fix weighted by $1/2\tau$ |
| --- | --- | --- |
| independent | 0.0% | 0.0% |
| 10 s | 19.6% | 6.6% |
| 60 s | 26.4% | 0.2% |
| 300 s | 29.1% | 0.0% |

With independent errors, the naive sum never went wrong. With errors correlated over a minute, it ended almost certain of the wrong answer in a quarter of the runs. One persistent error, counted sixty times, looks like overwhelming evidence. The fix comes from the [altitude article's](/ios-altimeter-pressure/#absolute-altitude-and-averaging-that-doesnt-average) result that a correlated series of length $T$ holds about $T/2\tau$ independent samples. Weighting each fix by $1/2\tau$ when $\tau$ is longer than half a second brought the confidently wrong share down to 6.6%, 0.2%, and 0.0%. The correlation time has to be estimated, from the autocorrelation of a recorded still session, and erring toward a longer $\tau$ costs only speed of decision, never correctness.

## Showing what you know

The last step is the interface. A distance shown to the meter claims meter precision. The rule below rounds to the largest of 1, 5, 10, 50, 100, 500, and 1,000 m that doesn't exceed the uncertainty, says "about" whenever it rounded, and switches to an upper bound when the uncertainty is larger than the distance itself:

```swift
/// Shows a distance with no more precision than its uncertainty supports: round to the largest of
/// 1, 5, 10, 50, 100, 500, 1,000 m that doesn't exceed the uncertainty, and say "about" when rounding happened.
/// When the uncertainty is larger than the distance itself, only an upper bound is honest.
func displayDistance(_ meters: Double, uncertainty: Double) -> String {
    let steps: [Double] = [1, 5, 10, 50, 100, 500, 1_000]
    let step = steps.last { $0 <= uncertainty } ?? 1
    func format(_ value: Double) -> String {
        value < 10_000 ? "\(Int(value)) m" : String(format: "%.0f km", value / 1_000)
    }
    if uncertainty >= meters { return "within \(format((uncertainty / step).rounded(.up) * step))" }
    let rounded = (meters / step).rounded() * step
    return step > 1 ? "about \(format(rounded))" : format(rounded)
}

let examples = [(1_234.0, 3.0), (1_234, 12), (1_234, 65), (1_234, 5_411.8), (387, 40), (18, 30)]
for (meters, uncertainty) in examples {
    print(String(format: "%6.0f m ± %6.1f m → ", meters, uncertainty), displayDistance(meters, uncertainty: uncertainty))
}
assert(displayDistance(1_234, uncertainty: 3) == "1234 m" && displayDistance(18, uncertainty: 30) == "within 30 m")
```

| Distance | Uncertainty | Shown |
| --- | --- | --- |
| 1,234 m | 3 m | 1234 m |
| 1,234 m | 12 m | about 1230 m |
| 1,234 m | 65 m | about 1250 m |
| 1,234 m | 5,411.8 m (approximate location) | within 6000 m |
| 387 m | 40 m | about 390 m |
| 18 m | 30 m | within 30 m |

The approximate-location row is the one that matters most. With Precise Location off, "1,234 m away" is fiction: the [permission changes article](/ios-location-permission-changes/#what-reduced-accuracy-means) measured snapped centers 1.7 to 2.1 km from the truth. "Within 6000 m" is what the data supports. Map views do the same thing with the accuracy circle around the blue dot, and custom drawings of a user's position should too.

## Summary

- Calibrate `horizontalAccuracy` on a path with known truth. With 5% of fixes misbehaving, 99% coverage needed 8.97 times the reported value, against 3.03 times for a Gaussian.
- Noise makes still devices move. Two fixes with $\sigma$ per axis are $\sigma\sqrt\pi$ apart on average: 8.84 m per second with 5 m noise, 31.8 km in an hour. Distances under a few $\sigma$ measure mostly noise.
- Act when the probability exceeds $C_{\text{false}}/(C_{\text{false}} + C_{\text{miss}})$. Write the costs down.
- Summing evidence from correlated fixes is overconfident: 99% sure of the wrong answer in up to 29% of runs. Weighting each fix by $1/2\tau$ cut that to 0.2% or less for long correlation times.
- Display with the precision the uncertainty allows, say "about" when rounding, and show an upper bound when the uncertainty exceeds the value.

## Exercise

Turn `calibratedMultiple` into a tool. Write a function that takes a recorded route, given as fixes with timestamps and accuracies, and a ground-truth path, given as a polyline of surveyed points, and returns the calibration table: the error-to-accuracy ratio at the 50th, 68th, 95th, and 99th percentiles, split by accuracy band (under 10 m, 10 to 50 m, over 50 m). Generate a test route with the `Receiver` model, plus a band where the outlier share rises to 20%, as in a city center, and check that the tool reports the worse band.

## Further reading

- [`horizontalAccuracy`](https://developer.apple.com/documentation/corelocation/cllocation/horizontalaccuracy), the radius without a confidence level
- Sebastian Thrun, Wolfram Burgard, and Dieter Fox, *Probabilistic Robotics*, MIT Press, 2005, especially the chapters on Bayes filters and the log-odds form of occupancy updates
- David J. C. MacKay, [*Information Theory, Inference, and Learning Algorithms*](https://www.inference.org.uk/itprnn/book.pdf), Cambridge University Press, 2003, for decision theory and the cost of overconfident inference

Previous: [Distinguishing Missing Data from a Valid Zero Reading](/ios-sensor-missing-data/)

Next: [Injecting Recorded Sensor Data for Deterministic Tests](/ios-sensor-recorded-data-tests/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
