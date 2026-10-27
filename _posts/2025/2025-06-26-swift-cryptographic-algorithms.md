---
layout: post
hidden: true
title: "Cryptographic Algorithms in Swift: SHA-256, X25519, and Derived Keys"
date: "2025-06-26"
last_modified_at: "2025-06-26"
permalink: /swift-cryptographic-algorithms/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Hashing, key agreement, key derivation, and authenticated encryption solve different problems. SHA-256 produces a deterministic digest. Diffie-Hellman-style agreement lets two private-key holders derive shared secret material. Neither operation by itself authenticates a remote person's identity or encrypts an application message.

A useful Swift treatment connects the mathematics to established APIs and makes those boundaries explicit, rather than presenting toy modular arithmetic as a deployable protocol.

<!--more-->

The examples use Swift 5.7 syntax and Apple's CryptoKit, introduced in 2019. X25519 is specified in [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748). The local two-party demonstration is not a complete network handshake.

## SHA-256 commits to bytes, not an abstract object

```swift
import Foundation
import CryptoKit

let message = Data("abc".utf8)
let hash = SHA256.hash(data: message)
let hexadecimal = hash.map { String(format: "%02x", Int($0)) }.joined()
assert(hexadecimal == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
assert(SHA256.hash(data: message) == hash)
```

The encoding is explicit UTF-8. Hashing a record requires a canonical byte serialization: field order, integer endianness, string normalization, and schema version all matter.

For `B` input bytes, hashing takes linear processing work while the SHA-256 digest remains 32 bytes. A streaming hash can process chunks without retaining the entire message. Constant output size is not constant input-processing time.

A digest is not encryption and has no decryption key. A plain hash also does not authenticate who supplied the message. For shared-key message authentication, use an established MAC such as HMAC through its API, not a homemade concatenation construction.

## Security properties have different work factors

For an ideal `b`-bit hash, generic preimage search has work on the scale of `2ᵇ`, while collision search has birthday-scale work around `2^(b/2)`. These are idealized attack-cost models, not runtime benchmarks of this program.

$$
P(\text{collision among }q\text{ random digests})\approx
1-e^{-q(q-1)/2^{b+1}}.
$$

A small hash table deliberately tolerates collisions and resolves equality afterward. A cryptographic commitment instead depends on collisions being infeasible to find. Swift's randomized `Hasher` serves the former purpose and is not a substitute for SHA-256.

Password storage is another problem. Fast hashing makes bulk password guesses cheap. Use a dedicated password-hashing design with appropriate work and memory factors; do not treat the digest example as a password database recipe.

## Diffie-Hellman establishes shared material

Classical finite-field notation writes public values as `A = gᵃ mod p` and `B = gᵇ mod p`, with both sides deriving `gᵃᵇ mod p`. X25519 uses a specified elliptic-curve operation instead of that toy representation.

CryptoKit generates private keys and performs the operation:

```swift
let alice = Curve25519.KeyAgreement.PrivateKey()
let bob = Curve25519.KeyAgreement.PrivateKey()
let aliceSecret = try alice.sharedSecretFromKeyAgreement(with: bob.publicKey)
let bobSecret = try bob.sharedSecretFromKeyAgreement(with: alice.publicKey)

let context = Data("example-v1/client-to-server".utf8) +
    alice.publicKey.rawRepresentation + bob.publicKey.rawRepresentation
let salt = Data("public example session salt".utf8)
let aliceKey = aliceSecret.hkdfDerivedSymmetricKey(
    using: SHA256.self, salt: salt, sharedInfo: context, outputByteCount: 32
)
let bobKey = bobSecret.hkdfDerivedSymmetricKey(
    using: SHA256.self, salt: salt, sharedInfo: context, outputByteCount: 32
)
let aliceBytes = aliceKey.withUnsafeBytes { Data($0) }
let bobBytes = bobKey.withUnsafeBytes { Data($0) }
assert(aliceBytes == bobBytes)
```

The equality check is a local test and does not print secret bytes. Application logs should not retain private keys, shared secrets, or derived keys.

HKDF turns shared material into a purpose-specific symmetric key. Its context binds the demonstrated role and public-key ordering. A reverse-direction key should use a distinct context rather than reuse this label indiscriminately.

The salt need not be secret. A real protocol defines how it is selected and authenticated, along with the exact transcript and encoding. The fixed text here keeps the local example reproducible in structure while fresh private keys still vary each run.

## Authenticate the public-key exchange

An attacker who substitutes public keys can establish a different shared key with each endpoint. Both local agreement operations may succeed while the endpoints are communicating through the attacker.

A complete protocol authenticates peers or their key exchange through a trusted mechanism, such as validated certificates or pinned signing keys. Including exchanged keys in HKDF context binds bytes into derivation but does not establish whose keys they are.

Prefer established secure transport or protocol implementations for network features. This article's purpose is to understand the primitives' roles and test their composition locally.

## Use authenticated encryption for message bytes

```swift
let plaintext = Data("delivery instructions".utf8)
let sealed = try AES.GCM.seal(plaintext, using: aliceKey, authenticating: context)
let opened = try AES.GCM.open(sealed, using: bobKey, authenticating: context)
assert(opened == plaintext)

var tampered = Array(sealed.combined!)
tampered[tampered.count - 1] ^= 1
do {
    let altered = try AES.GCM.SealedBox(combined: Data(tampered))
    _ = try AES.GCM.open(altered, using: bobKey, authenticating: context)
    assertionFailure("Modified authenticated ciphertext must fail")
} catch {
    // Expected: the altered tag or ciphertext is rejected.
}
```

The default seal operation generates its nonce. Nonce reuse under one GCM key is dangerous; do not replace generation with a counter or constant without a complete uniqueness and lifecycle design.

The combined representation is available for this standard nonce size. A production decoder should handle malformed containers as errors rather than force-unwrapping untrusted input.

Authenticated additional data is checked but not encrypted. It can bind version, direction, or record metadata to the ciphertext. Both parties must use the identical bytes.

## Test vectors and negative tests serve different purposes

The SHA-256 vector checks a known deterministic output. Random key agreement checks both parties derive compatible keys. Tampering, wrong associated data, wrong peer keys, and malformed public-key bytes test rejection behavior.

These tests do not prove side-channel resistance or protocol security. The established primitive implementation supplies properties that should not be reimplemented in ordinary Swift loops with data-dependent secret branching.

Resource limits matter at the parser boundary too: validate message lengths and formats before allocating huge buffers. Keep cryptographic failures distinct from successful empty plaintext.

## Derive separate keys for separate purposes

```swift
let reverseContext = Data("example-v1/server-to-client".utf8) +
    alice.publicKey.rawRepresentation + bob.publicKey.rawRepresentation
let reverseKey = aliceSecret.hkdfDerivedSymmetricKey(
    using: SHA256.self, salt: salt, sharedInfo: reverseContext, outputByteCount: 32
)
let reverseBytes = reverseKey.withUnsafeBytes { Data($0) }
assert(reverseBytes != aliceBytes)
do {
    _ = try AES.GCM.open(sealed, using: bobKey, authenticating: reverseContext)
    assertionFailure("A different context must not authenticate this record")
} catch {}
```

Distinct derivation labels separate traffic directions, while authenticated data binds a particular record to its context. These mechanisms are complementary rather than interchangeable.

A protocol also needs record sequence numbers or another replay policy. Successfully authenticating a previously valid ciphertext does not prove it is fresh. Replaying the same message can be harmful even when no cryptographic bit has been altered.

## Public-key encoding is an input boundary

Received key bytes should be decoded through the established public-key initializer and failures handled before key agreement. Do not accept an arbitrary byte array as a key merely because its length looks plausible.

The wire format should identify the protocol and algorithm version unambiguously. Negotiation itself must be authenticated against downgrade behavior in a complete design.

This is why local agreement and encryption snippets are best understood as primitive tests. They demonstrate compatibility and rejection behavior within a fixed context, while a deployed channel additionally defines identities, freshness, negotiation, lifetime, and recovery.

## Hash a stream without changing its byte identity

```swift
var incremental = SHA256()
incremental.update(data: Data("a".utf8))
incremental.update(data: Data("bc".utf8))
assert(incremental.finalize() == hash)
```

Chunk boundaries do not change the digest of the same concatenated bytes. That permits a file reader to feed bounded buffers rather than load an entire file into memory.

The reader still needs failure handling. A digest calculated from a truncated stream is a valid digest of the truncated bytes, not evidence that the intended full file was read. Preserve expected length or an authenticated manifest when completeness matters.

Do not compare a partially calculated digest with an expected value until all reads have succeeded. A resource-efficient implementation and a trustworthy integrity workflow are separate properties.

## Exercise: bind direction and version

Derive a second key using a server-to-client label and verify its bytes differ from the first. Test opening a message with the wrong direction key and wrong associated data. Explain which facts those failures establish and why they still do not authenticate an unauthenticated public-key exchange.

See Apple's [CryptoKit documentation](https://developer.apple.com/documentation/cryptokit) for the supported primitive APIs.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
