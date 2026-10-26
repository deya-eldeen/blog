---
layout: post
hidden: true
title: "Iterators and Sequences in Swift: Pull Values Without Assuming Replay"
date: "2024-01-18"
last_modified_at: "2024-01-18"
permalink: /swift-iterators-sequences/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Sequence, Iterators]
thumbnail: assets/img/article-placeholder.svg
---
A `for` loop asks an iterator for the next element until the iterator says it has finished. The sequence supplying that iterator might be an array, a computed progression, or a stream tied to mutable external state.

That shared interface makes generic transformations possible, but it does not promise random access, a known length, or repeatable traversal. Good sequence code depends only on the guarantees it actually receives.

<!--more-->

The examples use Swift 5.7 and synchronous sequences. An iterator's `next()` is not an asynchronous read; waiting for network data belongs to a different contract.

## Implement a small repeatable sequence

```swift
struct Countdown: Sequence {
    let start: Int

    init(from start: Int) {
        precondition(start >= 0)
        self.start = start
    }

    struct Iterator: IteratorProtocol {
        private var remaining: Int?

        init(start: Int) { remaining = start }

        mutating func next() -> Int? {
            guard let current = remaining else { return nil }
            remaining = current == 0 ? nil : current - 1
            return current
        }
    }

    func makeIterator() -> Iterator { Iterator(start: start) }
}

let countdown = Countdown(from: 3)
assert(Array(countdown) == [3, 2, 1, 0])
assert(Array(countdown) == [3, 2, 1, 0])

var iterator = countdown.makeIterator()
assert(iterator.next() == 3)
assert(iterator.next() == 2)
assert(Array(Countdown(from: 0)) == [0])
```

The sequence stores configuration; the iterator stores traversal state. Calling `makeIterator()` creates an independent cursor, so this particular sequence is repeatable.

An optional `remaining` avoids a negative sentinel and the risk of decrementing an extreme value after exhaustion. The input precondition defines a programmer-facing domain. A public parser accepting arbitrary start values should validate them before construction.

Once our iterator returns `nil`, later calls continue to return `nil`. Consumers should treat the first nil as the end; they must not expect a finished iterator to restart itself.

## Sequence does not guarantee an independent second pass

```swift
final class IntCursor {
    private let values: [Int]
    private var index = 0

    init(_ values: [Int]) { self.values = values }

    func next() -> Int? {
        guard index < values.count else { return nil }
        defer { index += 1 }
        return values[index]
    }
}

struct OnePassNumbers: Sequence {
    let cursor: IntCursor

    func makeIterator() -> AnyIterator<Int> {
        AnyIterator { cursor.next() }
    }
}

let stream = OnePassNumbers(cursor: IntCursor([4, 5, 6]))
assert(Array(stream) == [4, 5, 6])
assert(Array(stream).isEmpty)
```

The iterators share one cursor. That can model a consumable source, and it is why a generic function must not assume any `Sequence` supports a fresh replay.

A function that counts elements in one pass and transforms them in a second can fail for such a source. If the algorithm needs replay, materialize an array intentionally or require a stronger abstraction with the needed guarantees.

Materializing also requires a finite source and enough memory. It is a design decision, not a universal compatibility fix.

## Write a generic algorithm with one pass

```swift
struct IntegerStatistics: Equatable {
    let count: Int
    let sum: Int
    let maximum: Int?
}

func statistics<S: Sequence>(_ source: S) -> IntegerStatistics where S.Element == Int {
    var count = 0
    var sum = 0
    var maximum: Int?
    for value in source {
        count += 1
        sum += value
        maximum = maximum.map { Swift.max($0, value) } ?? value
    }
    return IntegerStatistics(count: count, sum: sum, maximum: maximum)
}

assert(statistics(Countdown(from: 3)) ==
    IntegerStatistics(count: 4, sum: 6, maximum: 3))
assert(statistics([Int]()) ==
    IntegerStatistics(count: 0, sum: 0, maximum: nil))
let once = OnePassNumbers(cursor: IntCursor([4, 5, 6]))
assert(statistics(once) == IntegerStatistics(count: 3, sum: 15, maximum: 6))
```

The maximum is optional because an empty sequence has no largest element. There is no arbitrary sentinel that might overlap valid input.

The demonstration assumes bounded counts and sums. An unbounded or extremely large source needs checked arithmetic and a stopping policy. A generic `Sequence` constraint alone says nothing about finiteness.

## Optional elements need another optional layer

An iterator returning `Int?` uses nil to signal the end. What if the elements themselves are `Int?`? Its `next()` must return `Int??`: outer nil means exhaustion, while `.some(nil)` is a real element.

```swift
var optionalIterator = [Optional(1), nil, Optional(3)].makeIterator()
let firstElement: Int?? = optionalIterator.next()
let secondElement: Int?? = optionalIterator.next()
let thirdElement: Int?? = optionalIterator.next()
let end: Int?? = optionalIterator.next()
assert(firstElement! == 1)
assert(secondElement != nil && secondElement! == nil)
assert(thirdElement! == 3)
assert(end == nil)
```

A wrapper that accidentally returns the inner nil as the outer nil truncates traversal. This is a common place where understanding nested optionals matters more than flattening them away.

The same distinction appears in parsers and database cursors: “an absent field was read” differs from “no more records exist.” Model both layers deliberately.

## Sequence and Collection answer different questions

`Collection` adds indexed access and multipass traversal guarantees beyond `Sequence`. Stronger protocols such as `BidirectionalCollection` and `RandomAccessCollection` add further operations and complexity expectations.

Do not conform a computed source to `RandomAccessCollection` merely because it can implement an integer subscript by walking from the beginning. That would violate the cost model generic algorithms rely on.

Conversely, do not expose only `Sequence` when consumers genuinely need stable indices and the implementation can supply them. Choose the weakest contract that still expresses the behavior the algorithm requires.

Indices are not universally integers, and advancing an index is not universally constant-time over arbitrary distances. Generic collection code should use the collection's index APIs and honor their complexity.

## Infinite sources need bounded consumers

Swift can build computed sequences with `sequence(first:next:)` or state-driven generation. Such a sequence need not finish. Calling `Array`, `reduce`, or `sorted` on an infinite source never produces a completed result.

Use a bounded consumer such as `prefix` when only the first few values are needed. For a filtered infinite source, even requesting one element can fail to terminate if no future element satisfies the predicate.

This is a termination contract, not merely a memory issue. A server or UI receiving user-defined generation rules needs a work budget as well as an output limit.

## Type erasure is a tradeoff

`AnyIterator` made the one-pass example compact by hiding its concrete iterator type. `AnySequence` can similarly hide a sequence's implementation behind a common interface.

Type erasure can simplify storage and public API boundaries, but may add closure calls or allocation and hide optimization opportunities. Use it when hiding the type solves a real problem; a named iterator like `Countdown.Iterator` is often clearer and cheaper.

The erased type also does not strengthen semantics. Wrapping a one-pass source in `AnySequence` does not make it replayable.

## Test consumption behavior directly

For a custom iterator, test zero or minimum input, one element, several elements, and exhaustion. For a repeatable sequence, create two iterators and advance them independently.

For a one-pass source, verify that a generic algorithm consumes it only once. Include optional elements so absence is not mistaken for exhaustion. If a source owns a file or cursor, separately test resource cleanup and early termination at its adapter boundary.

## Verify early termination through a controlled source

A source that records pulls can show whether a consumer stops after finding its answer:

```swift
final class PullCount {
    var calls = 0
}

func observedNumbers(_ values: [Int], count: PullCount) -> AnySequence<Int> {
    AnySequence {
        var index = 0
        return AnyIterator<Int> {
            count.calls += 1
            guard index < values.count else { return nil }
            defer { index += 1 }
            return values[index]
        }
    }
}

let pulls = PullCount()
let observed = observedNumbers([1, 2, 3, 4], count: pulls)
let firstLarge = observed.first { $0 >= 3 }
assert(firstLarge == 3)
assert(pulls.calls == 3)
```

This test observes the explicitly constructed sequence and the consumer's early-stop requirement. It does not claim every collection optimization has the same internal access count.

The observation object is shared, while each iterator created by this particular factory owns its own index. That means the values are replayable but the instrumentation accumulates across traversals. Repeatability of values and absence of effects are separate properties.

## Resource cleanup needs a lifetime contract

A file-backed sequence may open a file before traversal and close it after exhaustion. What happens if the consumer stops at the first match and never requests the end?

The owner must define cleanup for early exit, not only for normal exhaustion. Options include a scoped callback API, an explicit closeable cursor, or an owner whose lifetime bounds the resource. Relying on a long-lived erased sequence to eventually release the file may keep it open far longer than intended.

`IteratorProtocol.next()` cannot throw. A synchronous source with read failures can make its element a `Result`, expose a separate throwing cursor API, or choose another abstraction. Silently returning nil on every read error conflates failure with clean end-of-file.

This is another reason not to force every source into `Sequence` just because it produces repeated values. The interface must preserve the error and lifetime behavior the consumer needs.

## A sequence algorithm should state its consumption promise

A statistics function consumes to exhaustion. A search stops when it finds a match. A prefix consumer requests a bounded number of output elements, though an upstream filter may inspect many input elements to produce them.

Document that difference when the source is expensive or consumable. A helper named `preview` that secretly counts the entire source before returning five elements can exhaust a cursor or hang on an infinite sequence.

If an algorithm must inspect the source twice, make materialization visible at the call site or require a multipass collection. Hidden buffering can create a large memory cost that callers cannot anticipate from a simple sequence signature.

## Keep indices out of iterator state unless they belong there

The countdown iterator has a numeric state because the generated values are numeric. A generic collection iterator should not assume its source uses integer indices or that advancing by an offset is constant-time.

Strings are a familiar example: a character is not necessarily one byte, and a character position is not an integer byte offset. Generic code that repeatedly starts at the beginning and advances to offset `i` can become quadratic.

Use the collection's iterator for a scan. Use stable indices and the appropriate collection protocol when indexed relationships are part of the algorithm. The abstraction choice should reveal the access pattern rather than hide it behind integer-looking syntax.

## Exercise: implement a bounded progression

Create a sequence of integers from a start value with a positive step and a fixed element count. Store remaining count separately from the current value, and define how arithmetic overflow is handled.

Then write a consumer that finds the first value matching a predicate without materializing the sequence. Verify the source is not consumed past the matching element.

See Apple's [Sequence](https://developer.apple.com/documentation/swift/sequence) and [IteratorProtocol](https://developer.apple.com/documentation/swift/iteratorprotocol) documentation. Continue with [Lazy Sequences](/swift-lazy-sequences/) or return to the [Functional Programming roadmap](/swift-functional-programming/).
