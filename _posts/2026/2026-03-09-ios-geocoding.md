---
layout: post
hidden: true
title: "Geocoding, Reverse Geocoding, and Request Limits"
date: "2026-03-09"
last_modified_at: "2026-03-09"
permalink: /ios-geocoding/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, iOS, MapKit, Core Location, Concurrency]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Turning coordinates into "Elizabeth Tower, London" and an address into coordinates is a network request to Apple's servers, and it's rationed. iOS 26 moved geocoding from Core Location's `CLGeocoder` to two MapKit classes, `MKReverseGeocodingRequest` and `MKGeocodingRequest`, which return `MKMapItem` values with new address types. The rationing didn't change: an app that geocodes every location update finds its requests refused, and the user sees "Unknown location" exactly when they're moving through interesting places.

This article uses the new API in Swift 6 and measures the rationing. From one process, 50 reverse geocodes in 8.7 seconds succeeded. The 51st failed with `MKError.loadingThrottled` in 3 ms, and so did everything else until about a minute after the first request. Apple documents that throttling exists but not where it starts. Then it builds the client that never meets the limit: a cache keyed by grid cell, one shared lookup for concurrent callers, a token bucket, and a movement policy that cut a 50-minute commute from 3,000 location fixes to 34 lookups.

<!--more-->

The examples use Swift 6 language mode and were compiled with the Swift 6.4 toolchain from Xcode 27.1. MapKit's geocoding works from a macOS command-line program, so the blocks ran on macOS 26 against Apple's live service, and again in a unit-test bundle on an iPhone 17 simulator running iOS 27.0. Geocoding results come from a live service and can change. The ones quoted are what it returned in October 2026.

```swift
import Foundation
import CoreLocation
import MapKit
import Synchronization
```

## The iOS 26 API

`CLGeocoder` is deprecated as of iOS 26 and macOS 26, with messages pointing at its replacements: "Use MKReverseGeocodingRequest" and "Use MKGeocodingRequest". Both new classes are one-shot requests: create one with a location or an address string, read its `mapItems` property asynchronously, or `cancel()` it. The results are `MKMapItem` values, which in iOS 26 gained `address` (an `MKAddress` with `fullAddress` and `shortAddress`) and `addressRepresentations` (city, region, and formatted variants). That replaces the deprecated `placemark`.

Two details matter for Swift 6. The completion handler is annotated `NS_SWIFT_UI_ACTOR`, so the `async` getter runs on the main actor. And the map items aren't `Sendable`. A wrapper that converts the result into a plain value at the boundary solves both, and lets the rest of the app, and its tests, work against a protocol:

```swift
/// What the app shows for a place: Sendable, and free of MapKit's classes.
struct PlaceName: Sendable, Equatable {
    var short: String?
    var full: String?
    var city: String?
    var timeZone: TimeZone?
}

protocol ReverseGeocoding: Sendable {
    func placeName(at coordinate: CLLocationCoordinate2D) async throws -> PlaceName?
}

/// The real service: MapKit's request (iOS 26 and macOS 26), whose completion runs on the main actor.
@available(iOS 26, macOS 26, *)
struct MapKitGeocoder: ReverseGeocoding {
    @MainActor func placeName(at coordinate: CLLocationCoordinate2D) async throws -> PlaceName? {
        guard let request = MKReverseGeocodingRequest(location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)) else {
            return nil
        }
        guard let item = try await request.mapItems.first else { return nil }
        return PlaceName(short: item.address?.shortAddress, full: item.address?.fullAddress,
                         city: item.addressRepresentations?.cityName, timeZone: item.timeZone)
    }
}

if #available(iOS 26, macOS 26, *) {
    let clock = ContinuousClock()
    var started = clock.now
    let bridge = try await MapKitGeocoder().placeName(at: CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1246))
    print("reverse geocode took", clock.now - started, ":", bridge as Any)
    assert(bridge?.full?.contains("London") == true && bridge?.timeZone?.identifier == "Europe/London")

    started = clock.now
    let downing = try await MKGeocodingRequest(addressString: "10 Downing Street, London")!.mapItems.first
    print("forward geocode took", clock.now - started, ":", downing?.location.coordinate as Any, downing?.address?.fullAddress as Any)
    assert(downing.map { $0.location.distance(from: CLLocation(latitude: 51.5035, longitude: -0.1277)) < 100 } == true)
}
```

Westminster Bridge reverse-geocoded to "Elizabeth Tower, London, SW1A, England" in 0.23 to 0.47 seconds across runs, with the city "City of Westminster, London" and the time zone "Europe/London". The time zone alone is worth a request for apps that schedule things in local time. "10 Downing Street, London" forward-geocoded to 51.503541, −0.12767 in about a quarter of a second, with the full postcode. A main-actor method satisfied the protocol's `async` requirement: Swift hops to the main actor when the method is called through the protocol.

## Measuring the limit

Apple's documentation for `MKError.Code.loadingThrottled` says only that "the data didn't load because data throttling is in effect," and that it "can occur if an app makes frequent requests for data over a short period of time." `CLGeocoder`'s documentation is more specific about behavior, though not about numbers: "Geocoding requests are rate-limited for each app, so making too many requests in a short period of time may cause some of the requests to fail."

To find the actual numbers, this script waits two minutes so any earlier quota has reset, reverse-geocodes distinct points one after another until a request fails, then retries every 5 seconds until one succeeds. It isn't part of the article's test run, because it deliberately exhausts the quota. I ran it separately, and an earlier version once:

<!-- skip-check -->
```swift
@MainActor func lookup(_ i: Int) async -> Bool {
    let location = CLLocation(latitude: 51.49 + Double(i) * 0.0004, longitude: -0.10 - Double(i) * 0.0003)
    do { _ = try await MKReverseGeocodingRequest(location: location)!.mapItems; return true } catch { return false }
}

try await Task.sleep(for: .seconds(120))
let start = Date()
var count = 0
while await lookup(count) { count += 1 }
let throttledAt = Date().timeIntervalSince(start)
print(count, "successes, first throttle at", throttledAt, "s")
repeat {
    try await Task.sleep(for: .seconds(5))
    count += 1
} while await !lookup(count)
print("recovered", Date().timeIntervalSince(start), "s after the first request")
```

| Run | Successes before throttling | First failure at | Recovered |
| --- | --- | --- | --- |
| 1 | 50 | 8.5 s | not measured |
| 2 | 50 | 8.7 s | 61.0 s after the first request |

Both runs allowed exactly 50 requests. Every request after that failed with `MKErrorDomain` code 3, `loadingThrottled`, in 2 to 5 ms, so the refusal is local and costs no network round trip. In the first run, 30 concurrent requests sent while throttled all failed the same way. In the second, polling every 5 seconds, the first success came at 61.0 s, consistent with a window of 60 seconds from the first request. With 5-second polling, the true reset could be up to 5 seconds earlier.

So, as measured from one macOS process in October 2026, the budget is about **50 lookups per minute**. That isn't a documented contract. It may differ by platform, by app, or over time, and a well-behaved client stays far below it. `CLGeocoder`'s documentation suggests a much lower rate as a rule of thumb: "in a typical situation, you should not send more than one geocoding request per minute" while the user moves.

## A client that stays under the limit

Four techniques keep an app's lookups to a minimum, and each attacks a different source of waste.

**A token bucket** caps the rate whatever the callers do. It holds up to $C$ tokens and refills at $r$ per second. Each request takes a token, and a request with no token is refused immediately. Over any interval of length $t$, it allows at most $C + rt$ requests. With $C$ = 10 and $r$ = 0.5, that's 40 per minute, under the measured 50:

```swift
/// A token bucket: up to `capacity` requests at once, refilled at `rate` per second.
struct TokenBucket {
    let capacity: Double, rate: Double
    private(set) var tokens: Double
    private var last: Double

    init(capacity: Double, perSecond rate: Double, now: Double) {
        self.capacity = capacity; self.rate = rate; tokens = capacity; last = now
    }

    /// Takes a token if one is available at time `now`, in seconds.
    mutating func take(now: Double) -> Bool {
        tokens = min(capacity, tokens + (now - last) * rate)
        last = now
        guard tokens >= 1 else { return false }
        tokens -= 1
        return true
    }
}

// Stay under a measured quota of 50 per minute with margin: bursts of 10, then one every 2 seconds (30 per minute).
var bucket = TokenBucket(capacity: 10, perSecond: 0.5, now: 0)
var granted = 0
for tenth in 0..<600 where bucket.take(now: Double(tenth) / 10) { granted += 1 }   // asking 10 times a second for a minute
print("asking 600 times in a minute, the bucket allowed", granted)
assert(granted == 10 + 29 || granted == 10 + 30)
```

Asked 600 times in a minute, ten times a second, the bucket allowed 39: the burst of 10, then one every two seconds.

**A cache keyed by grid cell** reuses answers for nearby coordinates. Two fixes 5 m apart are the same place to a human, but not to a dictionary keyed by `CLLocationCoordinate2D`. Rounding to a 100 m grid cell makes them the same key. **Coalescing** handles the case a cache can't: several parts of an interface asking for the same place at the same moment, before any answer is cached. An actor keeps the in-flight `Task` for each cell, and later callers await it instead of starting their own:

```swift
/// Caches place names by grid cell, shares one lookup among concurrent callers for the same cell,
/// and refuses to exceed its token bucket.
actor PlaceNames {
    enum Failure: Error { case rateLimited }

    private let service: any ReverseGeocoding
    private let cellSize: Double                       // meters
    private let lifetime: Duration
    private let clock = ContinuousClock()
    private let origin: ContinuousClock.Instant
    private var bucket: TokenBucket
    private var cache: [Cell: (name: PlaceName?, stored: ContinuousClock.Instant)] = [:]
    private var inFlight: [Cell: Task<PlaceName?, any Error>] = [:]
    private(set) var lookups = 0

    struct Cell: Hashable { var row: Int; var column: Int }

    init(service: any ReverseGeocoding, cellSize: Double = 100, lifetime: Duration = .seconds(3_600),
         bucket: (capacity: Double, perSecond: Double) = (10, 0.5)) {
        self.service = service
        self.cellSize = cellSize
        self.lifetime = lifetime
        origin = clock.now
        self.bucket = TokenBucket(capacity: bucket.capacity, perSecond: bucket.perSecond, now: 0)
    }

    /// Meters per degree are nearly constant over a city, so a fixed-angle grid at the cell's latitude is enough here.
    private func cell(for c: CLLocationCoordinate2D) -> Cell {
        let metersPerDegree = 111_320.0
        let row = Int((c.latitude * metersPerDegree / cellSize).rounded(.down))
        let column = Int((c.longitude * metersPerDegree * cos(c.latitude * .pi / 180) / cellSize).rounded(.down))
        return Cell(row: row, column: column)
    }

    func placeName(at coordinate: CLLocationCoordinate2D) async throws -> PlaceName? {
        let key = cell(for: coordinate)
        if let hit = cache[key], clock.now - hit.stored < lifetime { return hit.name }
        if let running = inFlight[key] { return try await running.value }
        let elapsed = clock.now - origin
        guard bucket.take(now: Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18) else {
            throw Failure.rateLimited
        }
        lookups += 1
        let service = self.service
        let task = Task { try await service.placeName(at: coordinate) }
        inFlight[key] = task
        defer { inFlight[key] = nil }
        let name = try await task.value
        cache[key] = (name, clock.now)
        return name
    }
}

/// A stand-in service that counts its calls and takes 50 ms, like a fast network round trip.
final class CountingGeocoder: ReverseGeocoding {
    let calls = Mutex(0)
    func placeName(at coordinate: CLLocationCoordinate2D) async throws -> PlaceName? {
        calls.withLock { $0 += 1 }
        try await Task.sleep(for: .milliseconds(50))
        return PlaceName(short: String(format: "%.4f, %.4f", coordinate.latitude, coordinate.longitude))
    }
}

let counting = CountingGeocoder()
let names = PlaceNames(service: counting)
let here = CLLocationCoordinate2D(latitude: 51.5007, longitude: -0.1246)
// Ten parts of the interface ask for the same place at the same moment.
let answers = try await withThrowingTaskGroup(of: PlaceName?.self) { group in
    for _ in 0..<10 { group.addTask { try await names.placeName(at: here) } }
    var all: [PlaceName?] = []
    for try await answer in group { all.append(answer) }
    return all
}
// A few meters away, in the same 100 m cell, a moment later.
_ = try await names.placeName(at: CLLocationCoordinate2D(latitude: 51.50072, longitude: -0.12455))
print("10 concurrent requests and one nearby request:", counting.calls.withLock { $0 }, "lookup(s); all equal:", Set(answers.map { $0?.short }).count == 1)
assert(counting.calls.withLock { $0 } == 1)
```

Ten concurrent requests for Westminster Bridge, plus one for a point a few meters away, produced exactly one lookup, and all eleven callers got the same answer. The actor makes this safe without locks: between storing the task in `inFlight` and awaiting it, no other call can interleave. Suspension happens only at the `await`, and by then later callers find the task.

**A movement policy** decides when the user's own location deserves a new lookup at all. The rule from Apple's guidance is to require both distance and time:

```swift
/// Re-geocode only after moving far enough and waiting long enough, as Apple's geocoding guidance suggests
/// ("not more than one geocoding request per minute" while moving).
struct RefreshPolicy {
    var minimumDistance: CLLocationDistance
    var minimumInterval: TimeInterval
    private var last: (location: CLLocation, time: TimeInterval)?

    init(minimumDistance: CLLocationDistance, minimumInterval: TimeInterval) {
        self.minimumDistance = minimumDistance; self.minimumInterval = minimumInterval
    }

    mutating func shouldRefresh(at location: CLLocation, time: TimeInterval) -> Bool {
        if let last, location.distance(from: last.location) < minimumDistance || time - last.time < minimumInterval {
            return false
        }
        last = (location, time)
        return true
    }
}

// A commute at one fix per second: 15 minutes walking, 25 minutes on a train, 10 minutes walking.
var commute: [CLLocation] = []
var east = 0.0
for (seconds, speed) in [(900, 1.4), (1_500, 20.0), (600, 1.4)] {
    for _ in 0..<seconds {
        east += speed
        commute.append(CLLocation(latitude: 51.5007, longitude: -0.1246 + east / 69_440))
    }
}

// Every fix, versus 100 m cells (one lookup per new cell), versus the movement policy.
var cells = Set<[Int]>()
for fix in commute {
    cells.insert([Int((fix.coordinate.latitude * 111_320 / 100).rounded(.down)),
                  Int((fix.coordinate.longitude * 69_440 / 100).rounded(.down))])
}
var policy = RefreshPolicy(minimumDistance: 250, minimumInterval: 60)
let policyLookups = commute.enumerated().filter { policy.shouldRefresh(at: $0.element, time: Double($0.offset)) }.count
print("50-minute commute:", commute.count, "fixes;", cells.count, "lookups with 100 m cells;", policyLookups, "with the policy")
```

On a simulated commute, with fixes every second while walking 15 minutes, riding a train for 25, and walking 10 more:

| Strategy | Lookups in 50 minutes | Per minute |
| --- | --- | --- |
| Every fix | 3,000 | 60, over the measured quota |
| One per new 100 m cell | 322 | 6.4 |
| 250 m and 60 s since the last | 34 | 0.7 |

The cache alone helps the walkers and does little for the train, which crosses a new 100 m cell every five seconds. The policy's count is easy to predict. On foot, distance limits it: 1,260 m of walking at 250 m per lookup is about 5. On the train, time limits it: 1,500 s at one per 60 s is 25. The last walk adds about 3. That gives roughly 34, one lookup every minute and a half, which is what "the street you're on" needs.

Together, the policy decides *whether* to look up, the cache and coalescing make repeated questions free, and the bucket guarantees that nothing, not even a bug in a loop, can exceed the budget. When the bucket refuses, show the last known place name rather than an error. A place name that's a minute old is almost always still right.

## Summary

- iOS 26 replaced `CLGeocoder` with MapKit's `MKReverseGeocodingRequest` and `MKGeocodingRequest`, which return `MKMapItem` values with `address` and `addressRepresentations`. Their completion runs on the main actor, so wrap them and convert results to `Sendable` values.
- Westminster Bridge reverse-geocoded in 0.23 to 0.47 s, with a city name and a time zone.
- From one process, 50 requests in about 8.7 s succeeded, the 51st failed locally with `loadingThrottled`, and requests succeeded again about 61 s after the first. That's roughly 50 per minute, measured, not documented.
- A token bucket bounds any interval of length $t$ to $C + rt$ requests. A cache keyed by grid cell reuses nearby answers. An actor that shares in-flight tasks turned ten simultaneous requests into one.
- Requiring both 250 m of movement and 60 s between lookups cut a 50-minute commute from 3,000 fixes to 34 lookups. Caching alone still needed 322.
- When throttled, show the last known place. Never geocode per fix.

## Exercise

Add persistence and expiry to `PlaceNames`. Write the cache to disk as JSON keyed by cell, so a relaunched app starts warm. Give entries a lifetime that depends on the answer: a street address can stay valid for a day, while a failed lookup should be retried after a minute. Then add a `prefetch(along:)` method that takes a planned route and looks up one cell every 500 m, spending at most half the bucket, so a navigation app has names ready before the user arrives.

## Further reading

- [`MKReverseGeocodingRequest`](https://developer.apple.com/documentation/mapkit/mkreversegeocodingrequest) and [`MKGeocodingRequest`](https://developer.apple.com/documentation/mapkit/mkgeocodingrequest)
- [`MKError.Code.loadingThrottled`](https://developer.apple.com/documentation/mapkit/mkerror/code/loadingthrottled)
- [`CLGeocoder`](https://developer.apple.com/documentation/corelocation/clgeocoder), deprecated, but its "Tips for Using a Geocoder Object" remain the clearest statement of Apple's expectations

Previous: [Visits and Significant Location Changes](/ios-visits-significant-location-changes/)

Next: [Background Location and App Lifecycle Boundaries](/ios-background-location/)

Return to the [Sensors and Location roadmap](/ios-sensors/).
