---
layout: post
title: "Pattern Matching in Swift"
date: "2021-01-22"
last_modified_at: "2021-01-22"
permalink: /swift-pattern-matching/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Syntax"
  - "Enums"
---

Pattern matching is how Swift asks "does this value look like *that*?" and pulls the interesting parts out in the same breath. It powers `switch`, `if case`, `guard case`, `for case`, `while case`, and `catch` clauses. Once it clicks, it replaces whole pyramids of `if` statements with a few readable lines, and it lets the compiler prove you handled every possibility.

<!--more-->

## The idea in one example

```swift
let response = (statusCode: 404, body: "Not Found")

switch response {
case (200..<300, let body):
    print("Success: \(body)")
case (404, _):
    print("Missing resource")
case (500..., let body):
    print("Server error: \(body)")
default:
    print("Unhandled status \(response.statusCode)")
}
```

In one `switch`, we checked ranges, matched an exact value, ignored a component with `_`, and **bound** parts of the value to new constants with `let`. Each of those is a **pattern**, and patterns nest inside each other freely.

## The building blocks

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything, ignoring it |
| Identifier | `let x` | anything, binding it to `x` |
| Value (expression) | `42`, `"admin"`, `0..<10` | values that match via the `~=` operator |
| Tuple | `(0, _)` | tuples whose elements match |
| Enum case | `.success(let value)` | a specific case, extracting associated values |
| Optional | `let x?` | a non-nil optional, unwrapping it |
| Type casting | `is Int`, `let n as Int` | values of a given runtime type |

Let's go through them in practice.

## Tuples: matching several values at once

Matching combinations of values is where `switch` beats `if` chains by a wide margin:

```swift
let point = (x: 0, y: 5)

switch point {
case (0, 0):
    print("Origin")
case (0, let y):
    print("On the y-axis at \(y)")
case (let x, 0):
    print("On the x-axis at \(x)")
case (-1...1, -1...1):
    print("Close to the origin")
default:
    print("Somewhere else")
}
```

Cases are tested **top to bottom**, and the first match wins. `(0, 0)` would also match `(0, let y)`, so specific cases must come before general ones.

### Tuples make state machines readable

Switching over a tuple of the current state and an event is a classic pattern. The compiler checks that every combination is handled:

```swift
enum PlayerState {
    case stopped, playing, paused
}

enum PlayerEvent {
    case play, pause, stop
}

func transition(from state: PlayerState, on event: PlayerEvent) -> PlayerState {
    switch (state, event) {
    case (.stopped, .play), (.paused, .play):
        return .playing
    case (.playing, .pause):
        return .paused
    case (_, .stop):
        return .stopped
    case (.playing, .play), (.paused, .pause), (.stopped, .pause):
        return state   // events that don't change anything
    }
}

print(transition(from: .paused, on: .play))   // playing
```

There's no `default`, so if you add a new state or event later, the compiler points at this function and makes you decide what should happen.

## `where` clauses

Add extra conditions to any case:

```swift
let size = (width: 120, height: 80)

switch size {
case let (w, h) where w == h:
    print("Square")
case let (w, h) where w > h:
    print("Landscape")
default:
    print("Portrait")
}
```

One subtlety: the compiler **can't** see inside `where` conditions when it checks exhaustiveness. A `switch` whose cases all have `where` clauses still needs a `default` (or a final case without one), even if your conditions logically cover everything.

## Enums with associated values

This is pattern matching's killer feature: checking which case you have and extracting its data in one step.

```swift
enum LoadState {
    case idle
    case loading(progress: Double)
    case loaded(items: [String])
    case failed(message: String, retryable: Bool)
}

let state = LoadState.failed(message: "Timeout", retryable: true)

switch state {
case .idle:
    print("Waiting")
case .loading(let progress) where progress < 0.5:
    print("Just started: \(progress)")
case .loading(let progress):
    print("Almost there: \(progress)")
case .loaded(let items) where items.isEmpty:
    print("Nothing to show")
case .loaded(let items):
    print("Loaded \(items.count) items")
case .failed(let message, true):
    print("Error: \(message). Tap to retry.")
case .failed(let message, false):
    print("Error: \(message).")
}
```

Notice `.failed(let message, true)`: a value pattern (`true`) nested inside an enum pattern, next to a binding. Every slot in an associated value can hold its own pattern.

When you bind several values, you can put a single `let` outside: `case let .failed(message, retryable)` is the same as `case .failed(let message, let retryable)`. Use `var` instead of `let` if you need to modify the bound copy.

## Nested patterns

Patterns nest as deeply as your data does:

```swift
enum Shape {
    case circle(radius: Double)
    case rectangle(width: Double, height: Double)
}

enum Drawing {
    case single(Shape)
    case group([Shape])
}

let drawing = Drawing.single(.rectangle(width: 10, height: 10))

switch drawing {
case .single(.circle(let radius)):
    print("A circle of radius \(radius)")
case .single(.rectangle(let w, let h)) where w == h:
    print("A square of side \(w)")
case .single(.rectangle):
    print("A rectangle")          // matching the case without binding its values
case .group(let shapes):
    print("\(shapes.count) shapes")
}
```

## `if case`, `guard case`, and `while case`

When you care about one pattern, a full `switch` is overkill:

```swift
if case .failed(let message, _) = state {
    print("Show alert: \(message)")
}

func progressValue(of state: LoadState) -> Double? {
    guard case .loading(let progress) = state else { return nil }
    return progress
}

var queue = [3, 1, 2].makeIterator()
while case let value? = queue.next() {
    print(value)    // 3, 1, 2
}
```

The syntax reads backwards at first: the **pattern** is on the left of `=`, and the **value** being matched is on the right. You can combine it with other conditions using commas:

```swift
if case .loaded(let items) = state, items.count > 10 {
    print("Big list")
}
```

## `for case`: filtering while you loop

```swift
let states: [LoadState] = [
    .idle,
    .failed(message: "Timeout", retryable: true),
    .loaded(items: ["A"]),
    .failed(message: "Offline", retryable: false),
]

for case .failed(let message, _) in states {
    print(message)              // Timeout, Offline
}

let maybeNumbers: [Int?] = [1, nil, 3]
for case let number? in maybeNumbers {
    print(number)               // 1, 3
}

for case let (index, value) in maybeNumbers.enumerated() where value == nil {
    print("Missing value at \(index)")
}
```

## Optional patterns

`let value?` matches only non-nil values and unwraps them. It's sugar for the enum pattern `.some(let value)`, since `Optional` is an enum:

```swift
let reply: Int? = 404

switch reply {
case nil:
    print("No reply")
case let code? where code >= 500:
    print("Server error \(code)")
case let code?:
    print("Status \(code)")
}
```

You can also match an optional enum directly, without unwrapping first:

```swift
let maybeState: LoadState? = .idle

switch maybeState {
case .idle?:
    print("Idle")
case .loading?, .loaded?, .failed?:
    print("Busy or done")
case nil:
    print("No state yet")
}
```

## Type-casting patterns

When you have a value of type `Any` or a superclass, `is` and `as` patterns check and convert it:

```swift
let things: [Any] = [42, "hello", 3.14, [1, 2]]

for thing in things {
    switch thing {
    case let number as Int:
        print("Int: \(number)")
    case let text as String:
        print("String: \(text)")
    case is Double:
        print("Some Double")
    default:
        print("Something else")
    }
}
```

## Patterns in `catch` clauses

Error handling uses the same machinery, so you can match error cases and their data:

```swift
enum NetworkError: Error {
    case badStatus(Int)
    case offline
}

func load() throws {
    throw NetworkError.badStatus(503)
}

do {
    try load()
} catch NetworkError.badStatus(let code) where code >= 500 {
    print("Server is having trouble: \(code)")
} catch NetworkError.offline {
    print("Check your connection")
} catch {
    print("Something else: \(error)")
}
```

## How value patterns work: `~=`

When you write `case 200..<300:`, Swift checks the value with the **pattern match operator** `~=`. The standard library defines it for equality (anything `Equatable`) and for ranges (`200..<300 ~= statusCode` is `true` if the range contains the code). You can overload it for your own types. Here's a `switch` that matches strings by prefix:

```swift
struct Prefix {
    let value: String
}

func ~= (pattern: Prefix, input: String) -> Bool {
    input.hasPrefix(pattern.value)
}

let command = "/help topics"

switch command {
case Prefix(value: "/help"):
    print("Show help")
case Prefix(value: "/quit"):
    print("Bye")
default:
    print("Unknown command")
}
```

Another useful one matches a value against a predicate closure:

```swift
func ~= <T>(predicate: (T) -> Bool, value: T) -> Bool {
    predicate(value)
}

let isEven: (Int) -> Bool = { $0 % 2 == 0 }

switch 42 {
case isEven:
    print("Even")
default:
    print("Odd")
}
```

Use custom `~=` sparingly. It's clever, and it changes what a `case` line means, so make sure it reads obviously to the next person.

## Under the hood: why `switch` on enums is fast

For a `switch` over an enum, the compiler knows the full list of cases at compile time. It typically compiles the `switch` into a **jump table** or a short series of comparisons on the enum's tag, which is far cheaper than a chain of string or object comparisons. Exhaustiveness is checked at compile time too, so a `switch` without `default` costs nothing extra at runtime and buys you a compile error whenever a new case appears.

For enums you don't own, like those from Apple's frameworks, cases may be added in future OS versions. Swift asks you to handle that with `@unknown default`, which still warns you at compile time if you're missing a *known* case, while handling *future* cases at runtime:

```swift
func describe(_ thermalState: ProcessInfo.ThermalState) -> String {
    switch thermalState {
    case .nominal: return "Cool"
    case .fair: return "Warm"
    case .serious: return "Hot, slow down background work"
    case .critical: return "Too hot, stop heavy work now"
    @unknown default: return "A state added in a newer OS"
    }
}

print(describe(ProcessInfo.processInfo.thermalState))
```

Remove `@unknown default` and the compiler warns that the switch "may have additional unknown values". Remove `case .critical` and it warns that the switch must be exhaustive, even though `@unknown default` is there.

For your own enums, avoid `default` when you can. Listing every case keeps the compiler's exhaustiveness check working for you.

## Common pitfalls

- **Order matters.** A general case placed first swallows the specific ones below it. The compiler warns when a case can never be reached, so take those warnings seriously.
- **`default` hides new cases.** It's convenient today and silently wrong tomorrow when someone adds a case.
- **`where` doesn't help exhaustiveness.** The compiler treats every `where` case as possibly failing.
- **Comparing enums with associated values.** `state == .loading` doesn't compile unless the enum is `Equatable`, and even then you'd have to supply the associated value. Use `if case .loading = state` to test just the case.
- **Binding vs. comparing.** Inside a pattern, `let x` creates a new constant. To compare against an existing variable, write it without `let`: `case (expectedX, _)`.

## Interview questions

**What's the difference between `if case` and `==`?**
`==` needs `Equatable` and compares the whole value. `if case` checks the shape of a value, like which enum case it is, and can extract associated values without needing `Equatable`.

**Why does a `switch` with only `where` cases need a `default`?**
Exhaustiveness checking can't evaluate arbitrary boolean conditions, so the compiler assumes every `where` case might fail.

**How do ranges work in `case` labels?**
Through the `~=` operator, which the standard library defines for ranges as `range.contains(value)`. You can overload `~=` for your own types.

**What does `@unknown default` do?**
It handles cases added in the future to an enum from another module, while still warning you at compile time about known cases you forgot.

## Summary

- Patterns combine: tuples of ranges, enum cases with nested values, optionals, and type casts.
- Cases are tried top to bottom; the first match wins.
- `if case`, `guard case`, `while case`, and `for case` bring pattern matching outside `switch`; `catch` clauses use it too.
- Value patterns use `~=`, which you can overload.
- Exhaustive `switch` statements over enums are fast and turn new cases into compile errors, so prefer them over `default`.
