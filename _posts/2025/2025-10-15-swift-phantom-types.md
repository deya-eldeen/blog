---
layout: post
title: "Phantom Types in Swift"
date: "2025-10-15"
last_modified_at: "2026-10-20"
permalink: /swift-phantom-types/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swift_phantom_types_thumbnail.webp"
thumbnail_ready: true
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

Phantom types let you tuck extra meaning into Swift's type system without changing anything at runtime. A phantom type is a generic parameter that is never stored. It exists only so the compiler can tell apart values that look identical in memory: meters and feet, a user ID and an order ID, an email address you've validated and one you haven't. If you are new to Swift's type system, think of phantom types as labels the compiler reads, not values your app carries around.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/swift_phantom_types_thumbnail.webp"
 alt_text="A translucent phantom holding Meters and Feet tags above two identical values, illustrating compile-time type safety"
 caption="Phantom Types in Swift: identical values, distinct type tags"
 width="640"
 height="400"
%}

## The basic idea

Consider a `Tagged` wrapper that carries a `Raw` value and a phantom `Tag` type:

```swift
struct Tagged<Tag, Raw> {
    var raw: Raw
    init(_ raw: Raw) { self.raw = raw }
}
```

`Tag` is never used in a stored property, but it is still part of the type. `Tagged<A, Double>` and `Tagged<B, Double>` are as different to the compiler as `Int` and `String`, even though both are just a `Double` in memory.

Tags are usually empty enums:

```swift
enum MetersTag {}
enum FeetTag {}
```

An enum with no cases can't be instantiated, which is exactly what you want: nobody should ever create a "value" of `MetersTag`. It only exists to be a name the compiler can check.

Because the tag isn't stored, the wrapper is the same size as the raw value:

```swift
MemoryLayout<Tagged<MetersTag, Double>>.size // 8, same as Double
```

## Eliminating category errors

In 1999, NASA lost the Mars Climate Orbiter because one piece of software produced thrust data in pound-force seconds while another expected newton-seconds. Both were just numbers. Phantom types make this kind of mix-up a compile error:

```swift
typealias Meters = Tagged<MetersTag, Double>
typealias Feet   = Tagged<FeetTag, Double>

func climb(by height: Meters) { /* ... */ }

let ladder = Feet(12)
climb(by: ladder) // ❌ cannot convert value of type 'Feet' to expected argument type 'Meters'
```

A wrapper that can't do arithmetic gets annoying fast, so give it the operations that make sense. Notice that `+` takes two values of the *same* `Self`, so adding meters to feet still doesn't compile:

```swift
extension Tagged: Equatable where Raw: Equatable {}

extension Tagged: AdditiveArithmetic where Raw: AdditiveArithmetic {
    static var zero: Self { Self(.zero) }
    static func + (lhs: Self, rhs: Self) -> Self { Self(lhs.raw + rhs.raw) }
    static func - (lhs: Self, rhs: Self) -> Self { Self(lhs.raw - rhs.raw) }
}

extension Tagged where Raw: Numeric {
    static func * (lhs: Self, rhs: Raw) -> Self { Self(lhs.raw * rhs) }
}

let total = Meters(3) + Meters(4)   // ✅ Meters(7)
let double = total * 2              // ✅ Meters(14)
// Meters(3) + Feet(4)              // ❌ won't compile
```

### Tags that carry information

Tags can't hold instance data, but they can conform to protocols and provide *static* data. That lets the tag itself know how to convert. This version replaces the `MetersTag`/`FeetTag` design above, so `Meters` and `Feet` are now the tags themselves:

```swift
protocol LengthUnit {
    static var metersPerUnit: Double { get }
}

enum Meters: LengthUnit { static let metersPerUnit = 1.0 }
enum Feet: LengthUnit { static let metersPerUnit = 0.3048 }

typealias Length<Unit: LengthUnit> = Tagged<Unit, Double>

extension Tagged where Tag: LengthUnit, Raw == Double {
    func converted<Target: LengthUnit>(to _: Target.Type) -> Length<Target> {
        Length<Target>(raw * Tag.metersPerUnit / Target.metersPerUnit)
    }
}

let run = Length<Meters>(5_000)
let runInFeet = run.converted(to: Feet.self) // ≈ 16,404.2 ft
```

Conversions are now explicit and correct by construction. You can't forget one, because the types won't line up, and you can't apply the wrong factor, because the factor comes from the tag.

Foundation's `Measurement<UnitType>` uses a related idea. Its generic parameter (`UnitLength`, `UnitMass`, ...) stops you from adding a length to a mass, while the specific unit (meters or feet) is stored at runtime and converted for you. If you need units that the user picks at runtime, `Measurement` is often the better tool. Phantom tags fit best when the unit is fixed in code.

## Identifiers that can't be swapped

Every model has an ID, and they're often all `UUID` or `String`. A popular trick is to use the model type itself as the tag:

```swift
struct User {
    typealias ID = Tagged<User, UUID>
    let id: ID
}

struct Order {
    typealias ID = Tagged<Order, UUID>
    let id: ID
    let userID: User.ID
}

func cancel(_ order: Order.ID) { /* ... */ }

cancel(order.id)     // ✅
cancel(order.userID) // ❌ cannot convert value of type 'User.ID' to expected argument type 'Order.ID'
```

There's no circular-type problem here: `Tagged` never stores a `User`, so `User` can mention its own type in its ID.

## Phantom types as proof of a check

This is where phantom types become really useful, and also where it's easiest to get them wrong.

A tag like `Verified` is a *claim*. The compiler checks that only `Email<Verified>` values reach `sendWelcome(to:)`, but it doesn't know what "verified" means. The guarantee is only as strong as the rule for **who is allowed to create** a verified value. If anyone can write `Email<Verified>("whatever")`, the tag is worthless.

So the key is access control: make the general initializer private to one file, and expose only the paths that actually perform the check.

```swift
enum Unverified {}
enum Verified {}

struct Email<Status> {
    let address: String

    // Only code in this file can create an email with an arbitrary status.
    fileprivate init(address: String) { self.address = address }
}

extension Email where Status == Unverified {
    init(_ address: String) { self.init(address: address) }

    func verified() -> Email<Verified>? {
        guard address.contains("@") else { return nil } // stand-in for real validation
        return Email<Verified>(address: address)
    }
}

func sendWelcome(to email: Email<Verified>) { /* ... */ }
```

From any other file:

```swift
let input = Email<Unverified>("sam@example.com")

sendWelcome(to: input)                        // ❌ Unverified isn't Verified
let forged = Email<Verified>(address: "x")    // ❌ the general initializer is fileprivate
if let email = input.verified() {
    sendWelcome(to: email)                    // ✅
}
```

Once the value exists, functions downstream never need to re-validate it. The type *is* the proof that validation happened. This pattern is often summed up as "parse, don't validate."

### A note on SQL

SQL is a common phantom-types example, usually with a `sanitize()` function that turns `Raw` SQL into `Safe` SQL. Be careful with that idea: escaping user input into a query string is fragile and is not how you prevent SQL injection. The reliable fix is **parameterized queries**, where user values are bound separately from the SQL text and never become part of it.

A phantom type can still help, by guaranteeing that the SQL *text* came from your source code and not from user input. `StaticString` only accepts string literals, so it's a neat way to enforce that:

```swift
enum Trusted {}

struct Query<Trust> {
    let sql: String
    fileprivate init(sql: String) { self.sql = sql }
}

extension Query where Trust == Trusted {
    init(_ sql: StaticString) { self.init(sql: sql.description) }
}

func execute(_ query: Query<Trusted>, parameters: [any Sendable] = []) { /* bind and run */ }

execute(Query("SELECT * FROM users WHERE id = ?"), parameters: [userID]) // ✅

let name = readLine()!
execute(Query("SELECT * FROM users WHERE name = '\(name)'")) // ❌ an interpolated string is not a StaticString
```

The type system now forces every caller to pass user data as parameters.

## Coordinate spaces

The same trick keeps coordinate systems honest:

```swift
enum ViewSpace {}
enum WorldSpace {}

struct Point<Space> {
    var x: Double
    var y: Double
}

typealias ViewPoint  = Point<ViewSpace>
typealias WorldPoint = Point<WorldSpace>

func toWorld(_ p: ViewPoint, scale: Double, origin: WorldPoint) -> WorldPoint {
    WorldPoint(x: origin.x + p.x / scale, y: origin.y + p.y / scale)
}

// Works in any space, but both points must be in the *same* one.
func distance<Space>(_ a: Point<Space>, _ b: Point<Space>) -> Double {
    ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot()
}

let tap = ViewPoint(x: 10, y: 20)
let world = toWorld(tap, scale: 2, origin: WorldPoint(x: 0, y: 0))
// toWorld(world, ...)  // ❌ can't convert a point that's already in world space
// distance(tap, world) // ❌ conflicting arguments to generic parameter 'Space'
```

The `distance` function shows a nice property: generic code can work with *any* tag while still requiring that tags match.

## State machines (typestate)

You can also tag a value with the *step* it's in, so only valid transitions exist. This is called the typestate pattern:

```swift
enum Welcome {}
enum Permissions {}
enum Completed {}

struct Answers { var allowsNotifications = false }

struct Onboarding<Step>: ~Copyable {
    fileprivate var answers: Answers
    fileprivate init(answers: Answers) { self.answers = answers }
}

extension Onboarding where Step == Welcome {
    init() { self.init(answers: Answers()) }

    consuming func next() -> Onboarding<Permissions> {
        Onboarding<Permissions>(answers: answers)
    }
}

extension Onboarding where Step == Permissions {
    consuming func finish(allowingNotifications allowed: Bool) -> Onboarding<Completed> {
        var answers = answers
        answers.allowsNotifications = allowed
        return Onboarding<Completed>(answers: answers)
    }
}
```

Two details make this actually safe, and both are easy to leave out:

1. **The initializer is `fileprivate`.** Otherwise anyone could create an `Onboarding<Completed>` directly and skip the steps entirely.
2. **The type is `~Copyable` and the transitions are `consuming`.** Without this, nothing stops you from reusing an old state after moving on:

```swift
func startOnboarding() {
    let welcome = Onboarding<Welcome>()
    let permissions = welcome.next()
    let again = welcome.next() // ❌ 'welcome' consumed more than once
}
```

(This needs to live inside a function: Swift doesn't allow consuming a noncopyable global variable.)

Transitions are methods in constrained extensions (`where Step == Permissions`), so `finish` simply doesn't exist on a `Welcome` value, and autocomplete only offers the valid next step. Noncopyable types need Swift 5.9 or later; on older toolchains you still get the step checking but not the "no reuse" guarantee.

## More places phantom types help

- **Auth state.** A `Session<Authenticated>` can only come from a login function that actually checked credentials, and APIs that need a logged-in user take that type. Login status is decided at runtime, so the tag doesn't replace the check. It records that the check *happened*, the same way `Email<Verified>` does.
- **Versioned payloads.** Tag decoded data as `Payload<V1>` or `Payload<V2>`, and make migration functions the only way to go from one to the other.
- **Bytes and encodings.** Tag buffers as `BigEndian`/`LittleEndian`, or plaintext versus encrypted `Data`, so a raw buffer can't be sent where an encrypted one is expected.
- **Color spaces.** Tag colors as `SRGB` or `DisplayP3` and make conversion an explicit function.

Not everything is a good fit. A runtime feature flag, for example, can't be a phantom type on its own: the compiler can't know at build time whether the flag is on. Phantom types describe facts the code can establish statically, or facts a specific function has checked.

## Designing phantom types well

Keep tag types empty and name them for intent (`Verified`, `Meters`, `WorldSpace`) so the purpose is clear at the call site. Use typealiases to keep signatures readable.

Put protocol conformances on the wrapper, conditionally on `Raw`, so tagged values behave like the values they wrap:

```swift
extension Tagged: Hashable where Raw: Hashable {}
extension Tagged: Sendable where Raw: Sendable {}

extension Tagged: Comparable where Raw: Comparable {
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.raw < rhs.raw }
}

extension Tagged: CustomStringConvertible {
    var description: String { String(describing: raw) }
}
```

Note that `description` only takes effect in `print` and string interpolation when you declare the `CustomStringConvertible` conformance. A plain `var description` in an extension is just an ordinary property.

**Encode as the raw value.** If you let Swift synthesize `Codable`, a tagged ID is encoded as an object, `{"raw": "E621E1F8-..."}`, which almost certainly isn't what your API sends. Encode through a single-value container instead:

```swift
extension Tagged: Codable where Raw: Codable {
    init(from decoder: Decoder) throws {
        self.init(try decoder.singleValueContainer().decode(Raw.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(raw)
    }
}
```

Now `User` can stay `Codable` and its `id` decodes straight from `"id": "E621E1F8-..."` in JSON, which also takes care of "tag on entry": the value is tagged the moment it's decoded.

Be aware that conditional conformances apply to *every* tag. If `Tagged` is `Comparable`, so is `User.ID`, even if ordering IDs is meaningless. That's usually harmless, but for wrappers that represent proof (like `Email<Verified>`), prefer a dedicated struct with exactly the API you want.

If you don't want to write all of this yourself, Point-Free's open-source [swift-tagged](https://github.com/pointfreeco/swift-tagged) library provides a `Tagged` type with these conformances and more.

## Pitfalls to avoid

**A public initializer defeats the purpose.** If the tag means "this has been checked", restrict who can create tagged values, as shown in the `Email` and `Onboarding` examples. Unit and ID tags don't need this, because there's nothing to check.

**A typealias is not a new type.** `typealias UserID = UUID` gives you no safety at all; `UserID` and `UUID` are interchangeable. The same goes for two aliases of the same tagged type: `typealias AdminID = Tagged<User, UUID>` is exactly `User.ID`. The safety comes from the *tag*, so each concept needs its own tag type.

**The tag must be known at compile time.** If the kind of value is only decided at runtime (a user choosing a unit, a server sending either version), you can't pick a phantom type dynamically. Use an enum or `Measurement`, then convert to the right tagged type once you know which case you have.

**Don't tag everything.** Overuse makes APIs noisy and error messages long. Save phantom types for places where mixing values would be a real bug.

**Tag on entry, untag on exit.** Wrap raw values at the boundary (decoding, database reads, user input) so untagged values never flow into your core logic, and only unwrap `raw` where you hand data to the outside world.

## Testing phantom-heavy code

Most of the guarantees are enforced by the compiler, so your runtime tests should focus on what the compiler *can't* check: the validation logic, the conversion factors, and the encoding shape. With Swift Testing:

```swift
import Testing
import Foundation
@testable import MyApp

@Test func rejectsInvalidEmail() {
    #expect(Email<Unverified>("not-an-email").verified() == nil)
}

@Test func convertsMetersToFeet() {
    let feet = Length<Meters>(1).converted(to: Feet.self)
    #expect(abs(feet.raw - 3.28084) < 0.0001)
}

@Test func idsEncodeAsPlainValues() throws {
    let id = User.ID(UUID(uuidString: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F")!)
    let json = String(decoding: try JSONEncoder().encode(id), as: UTF8.self)
    #expect(json == #""E621E1F8-C36C-495A-93FC-0C247A3E6E5F""#)
}
```

What about checking that bad code *doesn't* compile? Neither XCTest nor Swift Testing can do that: a test file that fails to compile breaks the whole test target. If a guarantee is critical (for example, that `Email<Verified>` can't be forged), keep a small "must not compile" file outside your targets and type-check it in CI:

```sh
# Fails the build if forged_email.swift compiles.
if swiftc -typecheck Sources/MyApp/Email.swift NegativeTests/forged_email.swift 2>/dev/null; then
  echo "error: NegativeTests/forged_email.swift should not compile"
  exit 1
fi
```

This only works when the files you pass to `swiftc` are self-contained, so keep the types you check this way in small files with few dependencies. Also note that `-typecheck` stops before the compiler's ownership checks, so it won't catch "consumed more than once" errors from the typestate example. For those, use `swiftc -emit-sil -wmo` instead, which runs the full checks without producing a binary.

## Performance

The tag costs nothing at runtime: it has no storage, and `MemoryLayout` confirms the wrapper is the same size as the raw value. The wrapper's methods are tiny and normally get inlined.

The one thing to know is that generic code isn't always specialized. Within a module, or with whole-module optimization, the compiler usually specializes and inlines everything. Across module boundaries, a generic function the compiler can't see into may run through slower unspecialized code. If you ship `Tagged` in a library and use it in hot loops, mark the small helpers `@inlinable`, and measure before you worry about it.

## When to reach for phantom types

Reach for phantom types when you want the compiler to stop domain mix-ups: units (meters versus feet), identifiers (user versus order), coordinate spaces (view versus world), steps in a flow, or trust levels (unverified versus verified). They shine when a runtime check would be easy to forget, and when many concepts share the same behavior, so one generic wrapper replaces a dozen near-identical structs.

Consider the alternatives too:

- **A dedicated struct** (`struct UserID { let raw: UUID }`) is simpler and clearer when you have only one or two such types.
- **An enum** fits when the variant is chosen at runtime.
- **`Measurement`** is the standard answer for physical units that need runtime conversion and formatting.

Phantom types are a gentle way to make invalid states unrepresentable in Swift. They turn assumptions into rules the compiler enforces. Start with one hotspot (IDs, units, a validated input), tag it at the boundary, push the tag through your pipeline, and only expand when the safety win is clear.

## Further reading

- [swift-tagged](https://github.com/pointfreeco/swift-tagged): a production-ready `Tagged` type from Point-Free.
- [SE-0390: Noncopyable structs and enums](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0390-noncopyable-structs-and-enums.md): the feature behind the typestate example.
- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) by Alexis King: the idea behind "phantom types as proof of a check."
