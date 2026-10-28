---
layout: post
hidden: true
title: "Optionals as a Functional Tool in Swift"
date: "2023-06-15"
last_modified_at: "2023-06-15"
permalink: /swift-functional-optionals/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Optionals, Modeling]
thumbnail: assets/img/article-placeholder.svg
---
An optional means a value may be absent. That small model supports a useful composition style: transform a present value, chain a transformation that may fail to produce one, and provide a fallback only at the point where absence has a defined meaning.

The danger is using the same `nil` for every situation. Missing configuration, invalid configuration, and unavailable infrastructure may require different responses even when a short optional chain makes them look identical.

<!--more-->

The examples use Swift 5.7 and a small configuration-resolution case study. Parsing policy is deliberately explicit rather than delegated to a global settings service.

## map transforms presence without inventing a default

```swift
let nickname: String? = "Maya"
let greeting = nickname.map { "Hello, " + $0 }
assert(greeting == "Hello, Maya")

let missingNickname: String? = nil
assert(missingNickname.map { "Hello, " + $0 } == nil)
```

The closure runs only when the optional is present. The result remains optional because the operation has not decided what absence means for the caller.

This is useful in a pipeline. A data layer can preserve absence, a presentation layer can transform a present value into display text, and the final UI can choose whether to hide the view or display a placeholder.

Defaulting too early loses that choice. Replacing a missing nickname with an empty string makes the rest of the program unable to distinguish “no nickname supplied” from “an explicitly empty nickname,” unless it stores that fact elsewhere.

## flatMap chains a possibly absent result

```swift
func positiveInteger(_ text: String) -> Int? {
    guard let number = Int(text), number > 0 else { return nil }
    return number
}

let configuredCount: String? = "25"
let count = configuredCount.flatMap(positiveInteger)
assert(count == 25)
assert(Optional("0").flatMap(positiveInteger) == nil)
assert(Optional("bad").flatMap(positiveInteger) == nil)
```

The transform already returns an optional. `flatMap` prevents the extra optional layer that `map` would preserve.

This makes a compact pipeline when every absence leads to the same caller behavior. It is unsuitable when the caller must distinguish missing text, invalid syntax, and an out-of-range value. Those reasons were collapsed by the function's return type before `flatMap` ever ran.

## Optional chaining is another presence-preserving operation

```swift
struct Contact {
    let email: String?
}
struct Account {
    let contact: Contact?
}

let account: Account? = Account(contact: Contact(email: "maya@example.com"))
let emailLength = account?.contact?.email?.count
assert(emailLength == 16)

let noContact: Account? = Account(contact: nil)
assert(noContact?.contact?.email == nil)
```

Chaining is excellent for traversing a model where absence is expected. It does not tell you which link was absent. If the workflow needs to guide the user to add a contact rather than an email address, pattern-match or bind the stages explicitly.

Avoid a very long chain that also validates, normalizes, looks up services, and selects defaults. Named intermediate values can keep the absence policy understandable without changing the underlying behavior.

## A fallback is a product rule

The nil-coalescing operator evaluates its right-hand side only when needed:

```swift
var fallbackCalls = 0
func fallbackCount() -> Int {
    fallbackCalls += 1
    return 20
}

let supplied: Int? = 5
let absent: Int? = nil
assert((supplied ?? fallbackCount()) == 5)
assert(fallbackCalls == 0)
assert((absent ?? fallbackCount()) == 20)
assert(fallbackCalls == 1)
```

This deferred behavior matters if creating the default is expensive or effectful. A default factory can still read a file or mutate state; the operator does not make it pure.

It also matters semantically. Falling back from invalid administrator configuration to a permissive default can be a bug even if the expression is convenient. Decide whether defaults apply to absence only or also to invalid supplied values.

## Case study: resolve a page size from two sources

Suppose an explicit command setting overrides a stored setting, and a missing setting uses 20. A supplied but invalid value should report an error, rather than quietly selecting another source.

```swift
enum PageSizeFailure: Error, Equatable {
    case invalid(source: String, value: String)
}

func parsePageSize(_ text: String, source: String) -> Result<Int, PageSizeFailure> {
    guard let value = Int(text), (1...100).contains(value) else {
        return .failure(.invalid(source: source, value: text))
    }
    return .success(value)
}

func resolvePageSize(
    command: String?,
    stored: String?
) -> Result<Int, PageSizeFailure> {
    if let command = command {
        return parsePageSize(command, source: "command")
    }
    if let stored = stored {
        return parsePageSize(stored, source: "stored")
    }
    return .success(20)
}

assert(resolvePageSize(command: nil, stored: nil) == .success(20))
assert(resolvePageSize(command: nil, stored: "30") == .success(30))
assert(resolvePageSize(command: "10", stored: "30") == .success(10))
assert(resolvePageSize(command: "bad", stored: "30") ==
    .failure(.invalid(source: "command", value: "bad")))
```

The implementation uses ordinary optional binding because the source-specific failure is part of the contract. Functional programming does not require every branch to become `map` or `flatMap`.

By contrast, `command.flatMap(positiveInteger) ?? stored.flatMap(positiveInteger) ?? 20` would treat invalid command text as though no command text existed. It would also fail to enforce the upper bound without another check. A shorter expression can implement a different policy.

## Preserve the reason when absence is insufficient

Use an optional when the only meaningful distinction is value versus no value. Use `Result` when a computation succeeds or fails with a reason. Use a domain enum when several meaningful states are neither simply success nor failure.

A cache lookup might need `.hit(value)`, `.miss`, and `.unavailable(error)`. Turning both miss and unavailable into `nil` makes it impossible to choose between an ordinary fetch and an infrastructure warning.

Similarly, a form field might be untouched, empty, invalid, or valid. One `String?` plus a `Bool` can represent contradictory combinations. A sum type makes the state space explicit; see [Enumerations and Algebraic Data Types](/swift-algebraic-data-types/).

## Absence and emptiness are independent

`[Item]?` can represent no collection or a present empty collection. `String?` can represent no string or a present empty string. Neither automatically decides whether whitespace is meaningful.

An API response with an empty array may mean “loaded successfully, no results,” while `nil` may mean “not loaded.” Replacing both with `[]` simplifies consumers only if the application intentionally discards that distinction.

Dictionary lookup has another useful subtlety: a dictionary whose values are optional can return a nested optional. Missing key and present key with a nil value are separate states. Before flattening, ask whether the key's presence is part of the domain.

## Function laws help review transformations

For a pure transform, mapping the identity function should preserve an optional. Mapping `f` and then `g` should behave like mapping their composition. Those laws make local refactoring easier to assess.

Effects weaken that reasoning. If `f` reads changing global state, two evaluations of what looks like the same expression may differ. Keep optional transformations small and explicit about their dependencies.

For configuration resolution, test the precedence matrix: both missing, each source present alone, both present, and invalid input in each position. Include boundaries 1 and 100, plus 0 and 101. These cases protect the actual policy more directly than tests of optional syntax.

## Dictionary lookup can legitimately produce nested absence

A dictionary with optional values distinguishes a missing key from a present key whose value is absent:

```swift
var profileFields: [String: String?] = [:]
profileFields.updateValue(nil, forKey: "nickname")

let knownButEmpty: String?? = profileFields["nickname"]
let unknownField: String?? = profileFields["timezone"]
assert(knownButEmpty != nil && knownButEmpty! == nil)
assert(unknownField == nil)
```

The `updateValue` call makes the intention clear. Assigning nil through the dictionary subscript normally removes a key, which is a different operation from storing an optional nil as the value.

This model can be useful for a schema where field presence matters, but it is easy to misuse. A named enum for unknown, absent, and present may be clearer at an API boundary than asking every caller to interpret two optional layers.

The important point is that flattening the lookup is a policy decision. It is safe only when unknown field and known absent field should lead to the same behavior.

## Combine independent presence without nesting callbacks

When a calculation requires two optional values, a small helper can express that requirement directly:

```swift
func whenBoth<A, B, Output>(
    _ a: A?,
    _ b: B?,
    transform: (A, B) -> Output
) -> Output? {
    guard let a = a, let b = b else { return nil }
    return transform(a, b)
}

let width: Int? = 4
let height: Int? = 6
let area = whenBoth(width, height, transform: *)
assert(area == 24)
assert(whenBoth(width, Optional<Int>.none, transform: *) == nil)
```

The helper combines already available values. It does not establish that dimensions are positive, multiplication cannot overflow, or the computations producing them ran concurrently. Those remain separate contracts.

If missing width and missing height require different messages, returning a single optional loses that distinction. Use independent validation results and accumulate their errors instead; see [Functors, Applicatives, and Monads](/swift-functors-applicatives-monads/).

## Keep sentinel values out of the absence model

A negative identifier, zero duration, empty string, or distant timestamp can be a valid domain value in some systems. Using it to mean “not supplied” creates a hidden convention every consumer must remember.

An optional makes that distinction visible to the compiler. A richer enum can distinguish multiple reasons for absence. Both are usually safer than an undocumented sentinel that travels through arithmetic or formatting as though it were real data.

There are legitimate compact representations at storage or interoperability boundaries. Convert them into an explicit domain model once, and convert back only at the adapter boundary. Do not make the rest of the application repeatedly decode the convention.

## Resolve configuration once per coherent operation

The page-size resolver takes both sources as values. If a caller instead reads a mutable preferences service repeatedly inside a long operation, different pages could use different settings without an intentional user action in that workflow.

Read a snapshot, resolve precedence, and pass the validated result into the operation. If live changes should affect active work, represent that as a new event with a deliberate restart or continuation policy.

This applies equally to optional feature flags and optional credentials. Presence at one moment does not guarantee validity for an entire session; expiration and revocation need their own model. An optional answers whether a value is present, while validity and lifetime are additional facts.

## Exercise: model an explicit reset

A settings editor needs three actions: leave the stored page size unchanged, set it to a value, or remove the stored override. An `Int?` alone cannot describe all three actions without another convention.

Create an enum for those edits and a pure function applying an edit to the current optional setting. Verify that “unchanged” preserves a value, “remove” produces absence, and “set” stores the supplied valid value.

Swift's [Optional Chaining chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/optionalchaining/) covers navigation through optional members. Return to the [Functional Programming roadmap](/swift-functional-programming/).
