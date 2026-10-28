---
layout: post
hidden: true
title: "Testing Unavailable Hardware and Denied Permissions"
date: "2026-03-25"
last_modified_at: "2026-03-25"
permalink: /ios-sensor-testing-unavailable-denied/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, Testing, Swift Testing, XCTest, Core Location]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
The paths that matter most in a sensor app are the ones developers see least. A developer's phone has every sensor, and they tapped Allow on the first day. Users have iPads without barometers, turned Motion & Fitness off years ago, picked Allow Once, switched Precise Location off, or work under a device-management profile that restricts location entirely. Each combination needs its own screen, and most never get one on purpose: they get whatever the code happens to do.

This article tests those paths at three levels. First, a pure function from conditions to screen, checked against invariants over all 160 combinations of five conditions: the screen never dead-ends, never offers an alert that can't appear, and never shows a number it can't have. A pairwise covering of the same conditions needs only 20 cases, the theoretical minimum here. Second, a session state machine fed the exact event sequences the simulator produced when access was revoked and restored mid-run. Third, UI tests that tap the real system alert: Allow While Using App produced status 4, Don't Allow produced 2, and a relaunch after Don't Allow showed no alert at all.

<!--more-->

The package code uses Swift 6 language mode and ran with `swift test` from the Swift 6.4 toolchain in Xcode 27.1 on macOS 26. Each package file is named above its block. The UI tests ran with `xcodebuild test` on an iPhone 17 simulator running iOS 27.0, against a small app that's part of this series' test host.

## The conditions

Five independent facts decide what a run-tracking screen can do. The earlier articles measured each one:

| Condition | Values | Where it comes from |
| --- | --- | --- |
| Location access | not determined, restricted, denied, when in use, always | [Permissions](/ios-sensor-permissions/#the-location-authorization-lifecycle) |
| Precise location | on, off | [Permission changes](/ios-location-permission-changes/#what-reduced-accuracy-means) |
| Location Services switch | on, off | [Availability](/ios-sensor-availability/#when-availability-changes-at-runtime) |
| Motion & Fitness | unavailable, not determined, denied, authorized | [Permissions](/ios-sensor-permissions/#asking-for-motion--fitness) |
| Barometer | present, absent | [Availability](/ios-sensor-availability/#the-availability-apis) |

`Sources/Library/Conditions.swift`:

<!-- file: Sources/Library/Conditions.swift -->
```swift
/// Everything outside the app's control that decides what a run screen can do.
public struct Conditions: Hashable, Sendable, CustomStringConvertible {
    public enum Access: CaseIterable, Sendable { case notDetermined, restricted, denied, whenInUse, always }
    public enum Motion: CaseIterable, Sendable { case unavailable, notDetermined, denied, authorized }

    public var access: Access
    public var precise: Bool
    public var servicesEnabled: Bool
    public var motion: Motion
    public var hasBarometer: Bool

    public init(access: Access, precise: Bool, servicesEnabled: Bool, motion: Motion, hasBarometer: Bool) {
        self.access = access; self.precise = precise; self.servicesEnabled = servicesEnabled
        self.motion = motion; self.hasBarometer = hasBarometer
    }

    public var description: String { "\(access) precise:\(precise) services:\(servicesEnabled) motion:\(motion) barometer:\(hasBarometer)" }

    /// Every combination: 5 × 2 × 2 × 4 × 2 = 160.
    public static var all: [Conditions] {
        Access.allCases.flatMap { access in [true, false].flatMap { precise in [true, false].flatMap { services in
            Motion.allCases.flatMap { motion in [true, false].map { barometer in
                Conditions(access: access, precise: precise, servicesEnabled: services, motion: motion, hasBarometer: barometer)
            } } } } }
    }
}
```

The full product is 5 × 2 × 2 × 4 × 2 = 160 combinations. No manual test plan covers them, and no developer will reproduce most of them by hand. A pure function can be tested against all of them in milliseconds.

## The screen as a function

`Sources/Library/RunScreen.swift`:

<!-- file: Sources/Library/RunScreen.swift -->
```swift
/// What the run screen shows for a set of conditions. A pure function, so every combination can be tested.
public struct RunScreen: Equatable, Sendable {
    public enum Primary: Equatable, Sendable {
        case startRun                    // everything needed is available
        case askForLocation              // the alert can still be shown
        case openSettings                // the user said no; only Settings can change it
        case turnOnLocationServices      // the system switch is off
        case explainRestriction          // a profile or parental controls decide; nothing to offer
    }
    public enum Tile: Equatable, Sendable { case shown, label(String), hidden }

    public var primary: Primary
    public var routeDistance: Tile
    public var steps: Tile
    public var floors: Tile

    public init(_ c: Conditions) {
        switch (c.servicesEnabled, c.access) {
        case (false, _): primary = .turnOnLocationServices
        case (_, .notDetermined): primary = .askForLocation
        case (_, .restricted): primary = .explainRestriction
        case (_, .denied): primary = .openSettings
        case (_, .whenInUse), (_, .always): primary = .startRun
        }
        let located = c.servicesEnabled && (c.access == .whenInUse || c.access == .always)
        routeDistance = !located ? .hidden : c.precise ? .shown : .label("Turn on Precise Location for distance")
        switch c.motion {
        case .unavailable: steps = .hidden
        case .notDetermined: steps = .label("Allow Motion & Fitness to count steps")
        case .denied: steps = .label("Motion & Fitness is off in Settings")
        case .authorized: steps = .shown
        }
        floors = c.motion == .authorized && c.hasBarometer ? .shown : .hidden
    }
}
```

Each decision is one line, and each line encodes a measured fact. The Location Services switch wins over everything, because with it off, every app reads as denied. "Not determined" is the only state in which asking can show an alert. Approximate location gets a label instead of a distance, because snapped positions [can't measure distance](/ios-location-permission-changes/#distance-from-snapped-positions). Unavailable motion hides the steps tile, rather than showing a zero that [means something else](/ios-sensor-missing-data/#saying-why).

## Invariants over every combination

Swift Testing runs a parameterized test once per argument, so each invariant is a single test over all 160 conditions:

`Tests/LibraryTests/RunScreenTests.swift`:

<!-- file: Tests/LibraryTests/RunScreenTests.swift -->
```swift
import Testing
@testable import Library

@Suite struct RunScreenInvariants {
    @Test(arguments: Conditions.all)
    func neverADeadEnd(_ c: Conditions) {
        let screen = RunScreen(c)
        // If running is impossible, the screen must say why or offer the way to fix it.
        if screen.primary != .startRun {
            #expect([.askForLocation, .openSettings, .turnOnLocationServices, .explainRestriction].contains(screen.primary))
        }
    }

    @Test(arguments: Conditions.all)
    func neverAsksWhenTheAlertCantAppear(_ c: Conditions) {
        if c.access == .denied || c.access == .restricted || !c.servicesEnabled {
            #expect(RunScreen(c).primary != .askForLocation)
        }
    }

    @Test(arguments: Conditions.all)
    func neverShowsNumbersItCantHave(_ c: Conditions) {
        let screen = RunScreen(c)
        if c.motion != .authorized { #expect(screen.steps != .shown && screen.floors != .shown) }
        if !c.hasBarometer { #expect(screen.floors == .hidden) }
        if !c.precise { #expect(screen.routeDistance != .shown) }
    }

    @Test func theFullProductIs160Cases() { #expect(Conditions.all.count == 160) }
}

@Suite struct PairwiseTests {
    @Test func pairwiseCoversEveryPairWithFarFewerCases() {
        let factors = [Array(0..<5), [0, 1], [0, 1], Array(0..<4), [0, 1]]   // the five factors of Conditions
        let cover = pairwiseCover(factors)
        print("pairwise rows:", cover.count, "of", factors.reduce(1) { $0 * $1.count })
        #expect(cover.count >= 5 * 4)        // the two largest factors alone need 20 distinct pairs
        #expect(cover.count < 40)
        for i in 0..<factors.count {
            for j in (i + 1)..<factors.count {
                for a in factors[i] { for b in factors[j] { #expect(cover.contains { $0[i] == a && $0[j] == b }) } }
            }
        }
    }
}
```

```
✔ Test neverADeadEnd(_:) with 160 test cases passed after 0.016 seconds.
✔ Test neverAsksWhenTheAlertCantAppear(_:) with 160 test cases passed after 0.016 seconds.
✔ Test neverShowsNumbersItCantHave(_:) with 160 test cases passed after 0.016 seconds.
```

Invariants are a better fit than examples here. An example test pins one combination to one expected screen, and 160 of them would be a second copy of the function. An invariant states what must be true of *every* screen: there's always a way forward or an explanation, there's never an "Allow" button when the alert can't appear, and there's never a number without a sensor and a grant behind it. A change that breaks a combination nobody thought about fails a named rule, with the combination in the failure message.

## When the product is too big: pairwise

Five factors give 160 combinations, which is cheap. Ten factors of three values would give 59,049, which isn't, and some tests, such as UI tests and device tests, are expensive at any count. *Pairwise* testing takes advantage of an empirical observation: most interaction bugs involve two factors. If every *pair* of values, for every two factors, appears in at least one test, most such bugs are caught with far fewer cases. The lower bound is the product of the two largest factors, since each of their value pairs needs its own row. A greedy algorithm gets close to it:

`Sources/Library/Pairwise.swift`:

<!-- file: Sources/Library/Pairwise.swift -->
```swift
/// Greedy pairwise covering: picks rows from the full product until every pair of values,
/// for every two factors, appears in at least one chosen row.
public func pairwiseCover(_ factors: [[Int]]) -> [[Int]] {
    func rows(_ index: Int) -> [[Int]] {
        index == factors.count ? [[]] : factors[index].flatMap { v in rows(index + 1).map { [v] + $0 } }
    }
    let candidates = rows(0)
    func pairs(_ row: [Int]) -> Set<[Int]> {
        var result = Set<[Int]>()
        for i in 0..<row.count { for j in (i + 1)..<row.count { result.insert([i, row[i], j, row[j]]) } }
        return result
    }
    var uncovered = candidates.reduce(into: Set<[Int]>()) { $0.formUnion(pairs($1)) }
    var chosen: [[Int]] = []
    while !uncovered.isEmpty {
        let best = candidates.max { pairs($0).intersection(uncovered).count < pairs($1).intersection(uncovered).count }!
        chosen.append(best)
        uncovered.subtract(pairs(best))
    }
    return chosen
}
```

On the five conditions, the greedy cover needed **20 rows**, exactly the lower bound of 5 × 4 for the access and motion factors, and the test checks that every pair of values across every two factors appears. That's 20 rows instead of 160. For UI tests, where each case takes 10 to 20 seconds (as the next section measures), that's the difference between 4 minutes and 40. Pairwise coverage isn't exhaustive. A bug that needs three specific values together can slip through, so use the full product wherever it's affordable, as the invariants above do, and pairwise where it isn't.

## Losing access in the middle of a run

The [permission changes article](/ios-location-permission-changes/#never-ask-next-time-and-back) measured what Core Location delivers when access changes while updates run. On a revoke, `didFailWithError` with code 1 arrives, then an authorization callback with status 2. On a grant, the callback arrives, and fixes resume on their own. A session can be tested against exactly that script:

`Sources/Library/TrackingSession.swift`:

<!-- file: Sources/Library/TrackingSession.swift -->
```swift
/// What a run session receives, in the order Core Location delivered it in the measured revoke and grant cases:
/// a failure with code 1 and an authorization change on revoke, an authorization change and then fixes on grant.
public enum SessionEvent: Sendable, Equatable {
    case fix(time: Double, meters: Double)        // position along the route, for simplicity
    case failure(code: Int)
    case authorization(Conditions.Access)
}

public struct TrackingSession: Sendable {
    public enum State: Equatable, Sendable { case running, pausedForAccess, ended }
    public private(set) var state: State = .running
    public private(set) var distance = 0.0
    public private(set) var gaps: [ClosedRange<Double>] = []
    private var last: (time: Double, meters: Double)?
    private var pausedAt: Double?

    public init() {}

    public mutating func handle(_ event: SessionEvent) {
        switch event {
        case .failure(code: 1), .authorization(.denied), .authorization(.restricted), .authorization(.notDetermined):
            if state == .running { state = .pausedForAccess; pausedAt = last?.time }
        case .authorization(.whenInUse), .authorization(.always):
            break                                     // wait for the first fix to resume
        case .failure:
            break                                     // other failures (like code 0) are transient
        case .fix(let time, let meters):
            switch state {
            case .ended: return
            case .pausedForAccess:
                gaps.append((pausedAt ?? time)...time)   // the stretch the app couldn't see
                state = .running
            case .running:
                if let last { distance += abs(meters - last.meters) }
            }
            last = (time, meters)
        }
    }
}
```

`Tests/LibraryTests/TrackingSessionTests.swift`:

<!-- file: Tests/LibraryTests/TrackingSessionTests.swift -->
```swift
import Testing
@testable import Library

@Suite struct TrackingSessionTests {
    @Test func revokedMidRunPausesAndRecordsTheGap() {
        var session = TrackingSession()
        for t in 0..<10 { session.handle(.fix(time: Double(t), meters: Double(t) * 3)) }
        session.handle(.failure(code: 1))
        session.handle(.authorization(.denied))
        #expect(session.state == .pausedForAccess)
        session.handle(.authorization(.whenInUse))
        for t in 40..<50 { session.handle(.fix(time: Double(t), meters: Double(t) * 3)) }
        #expect(session.state == .running)
        #expect(session.gaps == [9...40])
        #expect(session.distance == 27 + 27, "the 93 m covered while denied isn't invented")
    }

    @Test func aTransientFailureDoesNotPause() {
        var session = TrackingSession()
        session.handle(.fix(time: 0, meters: 0))
        session.handle(.failure(code: 0))
        session.handle(.fix(time: 1, meters: 3))
        #expect(session.state == .running && session.distance == 3 && session.gaps.isEmpty)
    }

    @Test(arguments: [Conditions.Access.denied, .restricted, .notDetermined])
    func anyLossOfAccessPauses(_ access: Conditions.Access) {
        var session = TrackingSession()
        session.handle(.fix(time: 0, meters: 0))
        session.handle(.authorization(access))
        #expect(session.state == .pausedForAccess)
    }
}
```

The revoke test runs for 10 seconds, loses access for 30, and resumes for 10. The session pauses on the first sign of lost access, records the gap from the last fix before it to the first fix after it, and doesn't count the 93 m between them. That stretch happened, but the app didn't see it, and the [missing data article](/ios-sensor-missing-data/) explains why inventing it is worse than marking it. A transient failure with code 0, `locationUnknown`, which the simulator also produced during the measurements, doesn't pause the run.

## Testing the real alert

Logic tests can't show that the alert appears, that the purpose string reads well, or that the app reacts to the user's tap. For that, a UI test drives the system. The test host has a tiny screen for this: launched with `-requestLocation`, it asks for When In Use access and shows the authorization status in a label the test can read:

<!-- skip-check -->
```swift
/// For UI tests: asks for location on appear and shows the authorization status, so a test can read it.
final class PermissionProbe: UIViewController, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        label.accessibilityIdentifier = "authorization"
        label.frame = CGRect(x: 20, y: 200, width: 360, height: 40)
        view.addSubview(label)
        manager.delegate = self
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        manager.requestWhenInUseAuthorization()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        label.text = "authorization \(manager.authorizationStatus.rawValue)"
    }
}
```

And two UI tests answer the alert both ways:

<!-- skip-check -->
```swift
import XCTest

final class PermissionUITests: XCTestCase {
    @MainActor func testAllowWhileUsing() throws {
        let app = XCUIApplication()
        app.resetAuthorizationStatus(for: .location)
        app.launchArguments = ["-requestLocation"]
        app.launch()
        let status = app.staticTexts["authorization"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, "authorization 0")

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow While Using App"]
        XCTAssertTrue(allow.waitForExistence(timeout: 5))
        allow.tap()
        XCTAssertTrue(app.staticTexts["authorization 4"].waitForExistence(timeout: 5))
    }

    @MainActor func testDenyThenRelaunch() throws {
        let app = XCUIApplication()
        app.resetAuthorizationStatus(for: .location)
        app.launchArguments = ["-requestLocation"]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.buttons["Don’t Allow"]
        XCTAssertTrue(deny.waitForExistence(timeout: 5))
        deny.tap()
        XCTAssertTrue(app.staticTexts["authorization 2"].waitForExistence(timeout: 5))

        // A second launch asks again, and nothing appears: the denial sticks.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["authorization 2"].waitForExistence(timeout: 5))
        XCTAssertFalse(springboard.buttons["Allow While Using App"].waitForExistence(timeout: 3))
    }
}
```

```
Test Case '-[HostUITests.PermissionUITests testAllowWhileUsing]' passed (11.386 seconds).
Test Case '-[HostUITests.PermissionUITests testDenyThenRelaunch]' passed (18.616 seconds).
```

Three APIs make this work. `XCUIApplication.resetAuthorizationStatus(for: .location)` returns the app to "not determined" before launch, so every run starts from the same state. `XCUIApplication(bundleIdentifier: "com.apple.springboard")` reaches the system alert, which the app itself doesn't own. And reading the label checks the app's reaction, not just the alert. The deny test also shows the [one-shot rule](/ios-sensor-permissions/#the-location-authorization-lifecycle) end to end: after Don't Allow and a relaunch, the app asked again, the status stayed 2, and no alert appeared within three seconds.

Two limits are worth knowing. The `XCUIProtectedResource` enum has a `.location` case but no case for Motion & Fitness, so a UI test can't reset motion access. Reset it from the Mac before the run instead, which is what this series' simulator tests do:

```sh
xcrun simctl privacy booted reset motion dev.swiftbydeya.Host
xcrun simctl privacy booted revoke location dev.swiftbydeya.Host
```

And unavailable hardware can't be simulated on a device that has it. The simulator, which has no motion sensors at all, covers the "unavailable" rows for free, and a device covers the "available" ones. The pure function covers everything in between.

## Summary

- Enumerate the conditions a sensor feature depends on (access, precision, the system switch, motion permission, hardware) and make the screen a pure function of them.
- Test invariants over the full product with parameterized tests. Here, three invariants over 160 combinations ran in 0.016 s each.
- When the product is too large, pairwise covering reaches every pair of values with far fewer cases. Here it needed 20 rows instead of 160, the theoretical minimum.
- Test session logic against the event sequences the system really produces. Revoking access mid-run sends a code-1 failure and then status 2, and the session should pause and record the gap rather than invent the distance.
- UI tests can reset location authorization, tap the real alert through the springboard, and check the app's reaction. Allow While Using App gave 4, Don't Allow gave 2, and there was no alert after a relaunch. Motion access has no UI-test reset, so use `simctl privacy`.

## Exercise

Add a sixth condition, Allow Once versus a permanent grant, and a rule that a run started under Allow Once warns that it will stop in the background. Extend `Conditions.all` and check that the invariants still hold. Then compute the pairwise cover of the six factors and compare its size with the new full product. Finally, write a UI test that taps "Allow Once", sends the app to the background with `XCUIDevice.shared.press(.home)`, brings it back, and checks that the label returns to "authorization 0", the expiry measured in the [permissions article](/ios-sensor-permissions/#the-location-authorization-lifecycle).

## Further reading

- [`resetAuthorizationStatus(for:)`](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/resetauthorizationstatus(for:)) and [`XCUIProtectedResource`](https://developer.apple.com/documentation/xcuiautomation/xcuiprotectedresource)
- [Implementing parameterized tests](https://developer.apple.com/documentation/testing/parameterizedtesting), in the Swift Testing documentation
- D. Richard Kuhn, Dolores R. Wallace, and Albert M. Gallo, "Software Fault Interactions and Implications for Software Testing", *IEEE Transactions on Software Engineering* 30(6), 2004, [doi:10.1109/TSE.2004.24](https://doi.org/10.1109/TSE.2004.24), the empirical study behind pairwise and combinatorial testing

Previous: [Injecting Recorded Sensor Data for Deterministic Tests](/ios-sensor-recorded-data-tests/)

Next: [Stopping Updates When a Feature Ends](/ios-sensor-stopping-updates/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
