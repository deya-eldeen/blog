---
layout: post
hidden: true
title: "Hash Tables in Swift: Collisions, Resizing, and Stable Key Contracts"
date: "2023-04-27"
last_modified_at: "2023-04-27"
permalink: /swift-hash-tables/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A hash table uses a key's hash to narrow a lookup to a small part of its storage. Equality still decides whether the key actually matches. Confusing those two responsibilities causes bugs ranging from lost entries to caches that mysteriously stop finding their own keys.

Swift's `Dictionary` is normally the right implementation to use. Building a small separate-chaining table makes its contracts and complexity assumptions visible without claiming to reproduce the standard library's internal representation.

<!--more-->

The code uses Swift 5.7. Keys and values are ordinary in-memory values; hash values are never written to a file or used as stable identifiers.

## Hashing selects candidates; equality identifies the entry

A finite set of buckets cannot give every possible key its own bucket. Collisions are inevitable. Separate chaining stores a small list of entries in each bucket and compares keys within that list.

$$
\alpha=\frac{n}{b},\qquad E[T_{\mathrm{lookup}}]=O(1+\alpha)
$$

Here `n` is entries, `b` is buckets, and the expectation assumes well-distributed hashes. Keeping the load factor bounded supports expected constant-time lookup for bounded-cost keys. A bucket containing every key still takes linear work.

```mermaid
flowchart LR
    accTitle: Hash table lookup checks equality after selecting a bucket
    Key[Lookup key] --> Hash[Compute hash]
    Hash --> Bucket[Select bucket]
    Bucket --> Compare[Compare candidate keys]
    Compare --> Value[Matching value or absence]
```

## Implement an intentionally small table

```swift
struct ChainedMap<Key: Hashable, Value> {
    private var buckets: [[(key: Key, value: Value)]]
    private(set) var count = 0

    init(bucketCount: Int = 8) {
        precondition(bucketCount > 0)
        buckets = Array(repeating: [], count: bucketCount)
    }

    private func bucket(for key: Key) -> Int {
        Int(UInt(bitPattern: key.hashValue) % UInt(buckets.count))
    }

    func value(for key: Key) -> Value? {
        buckets[bucket(for: key)].first { $0.key == key }?.value
    }

    mutating func set(_ value: Value, for key: Key) {
        let b = bucket(for: key)
        if let i = buckets[b].firstIndex(where: { $0.key == key }) {
            buckets[b][i].value = value
            return
        }
        buckets[b].append((key, value))
        count += 1
        if count > buckets.count * 3 / 4 { grow() }
    }

    mutating func remove(_ key: Key) -> Value? {
        let b = bucket(for: key)
        guard let i = buckets[b].firstIndex(where: { $0.key == key }) else { return nil }
        count -= 1
        return buckets[b].remove(at: i).value
    }

    private mutating func grow() {
        let entries = buckets.flatMap { $0 }
        buckets = Array(repeating: [], count: buckets.count * 2)
        count = 0
        for entry in entries { set(entry.value, for: entry.key) }
    }
}

var names = ChainedMap<Int, String>()
names.set("Maya", for: 1)
names.set("Updated", for: 1)
assert(names.count == 1 && names.value(for: 1) == "Updated")
assert(names.remove(1) == "Updated")
assert(names.value(for: 1) == nil && names.count == 0)
```

The table updates an existing equal key rather than creating a duplicate. Resizing rehashes entries because a new bucket count changes the modulo result. Copying bucket positions without redistributing entries would break lookup.

The example assumes feasible capacities whose doubling fits `Int`. A reusable container needs a deliberate capacity failure policy and additional collection API design. It also allocates a temporary flattened entry array during growth, so the peak memory includes both generations of storage and that temporary.

## Equal keys must hash consistently

`Hashable` requires equal keys to feed consistent equality-relevant information into the hasher. Unequal keys may collide. A deliberately terrible but legal hash illustrates the difference:

```swift
struct CollisionKey: Hashable {
    let id: Int
    func hash(into hasher: inout Hasher) { hasher.combine(0) }
}

var collisions = ChainedMap<CollisionKey, Int>()
for id in 0..<40 { collisions.set(id * 2, for: CollisionKey(id: id)) }
for id in 0..<40 { assert(collisions.value(for: CollisionKey(id: id)) == id * 2) }
assert(collisions.count == 40)
assert(collisions.remove(CollisionKey(id: 12)) == 24)
assert(collisions.value(for: CollisionKey(id: 13)) == 26)

var optionalValues = ChainedMap<Int, Int?>()
optionalValues.set(nil, for: 1)
let presentNil: Int?? = optionalValues.value(for: 1)
assert(presentNil != nil && presentNil! == nil)
assert(optionalValues.value(for: 2) == nil)
```

Correctness survives even though performance degrades. A test suite that only uses well-distributed integer keys can miss collision-handling defects.

Do not mutate equality-relevant state of a reference key after insertion. The entry remains in a bucket chosen by its earlier hash, while a new lookup may search another bucket. Prefer immutable key values such as IDs.

## Resizing is amortized work

Growing a table is linear in the entries redistributed, plus their hashing costs. Geometric growth spreads that work across many inserts. It does not make the insertion triggering growth constant-time in isolation.

A fixed small bucket count would eventually permit large chains. A table that resizes by one bucket on every insertion could spend quadratic total work redistributing entries. The growth policy is part of the complexity argument.

This implementation does not shrink. That avoids oscillation near a threshold but can retain memory after many removals. A production policy can use distinct growth and shrink thresholds to avoid repeatedly reallocating around one boundary.

## Dictionary ordering is a separate contract

A hash table associates keys with values; it does not define the business ordering of search results or report rows. Sort explicitly or keep a separate ordered sequence when presentation order matters.

Likewise, Swift's randomized hashing means `hashValue` is unsuitable as an on-disk key, network identifier, or content fingerprint. Persist the original key or use a specified stable digest when the domain needs one.

For strings, hash and equality costs depend on their contents. Expected constant bucket work is not a promise that arbitrarily long keys cost constant time.

## Test updates, collisions, and resizing together

Insert enough keys to force several growth steps, overwrite some, remove others, and compare every lookup against a standard dictionary reference model. Retain a copy before mutating if the wrapper claims value semantics.

Include missing keys and optional values. For `Value == Int?`, a present entry containing nil differs from an absent entry; the outer return optional represents lookup success. Do not flatten that distinction accidentally.

## Open addressing changes deletion rules

Separate chaining removes an entry from one bucket list. An open-addressed table instead probes other slots when a collision occurs. Encountering a truly empty slot can terminate lookup, while a previously occupied slot removed from the middle of a probe chain cannot always become an ordinary empty slot.

A tombstone or a backward-shift deletion scheme preserves the ability to find later entries. Without it, inserting colliding keys, deleting the first, and looking up the second can fail despite the second still occupying storage.

This is why an implementation detail from one collision strategy should not be copied into another. The standard-library dictionary's precise storage layout is not the public contract taught by this chained example.

## Use a reference model across a mixed workload

```swift
var testedMap = ChainedMap<Int, Int>()
var mapModel: [Int: Int] = [:]
for step in 0..<120 {
    let key = step % 17
    if step % 4 == 0 {
        assert(testedMap.remove(key) == mapModel.removeValue(forKey: key))
    } else {
        testedMap.set(step, for: key)
        mapModel[key] = step
    }
    assert(testedMap.count == mapModel.count)
    for candidate in 0..<20 { assert(testedMap.value(for: candidate) == mapModel[candidate]) }
}
```

The small repeated-key domain forces overwrite and removal behavior while growth still occurs. A second run using deliberately colliding keys isolates collision handling from ordinary hash distribution.

Reference agreement is strongest when combined with explicit contract examples. Two independently written tables are unlikely to share a storage bug, but both could still implement the wrong duplicate policy for the application.

## Exercise: instrument the chains

Expose a diagnostic maximum-chain length without exposing mutable buckets. Compare ordinary integer keys with `CollisionKey`. Verify that both produce correct lookups, then measure how comparison counts grow. Explain why resizing cannot fix a hash function that maps every key identically.

See Swift's [Hashable documentation](https://developer.apple.com/documentation/swift/hashable) for the equality and hashing contract.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
