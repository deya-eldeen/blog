---
layout: post
hidden: true
title: "Functors, Applicative Functors, and Monads in Practical Swift"
date: "2024-06-20"
last_modified_at: "2024-06-20"
permalink: /swift-functors-applicatives-monads/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Generics, Validation]
thumbnail: assets/img/article-placeholder.svg
---
The names sound abstract, but the operations are familiar. You transform an optional with `map`, combine independently validated fields, and chain a conversion with `flatMap`. Functor, applicative, and monad describe patterns and laws behind those operations.

The point is to recognize what information a composition needs and how its context behaves. These words do not make code correct by themselves, and Swift does not require importing a functional framework to benefit from the ideas.

<!--more-->

All examples use Swift 5.7-era language and standard-library features. `Result` has been in the standard library since [Swift 5.0](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0235-add-result.md). The validation type below is application code, not a built-in Swift API.

## A functor maps a value while preserving its context

For an optional, the context is possible absence. For an array, it is an ordered collection of values. For a result, it is success or a failure that should remain available.

```swift
let optionalNumber: Int? = 4
assert(optionalNumber.map { $0 * 2 } == 8)

let numbers = [1, 2, 3]
assert(numbers.map { $0 * 2 } == [2, 4, 6])

enum NumberFailure: Error, Equatable {
    case invalidText
    case notPositive
}

let success: Result<Int, NumberFailure> = .success(4)
let failure: Result<Int, NumberFailure> = .failure(.invalidText)
assert(success.map { $0 * 2 } == .success(8))
assert(failure.map { $0 * 2 } == .failure(.invalidText))
```

The successful payload type may change. The surrounding context follows its own rules: nil stays nil, array ordering is preserved, and a failure is not passed to the success transformation.

Functor is not a standard Swift protocol that all these types explicitly conform to. It is a shared structural pattern. Swift's generics do not directly express a general higher-kinded parameter such as an arbitrary `F<A>` constructor, so ordinary code often uses concrete overloads or methods on each context.

## The laws explain which rewrites should be safe

For pure functions and appropriate equality, mapping identity should preserve the original value. Mapping `f` and then `g` should match mapping their composition:

```swift
func doubled(_ value: Int) -> Int { value * 2 }
func described(_ value: Int) -> String { "n=\(value)" }

assert(numbers.map { $0 } == numbers)
assert(numbers.map(doubled).map(described) == numbers.map { described(doubled($0)) })
assert(optionalNumber.map(doubled).map(described) ==
    optionalNumber.map { described(doubled($0)) })
```

These laws are expectations about behavior, not extra syntax. A type with a method called `map` is not automatically a lawful functor if its implementation drops arbitrary elements or changes unrelated metadata inconsistently.

Effects inside the mapped functions also complicate rewrites. Two eager array maps run all `f` calls before all `g` calls; a composed map interleaves them per element. The value law assumes those functions are pure, so that distinction is not externally observable.

## Applicative composition combines independent inputs

Suppose a constructor needs a name and an age. Parsing the age does not depend on the parsed name. We can obtain both contextual values and combine them:

```swift
func zipOptionals<A, B>(_ a: A?, _ b: B?) -> (A, B)? {
    guard let a = a, let b = b else { return nil }
    return (a, b)
}

struct Signup: Equatable {
    let name: String
    let age: Int
}

let maybeName: String? = "Maya"
let maybeAge: Int? = 28
let signup = zipOptionals(maybeName, maybeAge).map { pair in
    Signup(name: pair.0, age: pair.1)
}
assert(signup == Signup(name: "Maya", age: 28))
```

The conventional applicative vocabulary includes lifting a plain value into the context and applying a contextual function to a contextual argument. A `zip` plus `map` interface is often a more readable Swift expression of combining independent inputs.

“Independent” describes data dependencies, not scheduling. Combining two already-computed results does not make their original computations concurrent. Parallel execution needs a separate effect and isolation policy.

The choice of context determines failure behavior. Optionals only preserve absence. A form often needs every independent field error, so build a context that accumulates them.

## Accumulating validation has a different contract from Result

```swift
enum Validation<Value> {
    case valid(Value)
    case invalid([String])

    func map<NewValue>(_ transform: (Value) -> NewValue) -> Validation<NewValue> {
        switch self {
        case let .valid(value): return .valid(transform(value))
        case let .invalid(errors): return .invalid(errors)
        }
    }
}

func zipValidation<A, B>(
    _ a: Validation<A>,
    _ b: Validation<B>
) -> Validation<(A, B)> {
    switch (a, b) {
    case let (.valid(a), .valid(b)): return .valid((a, b))
    case let (.invalid(a), .invalid(b)): return .invalid(a + b)
    case let (.invalid(errors), _): return .invalid(errors)
    case let (_, .invalid(errors)): return .invalid(errors)
    }
}

func validName(_ text: String) -> Validation<String> {
    text.isEmpty ? .invalid(["Name is required"]) : .valid(text)
}

func validAge(_ text: String) -> Validation<Int> {
    guard let age = Int(text), (18...120).contains(age) else {
        return .invalid(["Age must be between 18 and 120"])
    }
    return .valid(age)
}

let invalidSignup = zipValidation(validName(""), validAge("bad")).map { pair in
    Signup(name: pair.0, age: pair.1)
}
if case let .invalid(errors) = invalidSignup {
    assert(errors == ["Name is required", "Age must be between 18 and 120"])
} else {
    assertionFailure("Both independent failures must be retained")
}
```

Both field validations run, and the combined value retains both errors in field order. These messages are illustrative; a localized app should normally keep structured error codes and derive text later.

The error collection must have a sensible associative combination. Array concatenation gives ordered accumulation. A set would deduplicate and lose order, which may or may not fit the UI.

Our name rule only rejects an empty string. Trimming whitespace or enforcing a character policy would be separate product requirements, not properties supplied by the abstraction.

## A monad chains a step chosen from a previous value

Now consider a dependent operation: the second step needs the integer parsed by the first.

```swift
func parseNumber(_ text: String) -> Result<Int, NumberFailure> {
    guard let value = Int(text) else { return .failure(.invalidText) }
    return .success(value)
}

func requirePositive(_ value: Int) -> Result<Int, NumberFailure> {
    value > 0 ? .success(value) : .failure(.notPositive)
}

func quantity(_ text: String) -> Result<Int, NumberFailure> {
    parseNumber(text).flatMap(requirePositive)
}

assert(quantity("12") == .success(12))
assert(quantity("bad") == .failure(.invalidText))
assert(quantity("0") == .failure(.notPositive))
```

`flatMap` accepts a transformation returning another value in the same context, then avoids a nested context. If parsing fails, there is no integer for the dependent positivity check, so that check cannot run meaningfully.

This explains why fail-fast chaining and independent error accumulation are different. We can accumulate errors for two fields obtained independently. We cannot validate a parsed integer's numeric range before we have an integer.

A useful form pipeline accumulates independent field failures first, then chains cross-field checks on the successfully constructed model. Different stages can use different composition patterns without forcing one universal operator across the application.

## Monad laws constrain the sequencing behavior

The usual laws are left identity, right identity, and associativity. In practical terms: wrapping a value and chaining should behave like calling the step; chaining a wrapping operation should preserve a contextual value; regrouping dependent chains should preserve behavior.

```swift
func pureNumber(_ value: Int) -> Result<Int, NumberFailure> { .success(value) }
func addOne(_ value: Int) -> Result<Int, NumberFailure> { .success(value + 1) }

assert(pureNumber(3).flatMap(requirePositive) == requirePositive(3))
assert(success.flatMap(pureNumber) == success)
assert(failure.flatMap(pureNumber) == failure)
assert(success.flatMap(requirePositive).flatMap(addOne) ==
    success.flatMap { requirePositive($0).flatMap(addOne) })
```

These bounded examples avoid arithmetic overflow. Laws must be stated within the supported input domain and with an appropriate observation of equality. Functions and parsers cannot generally be compared directly; compare their behavior over a chosen test domain.

The laws help justify extracting or regrouping steps. They do not choose the correct business rule, prove termination, or make network operations transactional.

## Contexts have different meanings

Array `flatMap` collects every output from every input in order. Optional `flatMap` propagates absence. Result `flatMap` propagates the first failure in a dependent chain. A parser's `flatMap` passes the remaining input into a parser selected by the earlier value.

The shared shape is useful precisely because the contexts differ. Calling all of them “unwrap” misses the sequencing behavior and the information each context preserves.

Avoid translating every small Swift function into a hierarchy of abstract wrappers. Concrete `map`, a named `zip`, and a short `flatMap` chain often communicate the relevant idea better than custom symbolic operators.

## The context determines how independent values combine

Arrays have more than one plausible combination policy. A positional zip pairs corresponding elements and stops at the shorter input. A Cartesian combination produces every pair:

```swift
let sizes = ["S", "M"]
let colors = ["Blue", "Green", "Orange"]
let positional = Array(zip(sizes, colors)).map { $0.0 + ":" + $0.1 }
let combinations = sizes.flatMap { size in
    colors.map { color in size + ":" + color }
}
assert(positional == ["S:Blue", "M:Green"])
assert(combinations.count == 6)
assert(combinations.last == "M:Orange")
```

Both policies are useful. The conventional list applicative uses Cartesian combinations, while a zip-style wrapper can define positional behavior. The name “applicative” alone does not tell a reader which array policy a custom library selected.

This also exposes an output-size risk. Combining several independent option lists can multiply the number of results. A tiny input at each stage can still generate an enormous final collection.

For a product configurator, impose a result budget or generate combinations on demand. For paired time-series measurements, Cartesian combinations would be the wrong meaning entirely, regardless of whether the implementation is lawful under some other context.

## Short-circuiting and accumulation cannot be swapped casually

`Result.flatMap` propagates the first failure in the chain. The validation zip combines failures from independent inputs. Replacing one with the other can change both the number and order of diagnostics.

If a validation API exposes both an accumulating applicative operation and a fail-fast chaining operation, document their relationship carefully. Do not claim that every combination of those operations automatically satisfies one coherent set of laws.

For instance, an operation deriving a second field's rule from the first field's value cannot discover all second-stage errors when the first field is invalid. There is no value available from which to choose that rule. Accumulation does not invent missing dependency information.

Separate independent field checks from dependent model checks. This gives the UI useful diagnostics while keeping the dependency structure truthful.

## Choose equality appropriate to the context

The law examples compare arrays, optionals, and results with equatable payloads. A parser or a reader function has no general `==` that proves behavior over every possible input.

Test such contexts extensionally over a defined sample domain: run both sides with the same inputs and compare outputs, failures, and relevant remaining state. For parsers, include the unconsumed suffix; for a state computation, include the final state.

Generated law checks can catch implementation mistakes, but finite tests are still evidence rather than a proof. Effects, partial functions, unsupported arithmetic ranges, and nontermination all need explicit assumptions in the law's domain.

## Use the vocabulary to explain a design decision

In a review, “these two fields are independent, so we accumulate both validation failures” is more informative than “this is applicative.” Likewise, “the next parser depends on the count just read” explains why dependent sequencing belongs there.

The abstract term is a compact reference once the behavior is understood. Keep concrete types and names visible so a Swift reader can follow the code without knowing every category-theory term.

When a simple `switch` expresses the same rule more clearly, use it. The value of these patterns is recognizing safe composition and preserved information, not maximizing the number of `map` and `flatMap` calls.

## Exercise: combine independent validation with a dependent check

Add a second age field representing a guardian's age. Accumulate syntax and individual range errors for both fields. Once both values exist, validate a relationship between them, such as a minimum age difference chosen for this exercise.

Verify two malformed fields produce two errors, while a relationship failure is checked only after both parse successfully. Then decide whether relationship errors should be accumulated with other model-level rules and represent that stage explicitly.

Return to the [Functional Programming roadmap](/swift-functional-programming/).
