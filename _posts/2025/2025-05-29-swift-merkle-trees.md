---
layout: post
hidden: true
title: "Merkle Trees in Swift: Commitments, Inclusion Proofs, and Canonical Encoding"
date: "2025-05-29"
last_modified_at: "2025-05-29"
permalink: /swift-merkle-trees/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A Merkle tree commits to a collection through hashes of its leaves and internal nodes. An inclusion proof lets a verifier check one leaf using logarithmic sibling data rather than receiving the entire collection.

The security argument depends on more than calling SHA-256. Leaf encoding, internal-node encoding, ordering, tree shape, and the trusted root must all be specified.

<!--more-->

These Swift 5.7 examples use CryptoKit, available before this article's May 2025 date. The tree preserves leaf order, duplicates the final node at odd-width levels, and binds the original leaf count into the final commitment.

## Separate leaves, parents, and the outer commitment

For payload `x` and child digests `l, r`, define:

$$
L(x)=H(0x00\Vert x),\qquad P(l,r)=H(0x01\Vert l\Vert r).
$$

Domain prefixes prevent the same bytes from being interpreted ambiguously as both a leaf and an internal node. The final root also includes a distinct prefix and a fixed-width big-endian leaf count.

```swift
import Foundation
import CryptoKit

func digest(_ data: Data) -> Data { Data(SHA256.hash(data: data)) }
func leafHash(_ payload: Data) -> Data { digest(Data([0]) + payload) }
func parentHash(_ left: Data, _ right: Data) -> Data { digest(Data([1]) + left + right) }
func committedRoot(_ treeRoot: Data, count: Int) -> Data {
    let encoded = Data((0..<8).map { offset in
        UInt8(truncatingIfNeeded: UInt64(count) >> (8 * (7 - offset)))
    })
    return digest(Data([3]) + encoded + treeRoot)
}

struct MerkleProof {
    let index: Int
    let leafCount: Int
    let siblings: [Data]
}

struct MerkleTree {
    private let levels: [[Data]]
    let leafCount: Int
    init(_ payloads: [Data]) {
        leafCount = payloads.count
        var built: [[Data]] = []
        if !payloads.isEmpty {
            built.append(payloads.map(leafHash))
            while built.last!.count > 1 {
                let current = built.last!
                var next: [Data] = []
                for index in stride(from: 0, to: current.count, by: 2) {
                    let right = index + 1 < current.count ? current[index + 1] : current[index]
                    next.append(parentHash(current[index], right))
                }
                built.append(next)
            }
        }
        levels = built
    }
    var root: Data {
        committedRoot(levels.last?.first ?? digest(Data([2])), count: leafCount)
    }
    func proof(at index: Int) -> MerkleProof? {
        guard (0..<leafCount).contains(index) else { return nil }
        var position = index
        var siblings: [Data] = []
        for level in levels.dropLast() {
            let sibling = position ^ 1
            siblings.append(level[sibling < level.count ? sibling : position])
            position /= 2
        }
        return MerkleProof(index: index, leafCount: leafCount, siblings: siblings)
    }
}
```

Without the outer count binding, duplicating the last node can make a three-leaf tree share a tree root with a four-leaf tree whose final leaf repeats the third. This format deliberately distinguishes those commitments.

## Verify the expected shape as well as the hashes

```swift
func verify(payload: Data, proof: MerkleProof, root: Data) -> Bool {
    guard proof.leafCount > 0, (0..<proof.leafCount).contains(proof.index), root.count == 32 else {
        return false
    }
    var current = leafHash(payload)
    var index = proof.index
    var width = proof.leafCount
    var used = 0
    while width > 1 {
        guard used < proof.siblings.count else { return false }
        let sibling = proof.siblings[used]
        guard sibling.count == 32 else { return false }
        if index % 2 == 0 {
            if index + 1 == width && sibling != current { return false }
            current = parentHash(current, sibling)
        } else {
            current = parentHash(sibling, current)
        }
        index /= 2
        width = width / 2 + width % 2
        used += 1
    }
    guard used == proof.siblings.count else { return false }
    return committedRoot(current, count: proof.leafCount) == root
}

let payloads = ["A", "B", "C"].map { Data($0.utf8) }
let tree = MerkleTree(payloads)
let proof = tree.proof(at: 2)!
assert(verify(payload: payloads[2], proof: proof, root: tree.root))
assert(!verify(payload: Data("changed".utf8), proof: proof, root: tree.root))
assert(MerkleTree(payloads + [payloads[2]]).root != tree.root)
let extra = MerkleProof(index: 2, leafCount: 3, siblings: proof.siblings + [Data(repeating: 0, count: 32)])
assert(!verify(payload: payloads[2], proof: extra, root: tree.root))
```

Orientation follows the authenticated leaf position rather than untrusted left/right flags. Exact sibling count prevents accepting arbitrary extra proof material. The odd-node check enforces this format's duplication rule.

The public helper assumes a nonnegative count when encoding a commitment. `MerkleTree` supplies array counts, and verification validates proof counts before calling it. A general serialization API should enforce those preconditions itself.

## The root needs an authenticated origin

A proof establishes consistency with the supplied root. An attacker replacing both data and root can create a perfectly valid proof for different content.

Obtain roots from a trusted signature, authenticated channel, checkpoint, or another specified trust mechanism. A content hash is an integrity commitment, not an identity certificate by itself.

Likewise, the tree does not encrypt payloads. A public root or proof may support guessing attacks against a small known payload space; hashing alone does not hide predictable content.

## Order and serialization define identity

Reordering leaves changes the commitment. If the domain treats records as an unordered set, canonicalize ordering by stable identifiers before building the tree and define duplicate handling.

Payload serialization must also be canonical. Equivalent dictionaries encoded in different key orders can produce different leaf hashes. Include type and schema information when distinct record formats could share the same raw byte representation.

This example is an application format, not a Bitcoin or certificate-transparency wire-format implementation. Those systems define their own tree shapes and proof semantics.

## Account for bytes as well as nodes

Building hashes all payload bytes plus a linear number of fixed-size internal digests. Retaining all levels uses `O(n)` digests. An inclusion proof contains `O(log n)` siblings, and verification hashes that many parent pairs plus the payload.

For streaming construction, a frontier of partial subtree roots can reduce retained storage when proofs are not needed immediately. Serving arbitrary historical proofs requires additional storage or recomputation.

## Update paths and append paths have different shape effects

Replacing one leaf in a fixed-size tree requires recalculating only its ancestors, giving logarithmic parent-hash work once the leaf position is known. The leaf's own byte hashing still depends on payload size.

Appending changes the leaf count and can create new tree levels or alter odd-node duplication paths. The outer commitment must be recomputed even when part of the inner tree remains shared.

A persistent tree can retain historical roots while sharing unchanged subtrees. Keeping a root alone proves a commitment but does not guarantee the application retained enough data to serve every historical inclusion proof.

## Membership does not prove completeness

An inclusion proof shows that one payload occupies a specified leaf position under the root. It does not show that the collection contains every event that should have been recorded, nor that no event was omitted before the root was created.

An audit system needs a protocol for sequencing, publication, and consistency between successive roots. A signed dishonest root still commits faithfully to the dishonest collection it describes.

Likewise, a proof of nonmembership requires another structure or ordering argument. Failure to provide an inclusion proof is not a cryptographic proof that a key is absent.

## Make adversarial metadata part of the tests

```swift
let wrongIndex = MerkleProof(index: 1, leafCount: proof.leafCount, siblings: proof.siblings)
assert(!verify(payload: payloads[2], proof: wrongIndex, root: tree.root))
let wrongCount = MerkleProof(index: 2, leafCount: 4, siblings: proof.siblings)
assert(!verify(payload: payloads[2], proof: wrongCount, root: tree.root))
let singleton = MerkleTree([Data("one".utf8)])
assert(verify(payload: Data("one".utf8), proof: singleton.proof(at: 0)!, root: singleton.root))
```

These checks protect the format's position and count commitments, not merely SHA-256 arithmetic. Keep them when refactoring proof transport or serialization.

## Exercise: test the format as an adversarial boundary

Try wrong indices, altered counts, missing siblings, extra siblings, reordered siblings, and odd-width levels. Verify one-leaf trees with empty proofs and empty trees without inclusion proofs. Add serialized proof limits before decoding attacker-supplied arrays.

For the hashing API, see [CryptoKit](https://developer.apple.com/documentation/cryptokit). Continue with [Cryptographic Algorithms](/swift-cryptographic-algorithms/) for the distinction between hashing, key agreement, and authentication.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
