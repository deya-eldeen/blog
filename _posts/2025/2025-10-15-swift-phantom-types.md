---
layout: post
title: "Phantom Types in Swift"
date: "2025-10-15"
last_modified_at: "2025-10-15"
permalink: /swift-phantom-types/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swift_phantom_types_full.webp"
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Type Safety"
  - "Generics"
  - "Phantom Types"
---

Phantom types let you tuck extra meaning into Swift’s type system without changing anything at runtime. They live in a generic parameter purely for compile-time checks, which means you can stop category mistakes (mixing meters with feet or safe SQL with raw text) while keeping zero overhead. If you are new to Swift’s type system, think of phantom types as labels the compiler reads, not values your app carries around.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/swift_phantom_types_full.webp"
 alt_text="Phantom Types In Swift" 
 caption="Phantom Types In Swift"
 width="960" 
 height="1568"
%}

## The basic idea

Consider a `Tagged` wrapper that carries a `Raw` value and a phantom `Tag` type:

```swift
struct Tagged<Tag, Raw> {
    let raw: Raw
    init(_ raw: Raw) { self.raw = raw }
}
```

`Tag` never appears as a stored property, but the compiler still tracks it. This means two wrappers with different tags are incompatible even if they share the same raw type.

## Eliminating category errors

Imagine working with units. Create tiny, empty types to tag your values:

```swift
enum MetersTag {}
enum FeetTag {}

typealias Meters = Tagged<MetersTag, Double>
typealias Feet   = Tagged<FeetTag, Double>
```

Now a function like `distanceInMeters` only accepts `Meters`. Passing a `Feet` value will not compile, even though both carry a `Double` underneath. The compiler blocks the mix-up before it ever runs.

## Safer APIs with compile-time intent

Say you’re building SQL. You can mark raw SQL differently from sanitized SQL:

```swift
enum RawSQL {}
enum SafeSQL {}

typealias SQL<Flavor> = Tagged<Flavor, String>

func sanitize(_ input: SQL<RawSQL>) -> SQL<SafeSQL> {
    SQL<SafeSQL>("sanitize(\(input.raw))")
}

func execute(_ query: SQL<SafeSQL>) { /* ... */ }

let userInput = SQL<RawSQL>("DROP TABLE users;")
let safe = sanitize(userInput)
execute(safe)           // ✅
// execute(userInput)   // won’t compile, raw SQL rejected
```

The same trick keeps coordinate systems honest:

```swift
enum ViewSpace {}
enum WorldSpace {}

struct Point<Tag> {
    var x: Double
    var y: Double
}

typealias ViewPoint  = Point<ViewSpace>
typealias WorldPoint = Point<WorldSpace>

func convertToWorld(_ p: ViewPoint) -> WorldPoint {
    WorldPoint(x: p.x * 2, y: p.y * 2)
}

let local = ViewPoint(x: 10, y: 20)
let world = convertToWorld(local)
// convertToWorld(world) // won’t compile, can’t double-convert
```

By tagging points, you cannot accidentally convert the same point twice or pass a world-space point where a view-space point belongs.

## Real-world Swift uses

You can wrap identifiers to stop cross-wiring them. Tag `UserID` and `OrderID` so an order summary can never swap them. You can tag network payloads by version and make your decoder refuse to mix v1 with v2. You can tag UI points by layout or screen space to keep math from drifting between coordinate systems. If you are learning, start with a single place that often breaks (for example, mixed units) and add a tag there first. The pattern stays the same: a phantom tag carries meaning the compiler understands, but your runtime values remain lean.

You can take it further for navigation and routing. A typed router can insist on a `Route<Authenticated>` when users are logged in and a `Route<Guest>` otherwise. A naive string-based router cannot help you here, but a phantom tag can. The same applies to feature flags: wrap the flag in `Enabled` or `Disabled` tags so you do not accidentally ship the wrong code path. Beginners can think of this as adding an extra “safety stamp” that the compiler checks.

State machines benefit, too. Imagine modeling an onboarding flow:

```swift
enum Welcome {}
enum Permissions {}
enum Completed {}

struct OnboardingState<Step> {
    let payload: [String: Any]
}

func requestPermissions(_ state: OnboardingState<Welcome>) -> OnboardingState<Permissions> {
    OnboardingState<Permissions>(payload: state.payload)
}

func finish(_ state: OnboardingState<Permissions>) -> OnboardingState<Completed> {
    OnboardingState<Completed>(payload: state.payload)
}
```

The compiler now knows you cannot jump straight from welcome to finish without granting permissions.

When you work with byte buffers, you can mark endian order or protocol framing to avoid mixing raw payloads with length-prefixed ones. In graphics, you can tag colors as `SRGB` or `DisplayP3` and make conversion explicit. In cryptography, you can tag keys as `PublicKey` versus `PrivateKey` to stop accidental misuse.

## Designing phantom types well

Keep tag types empty and name them for intent (`SafeSQL`, `Meters`, `WorldSpace`) so the purpose is clear at the call site. Lean on typealiases to keep code readable. Conform your wrapper (not the tag) to protocols like `Equatable` or `Codable` so you do not leak the implementation detail everywhere.

If the tag is widely used, wrap the boilerplate in small helpers so the call sites stay friendly:

```swift
extension Tagged: Equatable where Raw: Equatable {}
extension Tagged: Hashable where Raw: Hashable {}

extension Tagged {
    var description: String { "\(raw)" }
}
```

You can then add conveniences like `init(uuid: UUID)` or `var asUUID: UUID` for specific tags. This keeps the API simple for newcomers while preserving the safety.

## Pitfalls to avoid

It is tempting to tag everything, but overuse makes APIs noisy. Save phantom types for places where mixing values would be a real bug. Do not force tags into public protocols unless you want consumers to depend on them. Keep initializers narrow (for example, `init(rawValue:)` on the wrapper) so callers cannot bypass the validation you intend.

Another common footgun is forgetting to set the tag when bridging from other layers. If you parse JSON IDs as plain `UUID`, wrap them immediately into `Tagged<UserIDTag, UUID>` near the boundary so untagged values never flow inward. Keep interop helpers close to your decoding layer to avoid repeating conversions. Beginners can treat this as “tag on entry, untag on exit.”

## Testing phantom-heavy code

Test the compiler as well as the runtime behavior. Keep a tiny snippet that must fail to compile:

```swift
enum RawSQL {}
enum SafeSQL {}
typealias SQL<Flavor> = Tagged<Flavor, String>

let bad: SQL<RawSQL> = SQL<SafeSQL>("sanitized") // expected-error: cannot convert value
```

If this ever compiles, you know a guard slipped. In regular unit tests, assert the happy path and a negative path:

```swift
func test_execute_allows_only_safe_sql() {
    enum RawSQL {}
    enum SafeSQL {}
    typealias SQL<Flavor> = Tagged<Flavor, String>

    func execute(_ query: SQL<SafeSQL>) -> String { query.raw }

    let safe = SQL<SafeSQL>("SELECT 1")
    XCTAssertEqual(execute(safe), "SELECT 1")
}
```

For integration points, tag at the boundary:

```swift
struct UserIDTag {}
typealias UserID = Tagged<UserIDTag, UUID>

func decodeUserID(from json: [String: Any]) -> UserID? {
    guard let raw = json["id"] as? String, let uuid = UUID(uuidString: raw) else { return nil }
    return UserID(uuid)
}
```

Once tagged, untagged values never enter the core. Performance is normally a non-issue: the tag is compile-time only, the wrapper is a thin shell, and the optimizer inlines the forwarding. Measure only if you put phantom wrappers inside tight loops; otherwise treat them as free safety.

## When to reach for phantom types

Reach for phantom types when you want the compiler to stop domain mix-ups: units (meters versus feet), coordinate spaces (view versus world), auth state (guest versus authenticated), or data trust levels (raw versus sanitized). They shine when runtime checks would be easy to forget or noisy, and when you want the safety without extra runtime cost. Avoid them if the extra generic parameter makes APIs harder to read, or if a plain enum or a dedicated struct communicates the rule clearly enough.

Phantom types are a gentle way to make invalid states unrepresentable in Swift. They turn assumptions into code the compiler enforces. Start with one hotspot (IDs, units, raw SQL), tag it, push that tag through your pipeline, and only expand when the safety win is clear.
