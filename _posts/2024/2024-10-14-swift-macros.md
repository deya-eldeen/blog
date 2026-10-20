---
layout: post
title: "Macros in Swift"
date: "2024-10-14"
last_modified_at: "2024-10-14"
permalink: /swift-macros/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Macros"
  - "Metaprogramming"
---

Swift macros, introduced in Swift 5.9, generate code at compile time. Write `@Observable` on a class or `#Preview` in a SwiftUI file, and the compiler expands it into ordinary Swift code that you can inspect, step through, and reason about. Unlike C macros, Swift macros are type-checked, structured, and can't silently change the meaning of code around them.

<!--more-->

## Using macros

You've probably used macros already. There are two kinds.

**Freestanding macros** start with `#` and appear on their own, like an expression or a declaration:

```swift
import SwiftUI

#Preview {
    Text("Hello, macros")
}
```

`#Preview` generates the type that registers a preview with Xcode. Other examples: `#expect(...)` in Swift Testing, and `#warning("...")`.

**Attached macros** start with `@` and are attached to a declaration, adding to it or generating code alongside it:

```swift
import Observation

@Observable
final class Counter {
    var count = 0
}
```

`@Observable` adds observation tracking: every stored property gets accessors that report reads and writes, and the class gains conformance to the `Observable` protocol. SwiftUI uses that to redraw only the views that actually read a changed property.

## Seeing what a macro generates

Nothing about a macro is hidden. In Xcode, right-click a macro and choose **Expand Macro** to see the generated code inline. That's a big difference from C macros or runtime magic: you can read exactly what you're running, set breakpoints in it, and see errors pointing at the expanded code.

## The kinds of macros

| Role | Spelled | What it can do |
|---|---|---|
| Expression | `#name(...)` | Produce a value, e.g. `#URL("https://…")` |
| Declaration | `#name(...)` | Produce new declarations |
| Peer | `@Name` | Add declarations next to the one it's attached to |
| Accessor | `@Name` | Add `get`/`set` accessors to a property |
| Member | `@Name` | Add members to a type |
| Member attribute | `@Name` | Add attributes to a type's members |
| Extension | `@Name` | Add an extension, e.g. a protocol conformance |

`@Observable` combines several roles: member, member attribute, and extension.

## How macros are built

A macro has two parts:

1. A **declaration**, in your library, that says what the macro looks like and where its implementation lives.
2. An **implementation**, in a separate compiler plugin, that receives the source code as a syntax tree and returns new syntax. Implementations use Apple's **SwiftSyntax** package.

Here's the classic example from Xcode's macro template: `#stringify(x + y)` returns both the value and the source text.

The declaration:

```swift
@freestanding(expression)
public macro stringify<T>(_ value: T) -> (T, String) =
    #externalMacro(module: "MyMacrosPlugin", type: "StringifyMacro")
```

The implementation, which runs inside the compiler:

```swift
import SwiftCompilerPlugin
import SwiftSyntax
import SwiftSyntaxMacros

public struct StringifyMacro: ExpressionMacro {
    public static func expansion(
        of node: some FreestandingMacroExpansionSyntax,
        in context: some MacroExpansionContext
    ) -> ExprSyntax {
        guard let argument = node.arguments.first?.expression else {
            fatalError("compiler bug: the macro does not have any arguments")
        }
        return "(\(argument), \(literal: argument.description))"
    }
}

@main
struct MyMacrosPlugin: CompilerPlugin {
    let providingMacros: [Macro.Type] = [StringifyMacro.self]
}
```

And at the call site:

```swift
// let (result, code) = #stringify(17 + 25)
// result == 42, code == "17 + 25"
```

The easiest way to start is **File → New → Package → Swift Macro** in Xcode, which sets up the declaration, plugin, and test targets for you.

## Validating input and reporting errors

Because a macro sees real syntax, it can check its input and emit compiler diagnostics. A `#URL("…")` macro, for example, can verify the string at compile time and return a non-optional `URL`, turning a runtime crash into a compile error with a clear message. That's a capability no function can offer.

## Testing macros

SwiftSyntax includes `assertMacroExpansion`, which compares a macro's input with the exact source it expands to. Macro tests run like any other unit tests, and they're essential: a macro bug becomes a bug in every place the macro is used.

## Macros vs. other tools

| Need | Best tool |
|---|---|
| Reusable get/set logic for one property | [Property wrapper](/swift-property-wrappers/) |
| Shared behavior across types | Protocol with an extension |
| Generating boilerplate that needs to see a whole type | Macro |
| Checking a literal at compile time | Expression macro |

Reach for macros when other abstractions can't express what you need. They add a compiler plugin to your build, and they're harder to write than a function.

## Costs to keep in mind

- **Build time:** macro packages depend on SwiftSyntax, which is large and can noticeably slow down clean builds.
- **Trust:** a macro plugin runs code during your build. Xcode asks you to approve macros from packages for that reason.
- **Readability:** a macro can generate a lot of code from one line. Keep their behavior obvious and well documented.

## Summary

- Macros generate Swift code at compile time; freestanding macros use `#`, attached macros use `@`.
- Expanded code is visible in Xcode, debuggable, and type-checked.
- Implementations live in compiler plugins built with SwiftSyntax, and can emit real compiler errors.
- Use macros for boilerplate and compile-time checks that functions, protocols, and property wrappers can't handle.
