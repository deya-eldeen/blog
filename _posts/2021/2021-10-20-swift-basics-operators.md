---
layout: post
title: "Operators You Actually Use"
date: "2021-10-20"
last_modified_at: "2021-10-20"
permalink: /swift-basics-operators/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swift_article.webp"
categories:
  - "Development"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Operators"
  - "Basics"
---

Swift’s operator set is broad, but a small set covers 95% of what you write daily. This guide focuses on the operators that matter for real code, with quick examples and pitfalls to avoid.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/swift_article.webp"
 alt_text="" 
 caption=""
 width="960" 
 height="1568"
%}

## Arithmetic and assignment

```swift
let sum = 2 + 3          // 5
var counter = 0
counter += 1             // 1
let average = 7.0 / 2.0  // 3.5
```

- Prefer `+=`/`-=` over `counter = counter + 1` for clarity.
- When mixing ints and doubles, convert explicitly (`Double(count)`), not implicitly.

## Comparisons

```swift
let isEqual = "abc" == "abc"   // true
let isOrdered = 3 < 5          // true
let isDifferent = UUID() != UUID() // almost certainly true
```

Use `==` and `!=` for value equality. Avoid comparing floating numbers directly unless you control the precision (e.g., use tolerances).

## Optionals: nil-coalescing and optional chaining

```swift
let fallback = username ?? "Guest"
let length = user.profile?.bio?.count ?? 0
```

- `??` provides a safe default.
- Optional chaining (`?.`) stops early on nil without crashing.

Ternary is fine when it is short and clear:

```swift
let style = isDarkMode ? "dark" : "light"
```

Avoid nesting ternaries; use `if/else` when readability drops.

## Ranges and loops

```swift
for i in 0..<3 { print(i) }  // 0,1,2
for i in 1...3 { print(i) }  // 1,2,3
```

Use `..<` for half-open ranges (common in arrays) and `...` for closed ranges.

## Logical operators

```swift
if isLoggedIn && hasProfile {
    showDashboard()
} else if isLoggedIn || hasTrial {
    showLimitedExperience()
}
```

- `&&` short-circuits: the right side runs only if the left side is true.
- `||` short-circuits: the right side runs only if the left side is false.

Combine truthy conditions carefully. When side effects are present, keep them out of the condition to avoid surprises:

```swift
guard isAuthenticated, hasProfile else {
    return
}
```

## Identity vs equality

```swift
class A {}
let a = A(); let b = a; let c = A()

(a === b) // true  (same instance)
(a === c) // false (different instances)
```

Use `===` only for reference identity checks. For value semantics (structs, enums, strings), stick to `==`.

## Precedence and grouping

Swift’s precedence rules are sensible, but parentheses beat memory:

```swift
let allowed = isAdmin || (isMember && isPaid)
```

Avoid clever chaining when it obscures intent. If you are not sure about precedence, add parentheses.

## Nil-coalescing vs default creation

`??` is great until the right-hand side is expensive:

```swift
let cached = cache[id] ?? loadFromDisk(id) // loadFromDisk runs only if nil
```

Prefer a closure when you want lazy creation:

```swift
let cached = cache[id] ?? {
    let loaded = loadFromDisk(id)
    cache[id] = loaded
    return loaded
}()
```

## Pattern matching with `switch`

```swift
let code = 200
switch code {
case 200:
    print("OK")
case 400...499:
    print("Client error")
case 500...599:
    print("Server error")
default:
    print("Unknown")
}
```

`switch` must be exhaustive. Ranges and multiple patterns keep it readable.

You can match tuples to keep validation tight:

```swift
let credentials = (user, password)
switch credentials {
case ("admin", "secret"):
    print("welcome")
case (_, ""):
    print("missing password")
default:
    break
}
```

## Custom operators: resist the urge

Swift lets you define your own operators, but most teams ban them. Prefer readable methods unless you have a strong convention (e.g., a DSL).

## Bitwise (practical recap)

```swift
let read:  UInt8 = 0b0001
let write: UInt8 = 0b0010
let rw = read | write      // union
let isReadable = (rw & read) != 0
```

Use bitwise flags when performance or legacy formats require them. Otherwise, favor enums with `OptionSet`.

Overflow operators (`&+`, `&-`, `&*`) bypass overflow traps. Use them only when you are certain overflow is acceptable (like wrapping counters).

## Takeaways

- Reach for `??`, `?.`, and range operators daily.
- Use `===` only for reference checks; `==` for value equality.
- Keep `switch` exhaustive and readable with ranges and combined cases.
- Avoid custom operators unless your team has a clear standard.
- Reach for parentheses when precedence is unclear, and keep side effects out of conditions.
- Prefer `OptionSet` over raw bitwise flags for readability, and reserve overflow operators for deliberate wrapping.
