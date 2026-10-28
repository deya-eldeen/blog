---
layout: post
hidden: true
title: "Decoding JSON with Codable: Keys, Numbers, Dates, and Failure"
date: "2026-09-16"
last_modified_at: "2026-09-16"
permalink: /swift-decoding-json-codable/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Networking, Codable, JSON]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
`Codable` makes the happy path almost free: declare a struct whose property names match the JSON, call `JSONDecoder().decode`, and it works. The cost shows up later, at the edges. A server adds a new enum case and every client on the old version fails to load the screen. An ID passes through a `Double` and silently changes. A timestamp arrives in milliseconds instead of seconds and every date lands somewhere past the year 58,000. One malformed item in a feed of 200 empties the feed.

Each of those failures comes from a decision that `Codable` makes by default and that a networking layer should make deliberately. This article goes through those decisions: how keys are mapped, what happens to missing and `null` values, how numbers and dates are interpreted, how to stay compatible with a server that evolves, how to survive one bad element, how to read a `DecodingError`, and how long decoding takes.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks below, in order, into one `main.swift` to run the assertions. Several results in this article describe the Foundation that ships with macOS 26 and iOS 26, whose JSON implementation is the open-source [swift-foundation](https://github.com/swiftlang/swift-foundation); older OS versions behave differently in places that are called out.

## Keys: be explicit

The synthesized `Decodable` conformance looks up each stored property under a key with the same name. When the JSON uses different names, there are two ways to bridge them: a global `keyDecodingStrategy`, or an explicit `CodingKeys` enum.

`.convertFromSnakeCase` is the popular global choice, and it has two traps. It converts `user_id` to `userId`, never `userID`, so Swift-style acronyms do not match. And its encoding counterpart is not its inverse: `.convertToSnakeCase` turns `coverURL` into `cover_url`, which `.convertFromSnakeCase` turns back into `coverUrl`. The mismatch is silent when the property is optional:

```swift
import Foundation

struct Cover: Codable {
    var coverURL: URL?
    var isbn13: String?
}

let snakeEncoder = JSONEncoder()
snakeEncoder.keyEncodingStrategy = .convertToSnakeCase
let snakeDecoder = JSONDecoder()
snakeDecoder.keyDecodingStrategy = .convertFromSnakeCase

let original = Cover(coverURL: URL(string: "https://covers.example/7.jpg"), isbn13: "9780441013593")
let snakeJSON = try snakeEncoder.encode(original)
assert(String(decoding: snakeJSON, as: UTF8.self).contains(#""cover_url""#))

let roundTripped = try snakeDecoder.decode(Cover.self, from: snakeJSON)
assert(roundTripped.isbn13 == "9780441013593")
assert(roundTripped.coverURL == nil)  // "cover_url" became "coverUrl", which matches nothing
```

The value did not fail to decode. It decoded as absent, the screen showed a placeholder cover, and no error was ever logged. Explicit keys avoid the problem and document the mapping where a reader can see it:

```swift
struct Book: Codable, Equatable, Sendable {
    var id: String
    var title: String
    var coverURL: URL?
    var pageCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, title
        case coverURL = "cover_url"
        case pageCount = "page_count"
    }
}

let bookJSON = Data(#"{"id":"b-7","title":"Dune","cover_url":"https://covers.example/7.jpg","page_count":412}"#.utf8)
let dune = try JSONDecoder().decode(Book.self, from: bookJSON)
assert(dune.coverURL?.lastPathComponent == "7.jpg" && dune.pageCount == 412)
```

`CodingKeys` costs a few lines per type and removes a whole class of silent failures. It also lets the Swift name and the wire name evolve separately, which is what you want when a server renames a field and the app has to accept both for a release cycle.

## Missing, `null`, and the wrong type

JSON has three ways for a value to be unusable: the key is absent, the value is `null`, or the value has the wrong type. `Codable` distinguishes all three, and the distinctions matter for an optional property:

```swift
struct Shelf: Decodable {
    var name: String
    var note: String?
}

func shelfError(_ json: String) -> DecodingError? {
    do {
        _ = try JSONDecoder().decode(Shelf.self, from: Data(json.utf8))
        return nil
    } catch {
        return error as? DecodingError
    }
}

assert(shelfError(#"{"name":"Fiction"}"#) == nil)               // optional key absent: nil
assert(shelfError(#"{"name":"Fiction","note":null}"#) == nil)   // optional null: nil

guard case .keyNotFound(let missing, _)? = shelfError(#"{"note":"x"}"#) else { fatalError() }
assert(missing.stringValue == "name")

guard case .valueNotFound(_, let nullContext)? = shelfError(#"{"name":null}"#) else { fatalError() }
assert(nullContext.codingPath.map(\.stringValue) == ["name"])

guard case .typeMismatch(_, let mismatch)? = shelfError(#"{"name":"Fiction","note":5}"#) else { fatalError() }
assert(mismatch.codingPath.map(\.stringValue) == ["note"])  // optional does NOT mean "anything goes"
```

| JSON for a property of type `String?` | Result |
|---|---|
| key absent | `nil` |
| `null` | `nil` |
| `"text"` | `"text"` |
| `5` | throws `typeMismatch` |

The last row surprises people: an optional property does not swallow type errors. That is the right default, since a number where a string was promised is a contract violation worth knowing about. When a field really is unreliable, decode it with `try?` in a custom initializer and log the failure, rather than declaring every property optional and losing the ability to tell "the server omitted it" from "the server broke it."

The same three-way distinction applies when *sending* data. [Building Typed Endpoints and Request Bodies](/swift-typed-endpoints/) uses it to tell "leave this field alone" from "clear this field" in `PATCH` requests.

## Numbers: what fits where

JSON has one number type with arbitrary precision. Swift has many fixed-size types, and the decoder must pick a representation. The rules worth knowing are about integers and doubles.

A `Double` has a 53-bit significand, so it represents every integer exactly only up to $$2^{53}$$:

$$
2^{53} = 9\,007\,199\,254\,740\,992,
\qquad
\text{the next representable double is } 2^{53} + 2
$$

Beyond that, consecutive doubles are 2 apart, then 4, and so on. An ID of $$2^{53} + 1$$ decoded into a `Double` becomes its even neighbor. Decoded into `Int`, which is 64 bits, it is exact:

```swift
struct Identified: Decodable {
    var asInt: Int
    var asDouble: Double
}
let big = try JSONDecoder().decode(Identified.self, from: Data(#"{"asInt":9007199254740993,"asDouble":9007199254740993}"#.utf8))
assert(big.asInt == 9_007_199_254_740_993)
assert(big.asDouble == 9_007_199_254_740_992)  // rounded to the nearest representable double
```

Swift is not where this usually goes wrong. JavaScript represents every number as a double, so a server written in Node.js, a JSON pipeline that passes through `jq`, or a web dashboard will corrupt the same ID before it ever reaches the app. That is why APIs such as Twitter's historically sent IDs both as numbers and as strings, and why the [typed endpoints article](/swift-typed-endpoints/) models IDs as strings.

Other number rules, measured on macOS 26:

```swift
struct Count: Decodable { var value: Int }
struct Price: Decodable { var amount: Decimal }

func decodeCount(_ json: String) -> Int? { try? JSONDecoder().decode(Count.self, from: Data(json.utf8)).value }

assert(decodeCount(#"{"value":2.0}"#) == 2)       // integral value with a fraction part: accepted
assert(decodeCount(#"{"value":1e3}"#) == 1000)    // exponent notation: accepted
assert(decodeCount(#"{"value":1.5}"#) == nil)     // not representable as Int: rejected
assert(decodeCount(#"{"value":9223372036854775808}"#) == nil)  // Int.max + 1: rejected

let price = try JSONDecoder().decode(Price.self, from: Data(#"{"amount":19.99}"#.utf8))
assert(price.amount == Decimal(string: "19.99"))  // exact, not 19.989999999...
```

Use `Decimal` for money. `Double` cannot represent 19.99 exactly, and repeated arithmetic on such values drifts. On older Foundation implementations, decoding a `Decimal` from a JSON number went through `Double` and produced values like `19.989999999999998`; on iOS 26 and macOS 26 it is exact. If you support older systems, receive money as a string, or as an integer number of cents, which is the safest representation regardless of platform.

The rejected cases have a diagnostic trap, covered in the section on reading errors below.

## Dates: pick one format and say so

JSON has no date type, so every API chooses a representation, and the decoder must be told which. The common ones are ISO 8601 strings and numeric timestamps.

The built-in `.iso8601` strategy handles the full date-and-time form with a zone designator. On macOS 26 it also accepts fractional seconds, which earlier Foundation versions rejected, a long-standing source of production failures for apps whose servers added milliseconds. It does not accept a date without a time:

```swift
let isoDecoder = JSONDecoder()
isoDecoder.dateDecodingStrategy = .iso8601

func isoDate(_ text: String) -> Date? { try? isoDecoder.decode([Date].self, from: Data("[\"\(text)\"]".utf8)).first }

assert(isoDate("2026-09-16T10:00:00Z")?.timeIntervalSince1970 == 1_789_552_800)
assert(isoDate("2026-09-16T12:00:00+02:00")?.timeIntervalSince1970 == 1_789_552_800)
assert(isoDate("2026-09-16T10:00:00.123Z").map { abs($0.timeIntervalSince1970 - 1_789_552_800.123) < 0.001 } == true)
assert(isoDate("2026-09-16") == nil)  // date-only strings need a different format
```

When an API's format is known, spell it out with a custom strategy that uses `Date.ISO8601FormatStyle`. That pins the behavior across OS versions, and it is also how you accept several formats during a migration:

```swift
let flexible = JSONDecoder()
flexible.dateDecodingStrategy = .custom { decoder in
    let text = try decoder.singleValueContainer().decode(String.self)
    let formats: [Date.ISO8601FormatStyle] = [
        .iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .omitted),
        .iso8601.year().month().day().time(includingFractionalSeconds: false).timeZone(separator: .omitted),
        .iso8601.year().month().day(),
    ]
    for format in formats {
        if let date = try? Date(text, strategy: format) { return date }
    }
    throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                            debugDescription: "Unrecognized date: \(text)"))
}

let dates = try flexible.decode([Date].self, from: Data(#"["2026-09-16T10:00:00.250Z","2026-09-16T10:00:00Z","2026-09-16"]"#.utf8))
assert(dates[1].timeIntervalSince1970 == 1_789_552_800)
assert(abs(dates[0].timeIntervalSince(dates[1]) - 0.25) < 0.001)
assert(dates[2].timeIntervalSince1970 == 1_789_516_800)  // midnight UTC
```

The date-only value decodes as midnight UTC. Whether that is right depends on what the field means: a due date for a library loan is a calendar day, not an instant, and showing it in a time zone west of UTC moves it to the previous day. Fields that represent days are better decoded into a dedicated type, such as `DateComponents` or a small `CalendarDay` struct, than into `Date`.

Numeric timestamps have their own ambiguity: seconds or milliseconds since 1970. The two differ by a factor of 1,000, which makes them easy to tell apart by magnitude for any date in a plausible range. Today is about $$1.79 \times 10^{9}$$ seconds, or $$1.79 \times 10^{12}$$ milliseconds, after the epoch, so a value above $$10^{11}$$ is almost certainly milliseconds: as seconds it would be in the year 5138. That makes a cheap sanity check worth adding to tests, even though the decoder should be configured with the right unit, `.secondsSince1970` or `.millisecondsSince1970`, rather than guess.

## Enums and forward compatibility

A server adds values to an enum more often than it changes anything else. With a synthesized `Decodable` enum, a client that does not know the new value fails to decode the whole response:

```swift
enum StrictStatus: String, Decodable { case available, onLoan = "on_loan" }

struct StrictCopy: Decodable { var status: StrictStatus }
let futureJSON = Data(#"{"status":"in_repair"}"#.utf8)
assert((try? JSONDecoder().decode(StrictCopy.self, from: futureJSON)) == nil)
```

Every installed version of the app that predates `in_repair` now fails on every screen that shows a copy in repair. Since apps cannot be updated on the server's schedule, enums decoded from a server should have an explicit case for unknown values:

```swift
enum CopyStatus: Equatable, Sendable, Decodable {
    case available
    case onLoan
    case unknown(String)

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "available": self = .available
        case "on_loan": self = .onLoan
        default: self = .unknown(raw)
        }
    }
}

struct Copy: Decodable { var status: CopyStatus }
assert((try? JSONDecoder().decode(Copy.self, from: futureJSON))?.status == .unknown("in_repair"))
```

The UI then decides what an unknown status looks like, typically a neutral "Unavailable," and the raw value is still there for logging. This is the **tolerant reader** pattern: accept anything you can make sense of, and ignore or neutralize what you cannot. It applies to new properties too, which `Codable` already ignores by default.

### Payloads with a type field

Feeds often mix several kinds of item in one array, with a `type` field saying which. An enum with associated values models that directly, and a two-stage decode reads the discriminator first:

```swift
struct Review: Decodable, Equatable { var bookID: String; var stars: Int }
struct Announcement: Decodable, Equatable { var text: String }

enum FeedItem: Decodable, Equatable {
    case review(Review)
    case announcement(Announcement)
    case unsupported(type: String)

    private enum Keys: String, CodingKey { case type }

    init(from decoder: any Decoder) throws {
        let type = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .type)
        switch type {
        case "review": self = .review(try Review(from: decoder))
        case "announcement": self = .announcement(try Announcement(from: decoder))
        default: self = .unsupported(type: type)
        }
    }
}

let feedJSON = Data(#"""
[{"type":"review","bookID":"b-7","stars":5},
 {"type":"announcement","text":"Closed on Monday"},
 {"type":"poll","question":"Next book?"}]
"""#.utf8)
let feed = try JSONDecoder().decode([FeedItem].self, from: feedJSON)
assert(feed == [.review(Review(bookID: "b-7", stars: 5)), .announcement(Announcement(text: "Closed on Monday")),
                .unsupported(type: "poll")])
```

`Review(from: decoder)` reuses the same decoder, so the nested type reads its own keys from the same object and ignores `type`. Unknown item types become `.unsupported`, which the feed can skip.

## One bad element should not empty a list

An array decodes all or nothing. If item 143 of 200 has a malformed field, `[Book].self` throws, and a feed that could have shown 199 books shows an error. For lists where items are independent, decode each element separately and keep the failures:

```swift
struct Lossy<Element: Decodable>: Decodable {
    var elements: [Element]
    var failures: [(index: Int, error: any Error)]

    private struct Skip: Decodable {}

    init(from decoder: any Decoder) throws {
        var container = try decoder.unkeyedContainer()
        elements = []
        failures = []
        while !container.isAtEnd {
            let index = container.currentIndex
            do {
                elements.append(try container.decode(Element.self))
            } catch {
                failures.append((index, error))
                _ = try container.decode(Skip.self)  // advance past the bad element
            }
        }
    }
}

let mixed = Data(#"[{"id":"b-1","title":"Dune"},{"id":"b-2"},{"id":"b-3","title":"Emma"}]"#.utf8)
let lossy = try JSONDecoder().decode(Lossy<Book>.self, from: mixed)
assert(lossy.elements.map(\.id) == ["b-1", "b-3"])
assert(lossy.failures.map(\.index) == [1])
```

The `Skip` decode is essential. A failed `decode` does not advance an unkeyed container, so without it the loop would retry the same element forever. Decoding an empty struct succeeds for any JSON object and moves the container forward. If the bad element is not an object at all, for example a bare number in an array of books, decoding `Skip` throws and the whole array fails. That is the right outcome for a payload that broken.

Report `failures` to your error tracker. Silently dropping elements turns a server bug into missing data that nobody notices until a user asks where their book went.

## The parser is lenient in places

Decoding is two steps: parsing bytes into a JSON value, then mapping that value onto types. The parser in macOS 26 accepts some inputs that strict JSON, [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259), does not allow:

```swift
let bom = try JSONDecoder().decode([String].self, from: Data("\u{FEFF}[\"a\"]".utf8))
assert(bom == ["a"])                                       // a leading byte order mark is skipped
let trailing = try JSONDecoder().decode([String].self, from: Data(#"["a",]"#.utf8))
assert(trailing == ["a"])                                  // trailing comma accepted
let duplicate = try JSONDecoder().decode([String: Int].self, from: Data(#"{"a":1,"a":2}"#.utf8))
assert(duplicate == ["a": 1])                              // the FIRST duplicate wins
```

The duplicate-key behavior matters beyond curiosity. RFC 8259 says names "SHOULD be unique" and that behavior with duplicates is unpredictable, and parsers disagree: many keep the last value, this one keeps the first. When a request passes through two systems that disagree, such as a gateway that validates `{"role":"reader","role":"admin"}` by reading the last key and a service that acts on the first, a duplicate can smuggle a value past validation. That is a server-side concern, but it is a reason never to treat client-side decoding as validation of what a server will do. `JSONDecoder` also has an `allowsJSON5` option for the more permissive JSON5 syntax; leave it off for API traffic.

## Reading a `DecodingError`

The default description of a `DecodingError` is long, and the useful part, the coding path, is buried in it. A small formatter makes logs readable:

```swift
extension DecodingError {
    var summary: String {
        func path(_ context: Context) -> String {
            context.codingPath.map { key in
                key.intValue.map { "[\($0)]" } ?? ".\(key.stringValue)"
            }.joined()
        }
        switch self {
        case .keyNotFound(let key, let context):
            return "missing key \(path(context)).\(key.stringValue)"
        case .valueNotFound(let type, let context):
            return "null at \(path(context)), expected \(type)"
        case .typeMismatch(let type, let context):
            return "wrong type at \(path(context)), expected \(type)"
        case .dataCorrupted(let context):
            return "corrupted at \(path(context).isEmpty ? "<root>" : path(context)): \(context.debugDescription)"
        @unknown default:
            return "\(self)"
        }
    }
}

struct Stock: Decodable { var id: Int; var count: Int }

func stockError(_ json: String) -> String? {
    do { _ = try JSONDecoder().decode([Stock].self, from: Data(json.utf8)); return nil }
    catch let error as DecodingError { return error.summary }
    catch { return "\(error)" }
}

assert(stockError(#"[{"id":1,"count":2},{"id":2,"count":"x"}]"#) == "wrong type at [1].count, expected Int")
assert(stockError(#"[{"id":1,"count":2},{"id":2}]"#) == "missing key [1].count")
assert(stockError(#"[{"id":1,"count":2},{"id":2,"count":1.5}]"#) == "corrupted at <root>: The given data was not valid JSON.")
```

The last assertion records a real trap. A number that does not fit the target type, `1.5` for an `Int`, or a value larger than `Int.max`, is reported as `dataCorrupted` with an **empty coding path** and the message "The given data was not valid JSON." The JSON is perfectly valid. The precise reason is in the underlying error, `"Number 1.5 is not representable in Swift."`, and the location is lost. When you see this error for a payload that parses fine elsewhere, look for numbers that are too large or fractional where the model expects an integer.

## How long decoding takes

Decoding cost grows with the payload, and on the main actor every millisecond of it is a millisecond the UI cannot respond. To put numbers on it, the benchmark below encodes 10,000 books, about 1.5 MB of JSON, and decodes them repeatedly:

```swift
struct CatalogEntry: Codable {
    var id: String
    var title: String
    var authors: [String]
    var year: Int
    var rating: Double
    var available: Bool
    var published: Date
}

let entries = (0..<10_000).map { index in
    CatalogEntry(id: "b-\(index)", title: "Title number \(index)", authors: ["Author A", "Author B"],
                 year: 1900 + index % 120, rating: Double(index % 50) / 10, available: index.isMultiple(of: 2),
                 published: Date(timeIntervalSince1970: Double(index) * 86_400))
}
let catalogEncoder = JSONEncoder()
catalogEncoder.dateEncodingStrategy = .iso8601
let catalogData = try catalogEncoder.encode(entries)

let catalogDecoder = JSONDecoder()
catalogDecoder.dateDecodingStrategy = .iso8601
var timings: [Duration] = []
for _ in 0..<5 {
    let start = ContinuousClock.now
    let decoded = try catalogDecoder.decode([CatalogEntry].self, from: catalogData)
    timings.append(ContinuousClock.now - start)
    assert(decoded.count == 10_000)
}
print("\(catalogData.count) bytes, fastest decode \(timings.min()!)")
```

On an M1 Ultra, the fastest of seven runs in an optimized (`-O`) build took 40 ms, or about 4 µs per book. The same payload with dates decoded as plain strings took 31 ms, so ISO 8601 parsing accounted for almost a quarter of the time. Parsing alone with `JSONSerialization`, without mapping onto types, took 12 ms. A debug build measured the same 41 ms, because the work happens inside Foundation, which is always optimized; a phone, however, is slower than this desktop.

A display at 60 Hz gives each frame about $$1000/60 \approx 16.7$$ ms, and at 120 Hz about 8.3 ms, shared with layout and rendering. At 4 µs per item, decoding more than about 2,000 items in one go on the main actor costs a 120 Hz frame:

$$
n_{\max} \approx \frac{8.3\ \text{ms}}{4\ \mu\text{s}} \approx 2\,000\ \text{items}
$$

The fix is to decode where waiting happens: off the main actor. Since Swift 6.2, a `@concurrent` function always runs on the concurrent pool, so a view model can await it without blocking the UI:

```swift
@concurrent
func decodeCatalog(_ data: Data) async throws -> [CatalogEntry] {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode([CatalogEntry].self, from: data)
}

@MainActor
final class CatalogModel {
    var entries: [CatalogEntry] = []

    func show(_ data: Data) async throws {
        entries = try await decodeCatalog(data)  // decoding runs off the main actor
    }
}

let model = CatalogModel()
try await model.show(catalogData)
assert(model.entries.count == 10_000)
```

`CatalogEntry` is implicitly `Sendable` here because every stored property is, which is what lets the decoded array cross back to the main actor. [The executors article](/swift-executors/) explains when `@concurrent` is the right tool, and why a nonisolated `async` function without it would, under the Swift 6.2 default, have run on the main actor anyway.

## Summary

- Prefer explicit `CodingKeys` to `.convertFromSnakeCase`, which mishandles acronyms and does not round-trip with `.convertToSnakeCase`.
- Absent and `null` both decode as `nil` for optionals; a wrong type still throws. Optional does not mean "anything goes."
- `Int` holds 64-bit integers exactly; `Double` is exact only up to $$2^{53}$$. Send large IDs as strings, and money as `Decimal`, a string, or integer cents.
- Configure date decoding explicitly. On macOS 26 `.iso8601` accepts fractional seconds but not date-only values; a custom strategy with `Date.ISO8601FormatStyle` pins behavior across OS versions.
- Give server-driven enums an `unknown` case, and use a discriminator for heterogeneous lists.
- Decode independent list items individually so one bad element does not empty the list, and report what was skipped.
- The parser accepts a BOM and trailing commas, and keeps the first of duplicate keys.
- An out-of-range or fractional number for an `Int` is reported as `dataCorrupted` at the root with a misleading message.
- Decoding cost is about 4 µs per moderate item in an optimized build; decode large payloads off the main actor.

## Exercise

Extend `Lossy` so that it reports each failure as a `DecodingError.summary` string with the element's index prefixed to the path, and write a test with a 1,000-element array in which 1% of elements have a random defect (missing key, wrong type, `null`, or fractional integer). Assert that exactly the defective indices are reported. Then measure how much slower `Lossy<Book>` is than `[Book]` on a payload with no defects, and decide whether the difference matters for your largest list.

## Further reading

- Apple's [Encoding and Decoding Custom Types](https://developer.apple.com/documentation/foundation/encoding-and-decoding-custom-types).
- [RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259), especially §4 on duplicate names and §6 on number interoperability.
- The [swift-foundation](https://github.com/swiftlang/swift-foundation) repository, which contains the `JSONDecoder` implementation measured here.
- [Bishop Fox, *An Exploration of JSON Interoperability Vulnerabilities*](https://bishopfox.com/blog/json-interoperability-vulnerabilities), on duplicate keys and parser disagreements.

Previous: [Building Typed Endpoints and Request Bodies](/swift-typed-endpoints/). Next: [Validating Decoded Data Before It Reaches the UI](/swift-validating-decoded-data/).

Return to the [Networking roadmap](/swift-networking/).
