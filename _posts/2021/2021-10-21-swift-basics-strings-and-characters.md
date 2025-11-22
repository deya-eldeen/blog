---
layout: post
title: "Strings and Characters That Don’t Bite"
date: "2021-10-21"
last_modified_at: "2021-10-21"
permalink: /swift-basics-strings-characters/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swift_article.webp"
categories:
  - "Development"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Strings"
  - "Basics"
---

Swift strings are Unicode-correct, safe, and come with a few sharp edges if you assume they behave like simple arrays of bytes. Here’s how to handle them without surprises.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/swift_article.webp"
 alt_text="" 
 caption=""
 width="960" 
 height="1568"
%}

## Creating and combining

```swift
let greeting = "Hello"
let name = "Deya"
let full = greeting + ", " + name  // concatenation
let templated = "Hello, \(name)"   // interpolation
```

Prefer interpolation for readability, and avoid building strings in loops—use `joined()` or `reduce`.

## Length: use `count`, not byte size

```swift
let emoji = "👍🏼"
emoji.count        // 1 (one extended grapheme cluster)
emoji.utf8.count   // 6 (bytes)
```

`count` reflects user-visible characters; `utf8.count` is byte length. Choose the right one for your task.

## Iterating safely

```swift
for ch in "café" {
    print(ch) // c, a, f, é
}
```

Iteration is by grapheme cluster (what humans see), so composed characters stay together.

If you need low-level processing, iterate over `unicodeScalars`:

```swift
for scalar in "ABC".unicodeScalars {
    print(scalar.value) // 65, 66, 67
}
```

## Slicing strings

Indices are not integers. Always derive indices from the string:

```swift
let text = "Swift"
if let idx = text.firstIndex(of: "i") {
let slice = text[text.startIndex...idx] // "Swi"
}
```

Never do `text[2]`; use `index(_:offsetBy:)` to navigate.

Keep slices short-lived. `Substring` reuses the original storage; convert to `String` if you keep it:

```swift
let shortLived = text[text.startIndex...idx] // Substring
let owned = String(shortLived)               // owns its storage
```

## Searching and replacing

```swift
let words = "hello swift world"
let hasSwift = words.contains("swift")
let swapped = words.replacingOccurrences(of: "swift", with: "Swift")
```

For complex searches, use `range(of:)` or `replacingOccurrences` with options like `.caseInsensitive`.

For localized comparisons, prefer `localizedCaseInsensitiveContains`:

```swift
words.localizedCaseInsensitiveContains("Swift") // true
```

## Trimming and splitting

```swift
let raw = "  spaced out  "
let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines) // "spaced out"

let csv = "apple,banana,pear"
let parts = csv.split(separator: ",") // ["apple", "banana", "pear"]
```

`split` returns `Substring`; convert to `String` if you need to hold it long-term (`String(parts[0])`).

## Building strings efficiently

For many appends, use `joined` or `reduce`. If you must mutate, use `append` on `String`:

```swift
var log = ""
["one", "two", "three"].forEach { log.append("\($0)\n") }
```

For very large data, consider `TextOutputStream` or `Data` buffers, not naive string concatenation.

Multiline strings are handy for formatting, but trim indentation with care:

```swift
let message = """
    Line one
    Line two
    """
```

Use raw strings (`#"..."#`) when you need fewer escapes, especially in regex literals.

## String vs. NSString (and bridging)

`String` is Swift-native, Unicode-correct, and value-typed. `NSString` is the Objective-C class you get when bridging into Cocoa APIs.

- Use `String` by default; it is copy-on-write and fast for typical app work.
- Bridging is automatic: most Foundation APIs that expect `NSString` accept `String` seamlessly.
- When you need Objective-C specific behaviors (like `localizedCaseInsensitiveCompare`), bridge explicitly:

```swift
let swift: String = "Résumé"
let objc: NSString = swift as NSString
let ordered = objc.localizedCaseInsensitiveCompare("resume")
```

- Avoid unnecessary bridging in tight loops—keep values as `String` unless you need an `NSString` API.

If you must share mutable text with Objective-C, use `NSMutableString` carefully; in Swift, prefer immutable `String` and create new copies when needed.

## Characters vs. UnicodeScalars

Use `Character` for user-facing text; `UnicodeScalar` for low-level processing (e.g., ASCII checks):

```swift
for scalar in "ABC".unicodeScalars {
    print(scalar.value) // 65, 66, 67
}
```

## Validating and normalizing

If you compare user input, consider case-insensitive and diacritic-insensitive comparisons:

```swift
let a = "café"
let b = "CAFE"
let same = a.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current) ==
           b.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
```

When comparing paths or identifiers, normalize both sides the same way to avoid surprises.

## Formatting and interpolation tips

Prefer interpolation over concatenation for readability:

```swift
let count = 3
let summary = "You have \(count) messages."
```

For numbers and dates shown to users, use `NumberFormatter` and `DateFormatter` to respect locale:

```swift
let formatter = NumberFormatter()
formatter.numberStyle = .decimal
let text = formatter.string(from: 12345.67)!
```

## Takeaways

- Use interpolation, avoid heavy concatenation in loops.
- Always use `count` for user-visible length; bytes and scalars are for low-level needs.
- Slice with string indices, not integers.
- Normalize comparisons when dealing with user input or search.
- Prefer `String` over `NSString`, bridge only when you need Foundation-only behaviors, and convert `Substring` to `String` if you keep it.
- Use formatters for user-facing numbers and dates; keep low-level scalar work for specialized cases.
