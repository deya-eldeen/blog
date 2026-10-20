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
thumbnail: "images/covers/swift_macros_thumbnail.webp"
thumbnail_ready: true
---

Swift macros, introduced in Swift 5.9, generate code at compile time. Write `@Observable` on a class, `#Preview` in a SwiftUI file, or `#expect` in a test, and the compiler expands it into ordinary Swift code that you can read, step through in the debugger, and reason about. Unlike C macros, Swift macros are type-checked, operate on syntax trees rather than text, and can't silently change the meaning of the code around them. They're also more work to write than a function, which is why knowing when to reach for one matters as much as knowing how.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_macros_thumbnail.webp"
 alt_text="A compact macro input expanding into structured code through a compiler stage"
 caption="Macros in Swift"
 width="640"
 height="400"
%}

## Using macros

You've probably used macros already. There are two families.

**Freestanding macros** start with `#` and stand on their own, as an expression or a declaration:

```swift
import Foundation

struct Book {
    let title: String
    let pages: Int
}

let longBooks = #Predicate<Book> { book in
    book.pages > 300
}

let library = [Book(title: "Short", pages: 120), Book(title: "Long", pages: 640)]
print(try library.filter(longBooks).map(\.title))   // ["Long"]
```

`#Predicate` (Foundation, macOS 14 / iOS 17) turns a closure into a structured, inspectable predicate that SwiftData can translate into a database query. Other everyday examples: `#Preview { … }` in SwiftUI, `#expect(…)` and `#require(…)` in Swift Testing, and `#warning("…")`.

**Attached macros** start with `@` and are attached to a declaration, adding code to it or alongside it:

```swift
import Observation

@Observable
final class Counter {
    var count = 0
}

let counter = Counter()
counter.count += 1
print(counter.count)   // 1
```

## Nothing is hidden: expanding a macro

In Xcode, right-click a macro and choose **Expand Macro** to see the generated code inline. Here's (simplified) what `@Observable` produces for `count`:

```swift
// @ObservationIgnored private let _$observationRegistrar = ObservationRegistrar()
//
// @ObservationIgnored private var _count = 0
//
// var count: Int {
//     get {
//         access(keyPath: \.count)                  // record that someone read `count`
//         return _count
//     }
//     set {
//         withMutation(keyPath: \.count) {          // notify observers around the change
//             _count = newValue
//         }
//     }
// }
//
// extension Counter: Observable {}
```

The stored property moves to a private `_count`, and `count` becomes a computed property that reports reads and writes to an observation registrar. That's how SwiftUI knows exactly which properties each view read, and redraws only views that depend on a changed property. (The exact expansion varies a little between compiler versions.)

This visibility is a big difference from runtime magic like swizzling: you can read exactly what runs, set breakpoints inside generated code, and see compiler errors pointing at it.

## The roles a macro can play

| Role | Spelled | What it can do |
|---|---|---|
| Expression | `#name(…)` | Produce a value, e.g. `#Predicate`, `#expect` |
| Declaration | `#name(…)` | Produce new declarations, e.g. `#Preview` |
| Peer | `@Name` | Add declarations next to the one it's attached to |
| Accessor | `@Name` | Add `get`/`set` accessors to a property |
| Member | `@Name` | Add members to a type |
| Member attribute | `@Name` | Add attributes to a type's members |
| Extension | `@Name` | Add an extension, e.g. a protocol conformance |

A single macro can combine roles. `@Observable` is a member macro (adding the registrar), a member-attribute macro (marking each stored property `@ObservationTracked`, itself an accessor macro), and an extension macro (adding the `Observable` conformance).

## How macros are built

A macro has two parts:

1. A **declaration**, in your library, which defines the macro's signature and points at its implementation.
2. An **implementation**, in a separate **compiler plugin**, which receives the macro's source code as a syntax tree and returns new syntax. Implementations use Apple's **SwiftSyntax** package.

The canonical example, from Xcode's macro template, is `#stringify(x + y)`, which returns both the value and the source text that produced it.

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

And the call site:

```swift
// let (result, code) = #stringify(17 + 25)
// result == 42, code == "17 + 25"
```

The easiest way to start is **File → New → Package → Swift Macro** in Xcode, which sets up the declaration target, the plugin target, a client, and tests.

### What the plugin sees, and what it doesn't

A macro implementation only receives **syntax**: the source code it's attached to, as a tree. It has **no type information** (it can't ask "what's the type of this expression?") and can't see other files or declarations elsewhere. It runs in a **sandboxed process**, with no file system or network access, and its output must depend only on its input. Those restrictions keep builds deterministic and macros predictable.

## Validating input and reporting errors

Because a macro sees real syntax, it can check its input and emit **compiler diagnostics**. A URL macro, for example, can verify a string literal at compile time and return a non-optional `URL`, turning a runtime crash into a compile error with a clear message. In the implementation, that's a thrown error or a call to `context.diagnose(…)` with a message, a location, and even suggested fix-its. No ordinary function can offer that.

Macros should also be **hygienic**: when they introduce helper variables, they use `context.makeUniqueName(_:)`, so generated names can't collide with names in the user's code.

## Testing macros

SwiftSyntax includes `assertMacroExpansion`, which compares a macro's input with the exact source it should expand to, including expected diagnostics:

```swift
// assertMacroExpansion(
//     "#stringify(a + b)",
//     expandedSource: "(a + b, \"a + b\")",
//     macros: ["stringify": StringifyMacro.self]
// )
```

Macro tests are essential: a macro bug becomes a bug in every place the macro is used.

## Macros vs. other tools

| Need | Best tool |
|---|---|
| Reusable logic around one property's storage | Property wrapper |
| Shared behavior across types | Protocol with an extension |
| A computation | A plain function, even a generic one |
| Boilerplate that must see a whole declaration (all properties, all cases) | Macro |
| Checking a literal or argument at compile time | Expression macro |

Reach for a macro when the simpler tools genuinely can't express what you need. `@Observable` is a macro rather than a property wrapper precisely because it has to rewrite *every* property of a type and add a conformance, which no property wrapper can do.

## Costs to keep in mind

- **Build time.** Macro packages depend on SwiftSyntax, a large library that has to be built along with your project, which noticeably slows clean builds.
- **Trust.** A macro plugin runs code on your machine during the build. Xcode asks you to explicitly trust macros from packages for that reason.
- **Readability.** One attribute can generate a lot of code. Keep macros' behavior obvious, document it, and make the expansion easy to understand.
- **Debugging.** Errors can point into generated code, so good diagnostics from the macro itself matter.

## Interview questions

**How do Swift macros differ from C preprocessor macros?**
Swift macros transform type-checked syntax trees in a sandboxed compiler plugin, their expansions are visible and debuggable, and they can't change unrelated code. C macros are textual substitution with none of those guarantees.

**What's the difference between freestanding and attached macros?**
Freestanding macros (`#name`) produce an expression or declarations on their own; attached macros (`@Name`) modify or add to the declaration they're attached to.

**Why is `@Observable` a macro and not a property wrapper?**
It has to transform every stored property of a type and add a protocol conformance; property wrappers only control a single property's storage.

**What information does a macro implementation have?**
Only the syntax of its arguments and the declaration it's attached to: no type information and no access to other files.

## Summary

- Macros generate Swift code at compile time; freestanding macros use `#`, attached macros use `@`.
- Expansions are visible in Xcode, debuggable, and type-checked; `@Observable`'s expansion shows exactly how observation works.
- Implementations live in sandboxed compiler plugins built with SwiftSyntax, see only syntax, and can emit real compiler diagnostics.
- Test macros with `assertMacroExpansion`, and weigh their build-time and readability costs.
- Use macros for boilerplate and compile-time checks that functions, protocols, and property wrappers can't express.
