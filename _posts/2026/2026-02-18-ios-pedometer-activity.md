---
layout: post
hidden: true
title: "Pedometer Data and Activity Recognition"
date: "2026-02-18"
last_modified_at: "2026-02-18"
permalink: /ios-pedometer-activity/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Core Motion, Sensors, Signal Processing]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
The step count on an iPhone's lock screen widget never stopped. The motion coprocessor counts steps all day, whether or not any app is running, and Core Motion lets an app read that record for the past seven days, along with distance, floors, pace, and a classification of the user's activity. An app that wants steps doesn't need to detect them itself. It needs to ask correctly, survive the cases where the answer never comes, and interpret what comes back.

This article covers both sides. First, what a step counter does, built from scratch on a synthetic signal with known truth: a peak detector that miscounted a 563-step day by 13% until a rhythm check cut that to 5.7%, a cadence estimate from autocorrelation accurate to 0.014 steps per second, and a stride model that shows why a single calibrated stride is off by 37% at a run. Then Core Motion's own data: an `async` query that can't hang, activity reports turned into clean segments, and a "today" that is 23 hours long once a year.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. The plain Swift blocks ran as a macOS command-line program on macOS 26, and the iOS blocks ran in a unit-test bundle hosted by an app on an iPhone 17 simulator running iOS 27.0. The simulator has no motion coprocessor, so the step-detection numbers come from a synthetic signal, with its parameters stated, and the Core Motion numbers are the simulator's actual responses. The synthetic signal uses the seeded generator from the [permission changes article](/ios-location-permission-changes/#distance-from-snapped-positions).

<!-- check-uses: sensor-random -->
```swift
import Foundation
```

## What the system gives you

Core Motion splits walking data across two classes, both behind the Motion & Fitness permission from the [permissions article](/ios-sensor-permissions/#asking-for-motion--fitness):

| Class | Gives | History | Live |
| --- | --- | --- | --- |
| `CMPedometer` | Steps, distance, floors up and down, current pace and cadence, average active pace | Last 7 days | `startUpdates(from:withHandler:)`, cumulative from a start date |
| `CMPedometer` events | Pause and resume of walking | No | `startEventUpdates(handler:)` |
| `CMMotionActivityManager` | Stationary, walking, running, cycling, automotive, unknown, with a confidence | Last 7 days | `startActivityUpdates(to:withHandler:)` |

A few details from Apple's documentation shape every implementation:

- "Only the past seven days worth of data is stored." Older steps are gone, so an app that shows longer history has to save its own daily totals.
- Every optional property means what it says. `distance` "may be `nil` if distance estimation is not supported", `floorsAscended` is `nil` "when floor counting is not supported", and `currentCadence` is `nil` "when you are performing a query for historical pedometer data". Treating `nil` as zero produces a wrong number, not a missing one. The [missing data article](/ios-sensor-missing-data/) generalizes this.
- Floors are counted only "while the user was walking or running up stairs", at "approximately three meters" per floor, so elevators don't count.
- Live pedometer updates are delivered "on a background thread", on a serial queue Core Motion picks. That means the [isolation trap](/ios-accelerometer-gyroscope/#the-isolation-trap) applies here too: a handler written inside a main-actor method stops on its first call.
- For activity history, "a delay of up to several minutes in reported activities is expected."
- Activity flags "aren't mutually exclusive". A car stopped at a red light can be `automotive` and `stationary` at once.

## How a step counter works

The motion coprocessor's algorithm isn't public, but the problem it solves is, and building a simple version shows where any step counter fails.

### A signal with known truth

Walking makes the body bounce once per step, so vertical acceleration oscillates at the step rate, or *cadence*. Each heel strike adds a sharp spike. The [device motion article](/ios-device-motion/#using-gravity-and-user-acceleration) showed how to extract vertical acceleration from any phone orientation. Here a generator produces it directly, sampled at 50 Hz. It models a stroll and a walk at 1.6 and 1.8 steps per second, a run at 2.8 steps per second with a larger bounce, cadence that wanders by ±5%, and noise of 0.02 g. It also produces two kinds of motion that aren't walking: a bus swaying at 0.7 Hz, and a phone waved up and down at 2 Hz.

```swift
/// One stretch of synthetic movement. Cadence is in steps per second; amplitude is the vertical bounce in g.
struct GaitSegment {
    enum Kind: String { case still, walk, run, bus, wave }
    var kind: Kind
    var seconds: Double
    var cadence: Double = 0
    var amplitude: Double = 0
}

/// Vertical acceleration (g, gravity removed) sampled at `rate`, plus the true number of steps.
/// Walking bounces once per step, with a harmonic and a sharp heel-strike spike. Buses sway slowly, and waving the phone
/// is a smooth 2 Hz oscillation with no heel strikes.
func synthesize(_ segments: [GaitSegment], rate: Double = 50, noise: Double = 0.02, seed: UInt64)
    -> (signal: [Double], stepTimes: [Double]) {
    var random = SeededGenerator(seed: seed)
    var signal: [Double] = []
    var phase = 0.0
    var stepTimes: [Double] = []
    for segment in segments {
        for _ in 0..<Int(segment.seconds * rate) {
            var value = random.gaussian() * noise
            switch segment.kind {
            case .walk, .run:
                // Cadence wanders by ±5% so the step period isn't perfectly constant.
                let cadence = segment.cadence * (1 + 0.05 * sin(phase / 9))
                let before = phase
                phase += 2 * .pi * cadence / rate
                if floor(phase / (2 * .pi)) > floor(before / (2 * .pi)) { stepTimes.append(Double(signal.count) / rate) }
                let heel = exp(-pow((phase.truncatingRemainder(dividingBy: 2 * .pi) - 0.3) / 0.15, 2))
                value += segment.amplitude * (sin(phase) + 0.35 * sin(2 * phase + 0.7) + 0.8 * heel)
            case .bus:
                value += 0.12 * sin(Double(signal.count) / rate * 2 * .pi * 0.7) + random.gaussian() * 0.05
            case .wave:
                value += 0.6 * sin(Double(signal.count) / rate * 2 * .pi * 2)
            case .still:
                break
            }
            signal.append(value)
        }
    }
    return (signal, stepTimes)
}

let day: [GaitSegment] = [
    GaitSegment(kind: .still, seconds: 20),
    GaitSegment(kind: .walk, seconds: 120, cadence: 1.8, amplitude: 0.25),
    GaitSegment(kind: .bus, seconds: 60),
    GaitSegment(kind: .run, seconds: 90, cadence: 2.8, amplitude: 0.8),
    GaitSegment(kind: .still, seconds: 20),
    GaitSegment(kind: .wave, seconds: 15),
    GaitSegment(kind: .walk, seconds: 60, cadence: 1.6, amplitude: 0.18),
]
let synthetic = synthesize(day, seed: 8)
print("samples", synthetic.signal.count, "true steps", synthetic.stepTimes.count)
```

The synthetic day contains 563 true steps across 485 seconds, including 60 seconds of bus and 15 seconds of waving.

### Peaks, and the rhythm of peaks

A step detector looks for one peak per bounce. This one smooths the signal over 100 ms, finds local maxima, and accepts a maximum as a step when four conditions hold:

1. It's above an adaptive threshold: 40% of the recent step peaks, but never below 0.08 g.
2. The signal dipped below zero since the last step, which is hysteresis that stops one bumpy peak from counting twice.
3. At least 0.25 s has passed since the last step, so the detector never exceeds 4 steps per second.
4. The remembered peak level decays with a 2 s time constant, so a quiet walk after a run is still heard.

The decay in the last rule came from a failed first version. Without it, the threshold learned the run's large peaks and the closing 96-step stroll was missed completely.

The second stage, the rhythm gate, holds candidate steps back until four consecutive intervals are plausible (0.25 to 1 s) and consistent, varying by less than 20% around their mean. Then it commits them all, filling in the steps it held back, and keeps committing until the rhythm breaks.

```swift
/// A streaming step detector: smooth, then count peaks above an adaptive threshold that are separated by a dip
/// and by a plausible step interval.
struct StepDetector {
    let rate: Double
    var intervals: ClosedRange<Double> = 0.25...1.0   // 1 to 4 steps per second
    var floorThreshold = 0.08                          // g; quieter peaks are never steps
    private var window: [Double] = []
    private var previous = 0.0, beforePrevious = 0.0
    private var lastStep = -Double.infinity
    private var armed = true                           // set once the signal dips below zero after a step
    private var peakLevel = 0.3                        // running estimate of recent step peaks
    private var sampleIndex = 0

    init(rate: Double) { self.rate = rate }

    /// Feeds one sample and returns the time of a detected step, if this sample confirmed one.
    mutating func process(_ sample: Double) -> Double? {
        window.append(sample)
        if window.count > 5 { window.removeFirst() }
        let smoothed = window.reduce(0, +) / Double(window.count)
        defer { beforePrevious = previous; previous = smoothed; sampleIndex += 1 }
        // Without steps, the remembered peak level relaxes with a 2 s time constant, so a quiet walk after a run is still heard.
        peakLevel *= exp(-1 / (2 * rate))
        if smoothed < 0 { armed = true }
        // `previous` is a local maximum if it rose from the sample before it and the current sample is lower.
        guard previous > beforePrevious, previous >= smoothed, armed else { return nil }
        let time = Double(sampleIndex - 1) / rate
        let threshold = max(floorThreshold, 0.4 * peakLevel)
        guard previous > threshold, time - lastStep >= intervals.lowerBound else { return nil }
        peakLevel = 0.8 * peakLevel + 0.2 * previous
        lastStep = time
        armed = false
        return time
    }
}

/// Wraps a detector and only commits steps that arrive at a steady rhythm: four consecutive intervals inside the
/// plausible range that vary by less than 20%. Pending steps are back-filled once the rhythm is established.
struct RhythmGate {
    var detector: StepDetector
    var needed = 4
    private var pending: [Double] = []
    private var walking = false

    init(rate: Double) { detector = StepDetector(rate: rate) }

    mutating func process(_ sample: Double) -> [Double] {
        guard let step = detector.process(sample) else { return [] }
        if let last = pending.last ?? (walking ? lastCommitted : nil), !detector.intervals.contains(step - last) {
            pending = []; walking = false
        }
        if walking {
            lastCommitted = step
            return [step]
        }
        pending.append(step)
        guard pending.count > needed else { return [] }
        let gaps = zip(pending.dropFirst(), pending).map { $0 - $1 }.suffix(needed)
        let mean = gaps.reduce(0, +) / Double(gaps.count)
        let spread = (gaps.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(gaps.count)).squareRoot()
        guard spread / mean < 0.2 else { pending.removeFirst(); return [] }
        walking = true
        let committed = pending
        lastCommitted = committed.last!
        pending = []
        return committed
    }
    private var lastCommitted = 0.0
}

func count(_ times: [Double], in range: Range<Double>) -> Int { times.filter { range.contains($0) }.count }

var plain = StepDetector(rate: 50), gated = RhythmGate(rate: 50)
var plainSteps: [Double] = [], gatedSteps: [Double] = []
for sample in synthetic.signal {
    if let step = plain.process(sample) { plainSteps.append(step) }
    gatedSteps += gated.process(sample)
}
var start = 0.0
print("segment       truth  plain  gated")
for segment in day {
    let range = start..<(start + segment.seconds)
    print(segment.kind.rawValue.padding(toLength: 12, withPad: " ", startingAt: 0),
          String(format: "%6d %6d %6d", count(synthetic.stepTimes, in: range), count(plainSteps, in: range), count(gatedSteps, in: range)))
    start += segment.seconds
}
print("total        ", synthetic.stepTimes.count, plainSteps.count, gatedSteps.count)
```

| Segment | True steps | Peaks only | With rhythm gate |
| --- | --- | --- | --- |
| Still, 20 s | 0 | 0 | 0 |
| Walk, 1.8 steps/s | 215 | 216 | 216 |
| Bus, 60 s | 0 | 42 | 1 |
| Run, 2.8 steps/s | 252 | 252 | 252 |
| Still, 20 s | 0 | 0 | 0 |
| Waving, 2 Hz | 0 | 30 | 30 |
| Stroll, 1.6 steps/s | 96 | 96 | 96 |
| **Total** | **563** | **636 (+13%)** | **595 (+5.7%)** |

Real walking is easy: both detectors counted every walking segment to within one step. The errors are all in the motion that isn't walking. The bus sway produced 42 false steps from the peak detector, because its noisy peaks crossed the threshold at irregular times. The rhythm gate dropped all but one, because the intervals never settled. Waving the phone at 2 Hz defeated both detectors and counted 30 steps in 15 seconds. That's not a flaw in the gate. A smooth vertical oscillation at walking cadence *is* what walking looks like to a vertical-acceleration sensor. Excluding the waving, the gated count was 565 against 563.

That's the general lesson about step counters, and probably why Core Motion combines its counter with activity classification: no single-signal rule separates walking from everything rhythmic. Anything that matters, such as a step challenge with a prize, should cross-check steps against GPS movement or activity type.

### Cadence from autocorrelation

Cadence can be estimated without detecting individual steps. For a window of the signal $x$, the normalized autocorrelation at lag $\ell$ is

$$
r(\ell) = \frac{N}{N-\ell} \cdot \frac{\sum_{i=0}^{N-\ell-1} x_i\, x_{i+\ell}}{\sum_{i=0}^{N-1} x_i^2} ,
$$

with the mean removed first. A periodic signal correlates strongly with itself shifted by one period, so the lag of the largest $r$ between 0.25 s and 1 s is the step period. Fitting a parabola through that peak and its two neighbors refines the lag below one sample:

```swift
/// Cadence from the autocorrelation of a window: the lag of the strongest repeat between 0.25 s and 1 s.
/// Returns steps per second and the normalized correlation at that lag, which measures how regular the window is.
func cadence(of window: ArraySlice<Double>, rate: Double) -> (stepsPerSecond: Double, regularity: Double) {
    let mean = window.reduce(0, +) / Double(window.count)
    let x = window.map { $0 - mean }
    let energy = x.reduce(0) { $0 + $1 * $1 }
    var best = (lag: 0, value: -Double.infinity)
    for lag in Int(0.25 * rate)...Int(1.0 * rate) {
        var sum = 0.0
        for i in 0..<(x.count - lag) { sum += x[i] * x[i + lag] }
        let normalized = sum / energy * Double(x.count) / Double(x.count - lag)
        if normalized > best.value { best = (lag, normalized) }
    }
    // Refine the peak between samples with a parabola through its neighbors.
    func r(_ lag: Int) -> Double {
        var sum = 0.0
        for i in 0..<(x.count - lag) { sum += x[i] * x[i + lag] }
        return sum / energy * Double(x.count) / Double(x.count - lag)
    }
    let (a, b, c) = (r(best.lag - 1), best.value, r(best.lag + 1))
    let shift = 0.5 * (a - c) / (a - 2 * b + c)
    return (rate / (Double(best.lag) + shift), best.value)
}

let rate = 50.0
var segmentStart = 0
for segment in day {
    let n = Int(segment.seconds * rate)
    let window = synthetic.signal[(segmentStart + n / 2 - 200)..<(segmentStart + n / 2 + 200)]   // 8 s from the middle
    let (spm, regularity) = cadence(of: window, rate: rate)
    print(segment.kind.rawValue, String(format: "cadence %.3f steps/s, regularity %.2f (true %.2f)", spm, regularity, segment.cadence))
    segmentStart += n
}
```

| Segment | True cadence | Estimated | Regularity $r$ |
| --- | --- | --- | --- |
| Walk | 1.80 | 1.802 | 0.93 |
| Bus | none | (3.124) | 0.34 |
| Run | 2.80 | 2.796 | 0.95 |
| Still | none | (1.51) | 0.13 to 0.14 |
| Waving | none | (1.996) | 1.00 |
| Stroll | 1.60 | 1.586 | 0.93 |

On the walking segments, the estimates were within 0.014 steps per second of the truth, from eight-second windows of a signal whose cadence wanders by ±5%. The peak value $r$ is itself useful: it's a regularity score, high for gait and low for the bus and for standing still, so a threshold around 0.7 is a second rhythm check that needs no step detection. Waving scored a perfect 1.00. A pure sine wave is more regular than any human gait.

### From steps to distance

Distance is steps times stride length, and stride length isn't constant: people lengthen their stride as they speed up. With illustrative strides of 0.60 m at 1.6 steps per second up to 1.15 m at 2.8, calibrating a single stride on one walk misjudges every other pace:

```swift
/// Distance from steps needs a stride length. Stride grows with speed, so one calibrated stride
/// misjudges other paces. These strides and cadences are illustrative.
struct Pace { var name: String; var cadence: Double; var stride: Double }
let paces = [Pace(name: "stroll", cadence: 1.6, stride: 0.60), Pace(name: "walk", cadence: 1.8, stride: 0.72),
             Pace(name: "brisk", cadence: 2.0, stride: 0.82), Pace(name: "run", cadence: 2.8, stride: 1.15)]

// Calibrate once on a 400 m walk measured by GPS.
let calibrationSteps = 400 / paces[1].stride
let singleStride = 400 / calibrationSteps

/// Or fit stride as a straight line in cadence, through two calibrated paces.
func fittedStride(_ cadence: Double, through a: Pace, _ b: Pace) -> Double {
    a.stride + (b.stride - a.stride) / (b.cadence - a.cadence) * (cadence - a.cadence)
}

for pace in paces {
    let steps = 1_000 / pace.stride
    let single = steps * singleStride, fitted = steps * fittedStride(pace.cadence, through: paces[1], paces[2])
    print(pace.name, String(format: "1 km: single stride says %.0f m (%+.0f%%), cadence model %.0f m (%+.1f%%)",
                            single, (single / 1_000 - 1) * 100, fitted, (fitted / 1_000 - 1) * 100))
}
```

| Pace | One stride, calibrated on the walk | Stride as a line in cadence, fitted on walk and brisk |
| --- | --- | --- |
| Stroll | +20% | +3.3% |
| Walk | 0% | 0% |
| Brisk | −12% | 0% |
| Run | −37% | +6.1% |

A stride that depends on cadence, calibrated on two paces, stays within about 6% across all four. This is why Core Motion's pedometer reports distance only on devices that support it, and why GPS distance, when available, beats step-based distance outdoors. Indoors and on treadmills, steps times a cadence-dependent stride is the best available estimate.

## Activity segments

`CMMotionActivity` reports arrive when the system's classification changes, with five flags and a confidence. Displaying them directly flickers: a bus ride becomes walking for a few seconds at every jolt, and a red light makes the car "stationary". A segmenter turns reports into stable stretches. It picks one activity per report, preferring vehicles over stationary, ignores low-confidence reports, and absorbs anything shorter than a minimum duration into what came before:

```swift
/// A motion activity as Core Motion reports it: several flags can be true at once, plus a confidence.
struct ActivityReport {
    var start: Double                  // seconds since the start of the trace
    var stationary = false, walking = false, running = false, automotive = false, cycling = false
    var confidence: Int                // 0 low, 1 medium, 2 high, as in CMMotionActivityConfidence
}

enum Activity: String { case unknown, stationary, walking, running, cycling, automotive }

/// Picks one activity from a report. Vehicles win over "stationary", because a car at a red light reports both.
func primary(_ report: ActivityReport) -> Activity {
    if report.automotive { return .automotive }
    if report.cycling { return .cycling }
    if report.running { return .running }
    if report.walking { return .walking }
    if report.stationary { return .stationary }
    return .unknown
}

struct Segment: Equatable { var activity: Activity; var start: Double; var end: Double }

/// Turns reports into segments. A new activity must be reported with medium or high confidence and must last
/// `minimum` seconds before it replaces the current one; shorter flickers are absorbed into their surroundings.
func segments(from reports: [ActivityReport], until end: Double, minimum: Double) -> [Segment] {
    var raw: [Segment] = []
    for (i, report) in reports.enumerated() where report.confidence >= 1 {
        let next = reports[(i + 1)...].first(where: { $0.confidence >= 1 })?.start ?? end
        raw.append(Segment(activity: primary(report), start: report.start, end: next))
    }
    var result: [Segment] = []
    for segment in raw {
        if let last = result.last, last.activity == segment.activity {
            result[result.count - 1].end = segment.end
        } else if segment.end - segment.start < minimum, !result.isEmpty {
            result[result.count - 1].end = segment.end      // too short: extend what came before
        } else {
            result.append(segment)
        }
    }
    return result
}

// A commute: walk to the stop, a bus ride with stops, a short walk. Flickers and a low-confidence blip included.
let reports = [
    ActivityReport(start: 0, walking: true, confidence: 2),
    ActivityReport(start: 300, stationary: true, confidence: 1),
    ActivityReport(start: 420, automotive: true, confidence: 2),
    ActivityReport(start: 600, stationary: true, automotive: true, confidence: 2),    // red light
    ActivityReport(start: 640, automotive: true, confidence: 2),
    ActivityReport(start: 900, walking: true, confidence: 0),                         // bus jolts, low confidence
    ActivityReport(start: 905, automotive: true, confidence: 2),
    ActivityReport(start: 1_200, walking: true, confidence: 1),                       // 20 s flicker
    ActivityReport(start: 1_220, automotive: true, confidence: 2),
    ActivityReport(start: 1_500, walking: true, confidence: 2),
]
let naive = reports.map(primary).reduce(into: [Activity]()) { if $0.last != $1 { $0.append($1) } }
let commute = segments(from: reports, until: 1_800, minimum: 60)
print("naive changes:", naive.map(\.rawValue))
print("segments:", commute.map { "\($0.activity.rawValue) \(Int($0.start))–\(Int($0.end))" })
assert(commute.map(\.activity) == [.walking, .stationary, .automotive, .walking])
```

The synthetic commute has ten reports and seven changes of primary activity. Displayed naively, they read walking, stationary, automotive, walking, automotive, walking, automotive, walking. The segmenter produced four segments: walking 0 to 300 s, stationary 300 to 420 s (waiting at the stop), automotive 420 to 1,500 s, and walking from 1,500 s. The red light didn't break the ride, because automotive wins over stationary. The low-confidence jolt was ignored, and the 20-second walking flicker was absorbed. The minimum duration is a product decision: 60 seconds suits a commute timeline, and a workout detector might want 10.

## "Today" isn't always 24 hours

A daily step goal queries from local midnight to the next midnight. Computing that as "midnight plus 86,400 seconds" is wrong twice a year in time zones with daylight saving time:

```swift
/// "Today" for a step goal: the range from local midnight to the next local midnight, which isn't always 24 hours.
func today(containing date: Date, in timeZone: TimeZone) -> DateInterval {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let start = calendar.startOfDay(for: date)
    let end = calendar.date(byAdding: .day, value: 1, to: start)!
    return DateInterval(start: start, end: end)
}

let newYork = TimeZone(identifier: "America/New_York")!
let springForward = ISO8601DateFormatter().date(from: "2026-03-08T15:00:00Z")!
let fallBack = ISO8601DateFormatter().date(from: "2026-11-01T15:00:00Z")!
for date in [springForward, fallBack] {
    let interval = today(containing: date, in: newYork)
    print(interval.start, "lasts", interval.duration / 3600, "hours")
}
assert(today(containing: springForward, in: newYork).duration == 23 * 3600)
assert(today(containing: fallBack, in: newYork).duration == 25 * 3600)
```

In New York, 8 March 2026 lasted 23 hours and 1 November 2026 lasted 25. A query built from fixed seconds would cut an hour off the evening of the first, which is usually when people walk home, and double-count an hour of the next day on the second. `Calendar` in the user's current time zone gets it right. Travel adds a related problem: after a flight east, "today" starts earlier than it did, and a step total from the morning's time zone no longer matches the day the user is living in. Recompute the range from the current time zone each time, rather than caching it.

## Querying without hanging

The [availability article](/ios-sensor-availability/#what-happens-when-you-start-anyway) found that a pedometer query waits silently while the Motion & Fitness alert is unanswered, and fails with error 104 on a device without the hardware. A wrapper that can't hang needs a deadline and must resume its continuation exactly once, whichever comes first, the handler or the deadline. A mutex around an optional continuation does that: the first caller takes the continuation out, and the second finds nothing to resume.

The test starts with motion access undecided:

<!-- sim-setup -->
```sh
xcrun simctl privacy booted reset motion dev.swiftbydeya.Host
```

<!-- ios -->
```swift
import CoreMotion
import Synchronization

struct StepCount: Sendable, Equatable {
    var interval: DateInterval
    var steps: Int
    var distance: Double?        // meters; nil where the device can't estimate it
    var floorsAscended: Int?     // nil where the device has no floor counting
}

enum PedometerFailure: Error, Equatable {
    case unavailable, notAuthorized, timedOut
    case other(Int)

    init(_ error: any Error) {
        switch (error as NSError).code {
        case Int(CMErrorMotionActivityNotAvailable.rawValue): self = .unavailable
        case Int(CMErrorMotionActivityNotAuthorized.rawValue): self = .notAuthorized
        case let code: self = .other(code)
        }
    }
}

/// Resumes a continuation at most once, whichever caller gets there first.
final class ResumeOnce<Value: Sendable>: Sendable {
    private let continuation: Mutex<CheckedContinuation<Value, any Error>?>
    init(_ continuation: CheckedContinuation<Value, any Error>) { self.continuation = Mutex(continuation) }
    func resume(with result: Result<Value, any Error>) {
        continuation.withLock { $0.take() }?.resume(with: result)
    }
}

@MainActor final class PedometerService {
    private let pedometer = CMPedometer()

    /// Steps in `interval`, or a failure. Never waits longer than `deadline`, even while a permission alert is up.
    func stepCount(in interval: DateInterval, deadline: Duration) async throws(PedometerFailure) -> StepCount {
        do {
            return try await withCheckedThrowingContinuation { continuation in
                let once = ResumeOnce(continuation)
                pedometer.queryPedometerData(from: interval.start, to: interval.end, withHandler: Self.handler(once))
                Task {
                    try? await Task.sleep(for: deadline)
                    once.resume(with: .failure(PedometerFailure.timedOut))
                }
            }
        } catch let failure as PedometerFailure {
            throw failure
        } catch {
            throw PedometerFailure(error)
        }
    }

    /// Core Motion calls this on its own background queue, so it's built outside the main actor.
    private nonisolated static func handler(_ once: ResumeOnce<StepCount>) -> CMPedometerHandler {
        { data, error in
            if let error { return once.resume(with: .failure(PedometerFailure(error))) }
            guard let data else { return once.resume(with: .failure(PedometerFailure.other(-1))) }
            once.resume(with: .success(StepCount(
                interval: DateInterval(start: data.startDate, end: data.endDate),
                steps: data.numberOfSteps.intValue,
                distance: data.distance?.doubleValue,
                floorsAscended: data.floorsAscended?.intValue)))
        }
    }
}

let service = PedometerService()
let lastHour = DateInterval(start: Date(timeIntervalSinceNow: -3_600), end: Date())
let clock = ContinuousClock()
var started = clock.now
do {
    _ = try await service.stepCount(in: lastHour, deadline: .seconds(2))
    assertionFailure("expected a failure")
} catch {
    assert(error == .timedOut, "the permission alert is still up")
}
let waited = clock.now - started
assert(waited >= .seconds(2) && waited < .seconds(3))
```

The query showed the Motion & Fitness alert and got no answer, so the deadline fired after 2.0 s (2.005 and 2.040 s in two runs) and the call threw `.timedOut`. The handler was still held by Core Motion. If the alert is answered later, the handler runs, finds the continuation already taken, and does nothing. With the alert answered:

<!-- sim-run -->
```sh
./tap-alert.sh "Allow"
```

<!-- ios -->
```swift
started = clock.now
do {
    _ = try await service.stepCount(in: lastHour, deadline: .seconds(2))
    assertionFailure("expected a failure")
} catch {
    assert(error == .unavailable, "no motion coprocessor in the simulator")
}
let answeredIn = clock.now - started
assert(answeredIn < .seconds(1))
print("timed out after", waited, "; with permission, failed with .unavailable after", answeredIn)
```

With permission granted, the same query failed within 3 ms with `.unavailable`, error 104, which is the simulator's honest answer about a pedometer it doesn't have. On a device, it would return the last hour's steps. The function uses Swift's typed `throws(PedometerFailure)`, so callers switch over four cases instead of decoding `NSError` codes, and the mapping from Core Motion's codes lives in one initializer.

A live version follows the same shape: `startUpdates(from:withHandler:)` with a handler from a `nonisolated` factory, yielding `StepCount` values into an `AsyncThrowingStream`, with `stopUpdates()` in `onTermination`. Since each update is cumulative from the start date, the stream's consumer always holds the current total, and dropping intermediate updates with `.bufferingNewest(1)` loses nothing.

## Summary

- Core Motion keeps seven days of steps, distance, floors, and activity. Everything optional is `nil` for a reason. Activity flags can overlap, and activity reports can lag by minutes.
- Live pedometer handlers run on a background queue chosen by Core Motion. Build them outside the main actor.
- A peak detector with hysteresis, a minimum interval, and a decaying adaptive threshold counted synthetic walking and running to within one step. Motion that isn't walking is the hard part: it overcounted a 563-step day by 13%.
- Requiring a steady rhythm before counting removed 41 of 42 false steps from a swaying bus, bringing the error to 5.7%. Waving the phone at 2 Hz still counted as 30 steps. A vertical-acceleration sensor can't tell it from walking, so cross-check anything that matters.
- Autocorrelation estimated cadence within 0.014 steps per second, and its peak value is a regularity score: 0.93 to 0.95 for gait, 0.13 to 0.34 for the rest, and 1.00 for waving.
- Stride grows with pace. One calibrated stride was off by up to 37% at a run, and a stride linear in cadence by 6% or less.
- Segment activity reports by priority, confidence, and a minimum duration. A noisy commute went from seven changes to four segments.
- Compute "today" with `Calendar` in the current time zone. In New York, 8 March 2026 lasted 23 hours.
- Wrap queries in a deadline and resume exactly once. While the permission alert was up, the deadline turned a silent wait into `.timedOut` after 2.0 s.

## Exercise

Add a third stage to the step counter that rejects rhythmic motion with the wrong shape. Real steps have a heel-strike spike, so the waveform is asymmetric, and a waved phone is a smooth sine. Compute the skewness of each two-second window of the vertical signal, and only count steps in windows whose skewness exceeds a threshold you choose from the synthetic data. Report how many of the 30 waving steps it removes, and whether it costs any real steps on the stroll, whose bounce is smallest.

## Further reading

- [`CMPedometer`](https://developer.apple.com/documentation/coremotion/cmpedometer), including the seven-day limit and the threads handlers run on
- [`CMMotionActivity`](https://developer.apple.com/documentation/coremotion/cmmotionactivity), on overlapping flags and confidence
- [`queryActivityStarting(from:to:to:withHandler:)`](https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/queryactivitystarting(from:to:to:withhandler:)), with the note about delayed reports
- Neil Zhao, [Full-Featured Pedometer Design Realized with 3-Axis Digital Accelerometer](https://www.analog.com/en/resources/analog-dialogue/articles/pedometer-design-3-axis-digital-acceler.html), *Analog Dialogue* 44-06 (2010), a classic hardware-side description of peak detection with dynamic thresholds and time windows

Previous: [Attitude, Reference Frames, and Coordinate Conversion](/ios-attitude-reference-frames/)

Next: [Altitude, Pressure, and Relative Measurements](/ios-altimeter-pressure/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
