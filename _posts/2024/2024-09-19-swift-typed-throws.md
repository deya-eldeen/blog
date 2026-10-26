---
layout: post
hidden: true
title: "Typed Throws in Swift 6: Carry Error Types Through Protocols"
date: "2024-09-19"
last_modified_at: "2024-09-19"
permalink: /swift-typed-throws/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "POP", "Protocols", "Error Handling", "Swift 6"]
thumbnail: assets/img/article-placeholder.svg
---
Swift 6 lets a throwing function name its error type: `throws(ParseFailure)`. This is useful when a capability has a deliberate failure vocabulary or generic code must preserve the error type supplied by a caller.

Typed throws does not make failure handling automatic, guarantee atomic effects, or justify exposing every low-level transport error to a UI. It makes one part of the contract explicit. A quantity parser shows where that extra precision helps and where an ordinary throwing boundary remains appropriate.

<!--more-->

## Name a closed set of parsing failures

The following examples require a Swift 6 toolchain. Swift 6 became generally available in September 2024; its [release announcement](https://www.swift.org/blog/announcing-swift-6/) describes typed throws alongside the other language changes.

```swift
enum QuantityFailure: Error, Equatable {
    case notAnInteger(String)
    case outsideAllowedRange(Int)
}

protocol QuantityParsing {
    func parse(_ source: String) throws(QuantityFailure) -> Int
}

struct BoundedQuantityParser: QuantityParsing {
    let allowed: ClosedRange<Int>

    func parse(_ source: String) throws(QuantityFailure) -> Int {
        guard let value = Int(source) else {
            throw .notAnInteger(source)
        }
        guard allowed.contains(value) else {
            throw .outsideAllowedRange(value)
        }
        return value
    }
}

let quantityParser = BoundedQuantityParser(allowed: 1...5)
let parsedQuantity = try quantityParser.parse("3")
assert(parsedQuantity == 3)
```

The protocol permits only `QuantityFailure` to escape. The implementation's shorthand `throw .notAnInteger` has enough context to identify the enum.

The range is configuration for this parser instance. The parser does not read a global preference or change the range between fields. If an import must use one consistent policy, construct one parser and keep its configuration stable for that operation.

## Catch code can use the known error type

```swift
func quantityMessage(_ source: String, parser: some QuantityParsing) -> String {
    do {
        return "Quantity: \(try parser.parse(source))"
    } catch {
        switch error {
        case let .notAnInteger(input):
            return "Not an integer: " + input
        case let .outsideAllowedRange(value):
            return "Outside range: \(value)"
        }
    }
}

assert(quantityMessage("three", parser: quantityParser) == "Not an integer: three")
assert(quantityMessage("8", parser: quantityParser) == "Outside range: 8")
```

The implicit `error` is `QuantityFailure`, so the switch can be exhaustive without a cast. Adding another failure case forces relevant exhaustive handling to be reconsidered when source is recompiled.

That can be desirable for an internal domain API. It can also create evolution obligations in a public library whose consumers switch over its errors. Choose the failure type as carefully as any other public result type.

The example includes raw input in a local message to make behavior observable. A real UI should consider whether input contains private data and how messages are localized. The typed enum should represent machine-readable failure meaning; presentation can map it to an appropriate user message.

## Preserve the failure type through a generic algorithm

```swift
func parseQuantities<P: QuantityParsing>(
    _ fields: [String],
    using parser: P
) throws(QuantityFailure) -> [Int] {
    var result: [Int] = []
    for field in fields {
        result.append(try parser.parse(field))
    }
    return result
}

let parsedQuantities = try parseQuantities(["1", "5"], using: quantityParser)
assert(parsedQuantities == [1, 5])
do {
    _ = try parseQuantities(["1", "bad", "2"], using: quantityParser)
    assertionFailure("Malformed input must fail")
} catch {
    assert(error == .notAnInteger("bad"))
}
```

The function returns a complete array only if every field succeeds. Its partial result is local and does not escape on error. That gives the caller an all-or-nothing result value, although it would not undo effects performed by an effectful parser.

The explicit loop also keeps type inference straightforward. Typed closure inference has evolved, and not every context infers a narrower thrown type automatically. Do not infer support for all proposed inference behavior from one successful example.

[SE-0413](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0413-typed-throws.md) records the implemented feature and notes that some originally planned full typed-throws inference work was deferred. When a closure must preserve a particular error type, an explicit annotation can make the intended contract clear.

## Capture a caller's failure type in a result

```swift
func capture<Value, Failure: Error>(
    _ operation: () throws(Failure) -> Value
) -> Result<Value, Failure> {
    do {
        return .success(try operation())
    } catch {
        return .failure(error)
    }
}

let capturedQuantity = capture { () throws(QuantityFailure) -> Int in
    try quantityParser.parse("0")
}
assert(capturedQuantity == .failure(.outsideAllowedRange(0)))
```

The generic error parameter connects the closure's thrown type with the `Result` failure type. There is no conversion through `any Error` and no cast to recover the original static type.

This is a useful relationship when building adapters or higher-order APIs. It does not require every application operation to adopt typed throws. A boundary that intentionally accepts arbitrary failures can continue to use ordinary `throws`.

Also distinguish capturing failure from recovering from it. Returning `Result.failure` records the outcome; it does not retry, log, or select a fallback. Those are policies for the consumer or another explicit layer.

## Typed and untyped throwing functions interoperate in one direction

An operation throwing a specific error can be used where a broader throwing operation is accepted. A caller that only knows ordinary `throws` handles `any Error` and loses the narrower static vocabulary at that boundary.

The reverse requires actual conversion or handling. An implementation that may throw arbitrary transport errors cannot satisfy `throws(QuantityFailure)` merely by declaring conformance. It must map those errors, handle them, or choose a broader contract.

A nonthrowing implementation can satisfy a throwing requirement when its behavior genuinely meets the contract without failure. Do not use that flexibility to create a parser that silently substitutes zero for invalid input if the protocol promises rejection.

## Several failure sources need an explicit combination policy

An import can fail while reading bytes, parsing quantities, or saving records. One typed enum can represent those stages, possibly carrying underlying errors. Another approach keeps infrastructure errors behind adapters and exposes a domain vocabulary such as invalid input, unavailable storage, or permission denied.

Do not assume the compiler automatically synthesizes a convenient public union of every error type called by a function. If the boundary needs one failure type, define and map it deliberately.

A wrapper that stores `any Error` as an associated payload preserves arbitrary causes but also reintroduces an existential inside the error value. That may be entirely appropriate for diagnostics. It means the design no longer has a fully closed set of concrete causes just because the outer enum is named.

## Typed throws does not change cancellation or isolation

An asynchronous implementation still needs a cancellation policy. If its declared failure type cannot represent cancellation, decide whether it maps cancellation into a case, handles it internally, or uses a broader error boundary. Avoid treating cancellation as ordinary unavailability and automatically retrying work the user stopped.

Likewise, error values that cross actor boundaries need appropriate transfer semantics. Small enums with sendable payloads are easier to reason about than errors retaining mutable UI objects or unsynchronized service references.

The parser examples are synchronous and have no shared mutable state. Their simplicity should not be read as a concurrency guarantee supplied by `throws(QuantityFailure)`.

## Choose precision where consumers use it

| Boundary | Useful error choice | Reason |
|---|---|---|
| Domain parser with deliberate cases | Specific typed error | Consumers handle known recoveries |
| Generic wrapper forwarding a caller's error | Generic thrown type | Preserves the caller's relationship |
| Adapter over arbitrary third-party errors | Mapping or broad `throws` | Avoids a dishonest narrow promise |
| Application-level catch-and-report boundary | Often broad | Several independent subsystems can fail |

The best signature reflects a consumer decision. If every caller immediately converts the typed error back to `any Error` without using its cases, review whether the added public precision serves a real purpose.

## Test failure meaning and state after failure

Test a valid number, nonnumeric input, each range boundary, and a value outside each end. For batch parsing, include a failure after at least one valid field so the complete-result guarantee is exercised.

As an exercise, add a line number to a batch failure. Decide whether that belongs in a separate import error wrapping `QuantityFailure` or in the parser's own vocabulary. A parser receiving only one string should not need to know the surrounding file's line numbering merely to satisfy a broad protocol. Keep contextual error mapping at the boundary that owns that context.

## Worked adapter: attach field context without widening the parser

The parser knows one input string. A batch importer knows which field produced it. Keep that context in a separate typed error:

```swift
enum IndexedQuantityFailure: Error, Equatable {
    case invalidField(index: Int, cause: QuantityFailure)
}

func parseIndexedQuantities<P: QuantityParsing>(
    _ fields: [String],
    using parser: P
) throws(IndexedQuantityFailure) -> [Int] {
    var quantities: [Int] = []
    for (index, field) in fields.enumerated() {
        do {
            quantities.append(try parser.parse(field))
        } catch {
            throw .invalidField(index: index, cause: error)
        }
    }
    return quantities
}

do {
    _ = try parseIndexedQuantities(["2", "bad", "4"], using: quantityParser)
    assertionFailure("The second field must fail")
} catch {
    assert(error == .invalidField(index: 1, cause: .notAnInteger("bad")))
}
```

The inner catch retains `QuantityFailure`; the outer operation exposes `IndexedQuantityFailure`. No dynamic cast is required because the types match the two boundaries' responsibilities.

The stored index is zero-based, matching array indexing. A presentation layer can display `index + 1` as a user-facing field number. For a file parser with headers or multiline records, the importer should carry the actual source location instead of assuming the array index is a line number.

The result still appears only after every field succeeds. If persistence is added inside the loop, this guarantee changes: a later parse error could follow earlier committed writes. Keep parsing as a complete value calculation before persistence when the use case requires an all-or-nothing import.

This adapter demonstrates why one enormous error enum shared by every layer is often unnecessary. The parser's vocabulary stays focused, while the importer adds the context it owns. Typed throws preserves those relationships without deciding how the UI should word an error or whether the operation should be retried.

Continue through the [Protocol-Oriented Programming roadmap](/swift-protocol-oriented-programming/).
