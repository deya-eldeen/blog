---
layout: post
hidden: true
title: "Timers"
date: "2026-07-27"
last_modified_at: "2026-07-27"
permalink: /combine-timers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, Timers, RunLoop, Testing]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Foundation's `Timer` gained a Combine face in iOS 13: `Timer.publish(every:on:in:)` returns a publisher that emits the current `Date` on each tick. It is the shortest way to drive a clock label, a countdown, a polling loop, or a "last updated 3 minutes ago" refresh. It is also still a `Timer`, and that means its behavior is decided by things the publisher API does not show: a run loop that has to be running, a run loop *mode* that decides whether it fires while the user scrolls, a scheduler that skips ticks rather than catching up after the main thread is blocked, and a tolerance that lets the system save power by firing late.

This article measures each of those behaviors on the main run loop: an unconnected timer that never fires, a timer in the default mode that stops while the run loop is in another mode, a blocked main thread that turns six ticks into one, and a timer on a background thread that never fires at all. It then builds a timer on the `Scheduler` protocol instead, which works on any queue and can be tested in virtual time, and uses it for a countdown.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the `VirtualTimeScheduler` and `TimelineRecorder` from [Time: `debounce`, `throttle`, and `delay`](/combine-debounce-throttle-delay/#a-scheduler-whose-clock-you-control) first, then the blocks below in order, into one `main.swift`. The timer blocks run the main run loop for short periods with this helper:

<!-- check-uses: virtual-scheduler -->

```swift
/// Runs the main run loop in `mode` for `seconds`.
func runMainLoop(for seconds: TimeInterval, mode: RunLoop.Mode = .default) {
    let end = Date(timeIntervalSinceNow: seconds)
    while Date() < end {
        _ = RunLoop.main.run(mode: mode, before: min(end, Date(timeIntervalSinceNow: 0.01)))
    }
}
```

## A timer publisher must be connected

`Timer.publish` returns a `Timer.TimerPublisher`, which is a `ConnectablePublisher`: subscribing to it does not start the timer. Calling `connect()` does, and cancelling the value `connect()` returns stops it:

```swift
var unconnectedTicks = 0
let manualTimer = Timer.publish(every: 0.05, on: .main, in: .common)
let manualHandle = manualTimer.sink { _ in unconnectedTicks += 1 }
runMainLoop(for: 0.3)
assert(unconnectedTicks == 0)                     // subscribed, but never connected

let connection = manualTimer.connect()
runMainLoop(for: 0.31)
assert((5...7).contains(unconnectedTicks))        // about one tick every 50 ms
connection.cancel()
let ticksAtStop = unconnectedTicks
runMainLoop(for: 0.2)
assert(unconnectedTicks == ticksAtStop)           // cancelling the connection stopped the timer
```

That design exists so that several subscribers can share one timer and be attached before it starts. Most code instead uses `autoconnect()`, which connects when the first subscriber arrives and disconnects when the last one leaves. Subscribers share the same timer, so a late subscriber receives the same fire dates as an early one, from the moment it joins:

```swift
var earlyDates: [Date] = []
var lateDates: [Date] = []
let sharedTimer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
let earlyHandle = sharedTimer.sink { earlyDates.append($0) }
runMainLoop(for: 0.25)
let lateHandle = sharedTimer.sink { lateDates.append($0) }
runMainLoop(for: 0.3)
assert(earlyDates.count > lateDates.count && !lateDates.isEmpty)
assert(Set(lateDates).isSubset(of: Set(earlyDates)))   // the same ticks, not a second timer

earlyHandle.cancel()
lateHandle.cancel()
let ticksWhenIdle = earlyDates.count + lateDates.count
runMainLoop(for: 0.3)
assert(earlyDates.count + lateDates.count == ticksWhenIdle)   // no subscribers, no timer

var restartedTicks = 0
let restartedHandle = sharedTimer.sink { _ in restartedTicks += 1 }
runMainLoop(for: 0.35)
assert(restartedTicks >= 2)                       // a new subscriber started it again
restartedHandle.cancel()
```

Each value is the timer's fire date, a `Date`. Use it rather than calling `Date()` in the subscriber: it is the time the tick was due, so a label updated from it does not drift by however long the run loop took to get to the timer.

## Run loop modes, and timers that stop while scrolling

A run loop runs in one *mode* at a time, and a timer fires only when the run loop is in a mode the timer was added to. On iOS, while a scroll view is being dragged, the main run loop switches from `.default` to `UITrackingRunLoopMode`; `.common` is a pseudo-mode that includes both. A timer published `in: .default` therefore pauses whenever the user touches a scroll view, which is the classic "the countdown freezes while I scroll" bug.

A command-line program has no scroll view, but it can reproduce the mechanism exactly: register a custom mode as a common mode, as UIKit does with its tracking mode, and run the main run loop in it:

```swift
let trackingMode = RunLoop.Mode("ExampleTrackingMode")
CFRunLoopAddCommonMode(CFRunLoopGetMain(), CFRunLoopMode(trackingMode.rawValue as CFString))

var defaultModeTicks = 0
var commonModeTicks = 0
let defaultModeHandle = Timer.publish(every: 0.05, on: .main, in: .default).autoconnect()
    .sink { _ in defaultModeTicks += 1 }
let commonModeHandle = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()
    .sink { _ in commonModeTicks += 1 }

runMainLoop(for: 0.5, mode: trackingMode)         // as if the user were dragging for half a second
assert(defaultModeTicks == 0)
assert(commonModeTicks >= 8)
defaultModeHandle.cancel()
commonModeHandle.cancel()
```

In half a second of "dragging", the default-mode timer fired zero times and the common-mode timer nine times. Use `in: .common` for anything the user should see ticking. The same reasoning applies to `RunLoop.main` used as a Combine scheduler, which schedules in the default mode and so delays delivery during scrolling, which is why [Schedulers: `receive(on:)` and `subscribe(on:)`](/combine-schedulers-receive-subscribe-on/) recommends `DispatchQueue.main` for UI delivery.

## Missed ticks are skipped, not replayed

A `Timer` cannot fire while its thread is busy. When the main thread is blocked for longer than an interval, the timer does not queue up the missed ticks; Apple's documentation says it "is fired only once for that time period", and the schedule then continues from the original fire dates:

```swift
var fireDates: [Date] = []
let blockedHandle = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
    .sink { fireDates.append($0) }
let measurementStart = Date()
runMainLoop(for: 0.25)
Thread.sleep(forTimeInterval: 0.55)               // the main thread is blocked
runMainLoop(for: 0.35)
blockedHandle.cancel()

let gaps = zip(fireDates.dropFirst(), fireDates).map { $0.timeIntervalSince($1) }
assert(gaps.contains { $0 > 0.5 })                // one long gap where five ticks were skipped
let tickBasedElapsed = Double(fireDates.count) * 0.1
let wallClockElapsed = fireDates.last!.timeIntervalSince(measurementStart)
assert(wallClockElapsed - tickBasedElapsed > 0.3) // counting ticks badly undercounts time
```

One run recorded six fires with gaps of 100, 602, 98, 100, and 100 ms: the block swallowed five ticks, and the sixth fire landed back on the original 100 ms grid. In general, over a wall-clock time $$W$$ with interval $$T$$ and blocking periods $$b_1, b_2, \ldots$$, the number of fires is about

$$
N \approx \frac{W}{T} - \sum_j \left\lfloor \frac{b_j}{T} \right\rfloor ,
$$

so any code that computes elapsed time as "ticks × interval" is wrong exactly when the app is under load, which is when it matters. A countdown should compute what remains from its end date, `deadline.timeIntervalSince(tick)`, and use the timer only as a prompt to recompute. Then a skipped tick costs one stale frame, not a second of drift.

## Tolerance

Every timer firing wakes the CPU. A timer's `tolerance` lets the system fire it up to that much late so it can coalesce wake-ups with other work, and Apple's `Timer` documentation recommends, "as a general rule, set the tolerance to at least 10% of the interval, for a repeating timer." `Timer.publish` takes it as a parameter:

```swift
var toleratedDates: [Date] = []
let toleranceStart = Date()
let toleranceHandle = Timer.publish(every: 0.1, tolerance: 0.05, on: .main, in: .common)
    .autoconnect()
    .sink { toleratedDates.append($0) }
runMainLoop(for: 1.05)
toleranceHandle.cancel()
let offsets = toleratedDates.map { ($0.timeIntervalSince(toleranceStart) * 1_000)
    .truncatingRemainder(dividingBy: 100) }
assert(toleratedDates.count >= 9 && offsets.allSatisfy { $0 < 50 })   // never beyond the tolerance
```

On an idle Mac, every tick in this test fired within 3 ms of its scheduled time even with 50 ms of tolerance; the system uses the allowance when it has other work to align with, which is on a device, under load, with the screen off. Tolerance never makes a timer fire early, and it does not accumulate, because each fire date is computed from the original schedule. For a clock label updated every second, a tolerance of 0.1 to 0.2 seconds is invisible to the user. For a 60 fps animation, a timer is the wrong tool; use `CADisplayLink`, or let SwiftUI's `TimelineView` drive it.

## Timers need a running run loop

`Timer.publish(every:on:in:)` takes a run loop, and the timer fires only if that run loop runs. The main run loop always runs in an app. The run loop of a GCD worker thread never does, so a timer published on `RunLoop.current` from a background queue is silently dead:

```swift
import Synchronization

final class TickCounter: Sendable {
    private let count = Mutex(0)
    var value: Int { count.withLock { $0 } }
    func increment() { count.withLock { $0 += 1 } }
}

/// Holds a value that is only ever touched on one serial queue.
final class QueueConfined<Value>: @unchecked Sendable {
    var value: Value?
}

let backgroundQueue = DispatchQueue(label: "background")
let backgroundTicks = TickCounter()
let backgroundHandle = QueueConfined<AnyCancellable>()
backgroundQueue.async {
    backgroundHandle.value = Timer.publish(every: 0.05, on: .current, in: .common).autoconnect()
        .sink { @Sendable _ in backgroundTicks.increment() }
}
Thread.sleep(forTimeInterval: 0.3)
assert(backgroundTicks.value == 0)                 // the queue's thread never runs its run loop
backgroundQueue.sync { backgroundHandle.value?.cancel() }
```

Work that should tick off the main thread, such as polling a file or sampling a sensor, does not need a run loop at all. It needs a scheduler.

## A timer on any scheduler

The `Scheduler` protocol already has a repeating operation, `schedule(after:interval:tolerance:options:_:)`, which returns a `Cancellable`. A publisher built on it works on any scheduler, including a serial `DispatchQueue` with no run loop, and, because the scheduler is a parameter, it can run on the `VirtualTimeScheduler` in tests:

```swift
extension Scheduler {
    /// Emits 0, 1, 2, ... every `interval`, starting one interval after subscription.
    /// Each subscriber gets its own timer, cancelled when the subscriber cancels.
    func ticks(every interval: SchedulerTimeType.Stride,
               tolerance: SchedulerTimeType.Stride? = nil) -> AnyPublisher<Int, Never> {
        Deferred {
            let subject = PassthroughSubject<Int, Never>()
            var count = 0
            var timer: (any Cancellable)?
            return subject.handleEvents(
                receiveSubscription: { _ in
                    timer = self.schedule(after: self.now.advanced(by: interval), interval: interval,
                                          tolerance: tolerance ?? self.minimumTolerance) {
                        subject.send(count)
                        count += 1
                    }
                },
                receiveCancel: { timer?.cancel() }
            )
        }
        .eraseToAnyPublisher()
    }
}
```

`Deferred` gives every subscriber its own subject, counter, and timer, and `handleEvents` starts the timer when the subscription is made and cancels it when the subscriber leaves. On the virtual scheduler the ticks land exactly on the second, and the scheduled work disappears when the subscriber cancels:

```swift
let clock = VirtualTimeScheduler()
let virtualTicks = TimelineRecorder(clock.ticks(every: .seconds(1)), scheduler: clock)
clock.advance(by: .milliseconds(3_500))
assert(virtualTicks.events == ["0@1000", "1@2000", "2@3000"])
assert(clock.pendingCount == 1)                    // the repeating timer
virtualTicks.cancel()
assert(clock.pendingCount == 0)                    // cancelled with the subscription
```

On a serial background queue, where `Timer` failed, it ticks:

```swift
let pollingQueue = DispatchQueue(label: "polling")
let pollTicks = TickCounter()
let pollHandle = pollingQueue.ticks(every: .milliseconds(50))
    .sink { @Sendable _ in pollTicks.increment() }
Thread.sleep(forTimeInterval: 0.33)
pollHandle.cancel()
assert((5...7).contains(pollTicks.value))
```

The `@Sendable` on the `sink` closure matters for the reason given in [Networking with `URLSession` Publishers](/combine-urlsession-publishers/): this subscriber is created in main-actor code and called on the polling queue, and without the annotation Swift 6 would insert a main-actor isolation check that crashes on the first tick.

## A countdown that survives skipped ticks

Putting the pieces together, a countdown takes its end date as input, uses ticks only as prompts, and computes the remaining time from the clock each time. With the virtual scheduler, the scheduler's own `now` is the clock:

```swift
extension Scheduler where SchedulerTimeType == DispatchQueue.SchedulerTimeType {
    /// Seconds remaining until `deadline`, emitted now and on every tick, ending at zero.
    func countdown(to deadline: SchedulerTimeType, tick: SchedulerTimeType.Stride) -> AnyPublisher<Int, Never> {
        Deferred {
            Just(0).append(self.ticks(every: tick))
                .map { _ in
                    let remaining = Double(self.now.distance(to: deadline).magnitude) / 1e9
                    return max(0, Int(remaining.rounded(.up)))
                }
                .removeDuplicates()
                .prefix(while: { $0 > 0 })
                .append(0)
        }
        .eraseToAnyPublisher()
    }
}

let countdownClock = VirtualTimeScheduler()
let deadline = countdownClock.now.advanced(by: .seconds(3))
let countdown = TimelineRecorder(countdownClock.countdown(to: deadline, tick: .milliseconds(250)),
                                 scheduler: countdownClock)
countdownClock.advance(by: .milliseconds(1_200))
countdownClock.advance(by: .milliseconds(1_500))  // a long jump stands in for a blocked thread
countdownClock.advance(by: .seconds(2))
assert(countdown.events == ["3@0", "2@1000", "1@2000", "0@3000", "|@3000"])
```

A 250 ms tick gives a responsive label without an update per frame, `removeDuplicates()` turns four ticks per second into one change per second, and computing from the deadline means the label is right after any gap. The `prefix(while:)` ends the stream at zero, which cancels the timer, and `append(0)` delivers the final zero. `distance(to:).magnitude` is used because the virtual clock's time type stores nanoseconds and `Stride` has no direct conversion to `Double`; with `Date`, `deadline.timeIntervalSince(tickDate)` does the same job.

Keep the remaining handle alive until the end of the file:

```swift
withExtendedLifetime(manualHandle) {}
```

## Summary

- `Timer.publish` returns a connectable publisher: nothing ticks until `connect()` or `autoconnect()`. An autoconnected timer is shared by its subscribers, stops when the last one cancels, and restarts for the next.
- A timer fires only in the run loop modes it was added to. Measured in a custom common mode: a `.default` timer fired 0 times and a `.common` timer 9 times in half a second. Use `.common` for anything visible while scrolling.
- A blocked thread skips ticks: blocking for 550 ms produced one 602 ms gap instead of five ticks. Compute elapsed or remaining time from dates, never from tick counts.
- Set tolerance to at least 10% of the interval; on an idle Mac, ticks stayed within 3 ms anyway.
- A `Timer` on a GCD queue's run loop never fired. A timer built on `Scheduler.schedule(after:interval:)` works on any queue and can be tested exactly in virtual time.

## Exercise

Build a `PollingClient` that fetches a status endpoint every 30 seconds using `ticks(every:)` and `flatMap(maxPublishers: .max(1))`, so a slow response never overlaps the next poll, and that pauses while a `PassthroughSubject<Bool, Never>` of "app is active" is `false`. Test it on the virtual scheduler: three polls in 90 seconds, no poll while inactive, an immediate poll when the app becomes active again, and no overlapping requests when one response takes 45 seconds. Then add a tolerance parameter and check, with a scheduler that records the tolerance it is given, that the client passes 10% of the interval.

## Further reading

- Apple's documentation for [`Timer.publish(every:tolerance:on:in:options:)`](https://developer.apple.com/documentation/foundation/timer/publish(every:tolerance:on:in:options:)) and [`Timer`](https://developer.apple.com/documentation/foundation/timer), including the sections on tolerance and run loop modes.
- Apple's [Run Loops](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Multithreading/RunLoopManagement/RunLoopManagement.html) chapter of the *Threading Programming Guide*, which explains modes and common modes.
- The site's [RunLoop](/swift-runloop/) article.

Previous: [Networking with `URLSession` Publishers](/combine-urlsession-publishers/). Next: [Key-Value Observing with Publishers](/combine-kvo-publishers/).

Return to the [Combine roadmap](/combine/).
