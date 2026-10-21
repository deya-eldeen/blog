---
layout: post
hidden: true
title: "Functions in Swift"
date: "2021-01-30"
last_modified_at: "2021-01-30"
permalink: /swift-functions/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Basics"
  - "Functions"
thumbnail: "images/covers/swift_functions_thumbnail.webp"
thumbnail_ready: true
---

Functions are the verbs of your code. Swift's function syntax looks simple, but it's carefully designed: argument labels make call sites read like sentences, default values and variadics keep APIs small, `inout` makes mutation explicit, and functions themselves are values you can store, pass, and return. Understanding these details is what separates code that merely works from APIs that are a pleasure to use.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_functions_thumbnail.webp"
 alt_text="Input tokens passing through a reusable function module to produce an output"
 caption="A function groups a reusable operation behind a defined set of inputs and outputs."
 width="640"
 height="400"
%}

## Anatomy of a function

```swift
func greet(person: String, from hometown: String) -> String {
    "Hello \(person)! Glad you could visit from \(hometown)."
}

print(greet(person: "Sam", from: "Amman"))
```

- `func` declares a function named `greet`.
- Each parameter has an **argument label** (used by callers) and a **parameter name** (used inside). `person` uses the same word for both; `from hometown` has the label `from` and the name `hometown`.
- `-> String` is the return type. A function without one returns `Void`, which is the empty tuple `()`.
- When the body is a single expression, `return` is implied (since Swift 5.1).

The full name of this function is `greet(person:from:)`. That's how you refer to it in documentation, in `#selector`, and when overloads would be ambiguous.

## Designing argument labels

Labels exist so call sites read naturally. Swift's API Design Guidelines boil down to a few rules:

1. **Read the call site, not the declaration.** `move(from: a, to: b)`, `insert(item, at: 0)`, and `remove(at: 3)` read as phrases.
2. **Omit a label when the first argument completes the base name.** `print(x)`, `max(a, b)`, `addSubview(view)`. Use `_` to drop it:

```swift
func square(_ value: Int) -> Int {
    value * value
}

let nine = square(3)
```

3. **Add a label when the role of an argument isn't obvious.** `split(by: ",")` is clearer than `split(",")`.
4. **Use prepositions to form phrases:** `fade(to: .black)`, `distance(from: here)`.

Compare `setColor(1.0, 0.5, 0.2, 1.0)` with `setColor(red: 1.0, green: 0.5, blue: 0.2, alpha: 1.0)`. The labels cost a few keystrokes and save every future reader from guessing.

## Default parameter values

```swift
func connect(host: String, port: Int = 443, secure: Bool = true) -> String {
    "\(secure ? "https" : "http")://\(host):\(port)"
}

let a = connect(host: "example.com")
let b = connect(host: "localhost", port: 8080, secure: false)
let c = connect(host: "api.local", secure: false)   // skip a middle argument
```

Put defaulted parameters after the ones without defaults, so the common call stays short. Defaults are a great way to evolve an API: adding a new parameter with a default doesn't break existing callers.

A detail that surprises people: **default values are evaluated on every call**, at the call site, not once when the function is declared:

```swift
var issuedTickets = 0

func nextTicketID() -> Int {
    issuedTickets += 1
    return issuedTickets
}

func makeTicket(id: Int = nextTicketID()) -> Int {
    id
}

print(makeTicket(), makeTicket(), makeTicket(id: 99), makeTicket())   // 1 2 99 3
```

So `func log(at date: Date = Date())` correctly gets the current time on each call.

## Variadic parameters

A variadic parameter accepts zero or more values, which arrive inside the function as an array:

```swift
func average(_ numbers: Double...) -> Double {
    guard !numbers.isEmpty else { return 0 }
    return numbers.reduce(0, +) / Double(numbers.count)
}

let mean = average(4, 8, 15, 16, 23, 42)
let nothing = average()   // 0
```

A function can have only one variadic parameter. You can't pass an existing array to a variadic parameter, so if callers might already have an array, offer an overload that takes `[Double]` and have the variadic version forward to it.

## Returning several values

Tuples are a lightweight way to return more than one value. Return an optional tuple when there might be no result:

```swift
func minMax(of values: [Int]) -> (min: Int, max: Int)? {
    guard var low = values.first else { return nil }
    var high = low
    for value in values.dropFirst() {
        low = Swift.min(low, value)
        high = Swift.max(high, value)
    }
    return (low, high)
}

if let range = minMax(of: [8, 3, 12, 5]) {
    print("From \(range.min) to \(range.max)")
}
```

When the result has more than two or three parts, or travels far from where it was created, a small `struct` with named properties is clearer than a tuple.

## `inout` parameters

Parameters are constants inside a function. To let a function modify a caller's variable, mark the parameter `inout`, and pass the argument with `&`:

```swift
func double(_ value: inout Int) {
    value *= 2
}

var score = 21
double(&score)
print(score)   // 42
```

The `&` makes the mutation visible at the call site, which is the point: you can see which calls might change your variables.

### How `inout` really works: copy-in, copy-out

`inout` is **not** pass-by-reference in the C++ sense. Conceptually, the value is copied in when the function starts and copied back out when it returns. The optimizer often turns that into direct access, but the semantics remain copy-in/copy-out, and you can observe it with a property observer:

```swift
struct Thermostat {
    var target = 0 {
        didSet { print("didSet: \(oldValue) -> \(target)") }
    }
}

func bumpThreeTimes(_ value: inout Int) {
    value += 1
    value += 1
    value += 1
}

var thermostat = Thermostat()
bumpThreeTimes(&thermostat.target)   // prints once: "didSet: 0 -> 3"
```

The observer fires **once**, when the value is written back, not three times. The same model is what lets you pass computed properties as `inout` arguments: Swift calls the getter, runs the function, then calls the setter.

Rules that follow from this:

- You can only pass variables (`var`), never constants or literals.
- You can't pass the same variable twice to two `inout` parameters of one call. That would be two overlapping writes to the same memory, and Swift's exclusivity checking forbids it.
- `inout` parameters can't be captured by escaping closures, because the closure could run after the write-back.

Prefer returning a new value when that's natural (`let doubled = double(score)`), and use `inout` when updating in place is the real model, like `swap(&a, &b)` or a `mutating` helper on a large value.

## Functions are values

Every function has a type built from its parameter and return types. `add` below has the type `(Int, Int) -> Int`, and you can store it, pass it, and return it like any other value:

```swift
func add(_ a: Int, _ b: Int) -> Int { a + b }
func multiply(_ a: Int, _ b: Int) -> Int { a * b }

var operation: (Int, Int) -> Int = add
print(operation(3, 4))     // 7

operation = multiply
print(operation(3, 4))     // 12

func apply(_ op: (Int, Int) -> Int, to a: Int, and b: Int) -> Int {
    op(a, b)
}

print(apply(add, to: 5, and: 6))   // 11
```

Note that argument labels aren't part of a function's type: once stored in `operation`, the function is called without labels.

### Functions that return functions

```swift
func makeMultiplier(by factor: Int) -> (Int) -> Int {
    func multiply(_ value: Int) -> Int {
        value * factor
    }
    return multiply
}

let triple = makeMultiplier(by: 3)
print(triple(14))   // 42
```

`multiply` uses `factor` from the enclosing function. When it's returned, it carries `factor` along with it: it **captures** it. That's what closures are, and they're the topic of the next article.

## Nested functions

Functions can be declared inside other functions. They're invisible outside, and they can use the enclosing function's variables, which makes them perfect for breaking a long function into named steps without polluting the type's namespace:

```swift
func makeReport(for sales: [Double]) -> String {
    func formatted(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    func total() -> Double {
        sales.reduce(0, +)
    }

    return "Total: \(formatted(total())) from \(sales.count) sales"
}

print(makeReport(for: [9.99, 20, 5.5]))   // Total: 35.49 from 3 sales
```

## Overloading

Several functions can share a base name if their labels or parameter types differ:

```swift
func describe(_ value: Int) -> String { "Int \(value)" }
func describe(_ value: String) -> String { "String \(value)" }
func describe(count: Int) -> String { "Count \(count)" }

print(describe(1))
print(describe("one"))
print(describe(count: 2))
```

Swift can even overload on **return type**, but then callers must spell out the type they want, which quickly becomes confusing. Prefer distinct names.

## Special return types

- **`Void`**: no meaningful value. `func log(_ message: String)` returns `()`.
- **`Never`**: the function never returns, like `fatalError(_:)` or a function that runs an infinite loop. The compiler uses this to know that code after the call is unreachable, so a `guard … else { fatalError() }` satisfies "must exit the scope".
- **`@discardableResult`**: suppresses the "result unused" warning, for functions whose result is often irrelevant, like a `save()` that returns whether it succeeded.

```swift
@discardableResult
func save(_ text: String) -> Bool {
    !text.isEmpty
}

save("draft")   // no warning
```

## Under the hood

A few implementation details explain behavior you'll see in practice:

- **A function value is two words.** Storing a Swift function in a variable stores a pointer to its code plus a pointer to its captured **context**, 16 bytes on 64-bit platforms. A plain C function pointer is just the 8-byte code pointer:

```swift
print(MemoryLayout<(Int) -> Int>.size)                 // 16
print(MemoryLayout<@convention(c) () -> Void>.size)    // 8
```

- **Arguments are borrowed, not copied.** By default the caller keeps ownership of arguments, and the callee just reads them. Passing a large array to a function doesn't copy it.
- **Direct calls can be inlined.** When the compiler knows exactly which function is called, it can copy its body into the caller and optimize across the boundary. Calls through a function *value* can't be inlined unless the optimizer can see which function the value holds.

## Common pitfalls

- **Unreadable call sites.** If you have to look at the declaration to understand a call, add labels.
- **Boolean parameters.** `render(true, false)` is cryptic. Prefer labels (`render(animated: true)`), or an enum when the options grow.
- **Too many parameters.** Four or five is a smell. Group related values into a struct.
- **Hidden side effects in default values.** Since defaults run at each call site, an expensive or stateful default runs more often than you might expect.
- **`inout` where a return value would do.** It makes data flow harder to follow.

## Interview questions

**Is `inout` pass-by-reference?**
Semantically it's copy-in/copy-out: the value is written back when the function returns, which is why a `didSet` observer fires once. The optimizer may pass an address directly, but the observable behavior stays copy-in/copy-out.

**When is a default argument evaluated?**
At every call that relies on it, at the call site.

**Are argument labels part of a function's type?**
No. The type of `greet(person:from:)` is `(String, String) -> String`. Labels belong to the function's name, not its type.

**What is `Never` used for?**
It marks functions that don't return, letting the compiler treat code after them as unreachable and accept them as the exit path in `guard` statements.

## Summary

- Argument labels make call sites read like sentences; `_` removes a label when the meaning is obvious.
- Defaults (evaluated at each call) and variadics keep APIs compact.
- `inout` is copy-in/copy-out, marked with `&` at the call site, and subject to exclusivity rules.
- Functions are values with types, which enables higher-order functions, functions returning functions, and closures.
