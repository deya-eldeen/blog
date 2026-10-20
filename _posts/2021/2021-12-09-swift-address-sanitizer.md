---
layout: post
title: "Finding Memory Bugs with Address Sanitizer"
date: "2021-12-09"
last_modified_at: "2021-12-09"
permalink: /swift-address-sanitizer/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Debugging"
  - "Memory Management"
thumbnail: "images/covers/swift_address_sanitizer_thumbnail.webp"
thumbnail_ready: true
---

Safe Swift code can't corrupt memory. But the moment you use `Unsafe` pointers, call into C or C++, or depend on a library that does, memory bugs are possible again, and they're the worst kind: crashes far from the cause, wrong values that appear only sometimes, or no visible symptom at all until a user's data is corrupted. **Address Sanitizer** (ASan) catches these bugs at the exact line where they happen, with a report that tells you where the memory was allocated and freed.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_address_sanitizer_thumbnail.webp"
 alt_text="A magnifying lens detecting a pointer that crosses a memory boundary"
 caption="Finding Memory Bugs with Address Sanitizer"
 width="640"
 height="400"
%}

## What Address Sanitizer finds

| Bug | What happens |
|---|---|
| **Heap use after free** | reading or writing memory that was already deallocated |
| **Heap buffer overflow** | accessing past the end (or before the start) of an allocation |
| **Stack buffer overflow** | the same, for memory on the stack |
| **Stack use after return / scope** | using a pointer to a local variable after its function or scope ended |
| **Double free** | deallocating the same memory twice |
| **Invalid free** | deallocating memory that wasn't allocated that way |

It works for Swift, C, C++, and Objective-C code in the same process, which matters, because the bug is often at a language boundary.

## Enabling it

In Xcode: **Product → Scheme → Edit Scheme → Run → Diagnostics → Address Sanitizer**. Enable it for the **Test** action too, to run your whole test suite with memory checking.

From the command line, with Swift Package Manager:

```bash
swift build --sanitize=address
swift test --sanitize=address
```

ASan rebuilds your code with a check before every memory access. Expect it to run roughly two to three times slower and to use noticeably more memory. That's fine for debugging and testing, and it's why you don't ship it.

## How it works

ASan has three main tricks:

1. **Shadow memory.** For every 8 bytes of your app's memory, ASan keeps 1 byte of "shadow" memory that records how many of those bytes are valid to access. The compiler inserts a check before every load and store: look up the shadow byte, and if the access touches invalid bytes, stop and report.
2. **Red zones.** Every allocation gets **poisoned** padding before and after it. Stepping even one byte outside a buffer lands in a red zone, which the shadow memory marks as invalid.
3. **Quarantine.** Freed memory isn't handed out again immediately. ASan poisons it and holds it in a quarantine queue for a while, so a later access to it is caught as a use-after-free, instead of silently reading whatever was allocated there next.

The result: bugs that would normally corrupt memory silently are reported at the very first bad access.

## Use after free

```swift
func makeDanglingPointer() -> UnsafeMutablePointer<Int> {
    let pointer = UnsafeMutablePointer<Int>.allocate(capacity: 1)
    pointer.initialize(to: 42)
    pointer.deinitialize(count: 1)
    pointer.deallocate()
    return pointer                // the memory is already freed
}

let dangling = makeDanglingPointer()
// print(dangling.pointee)       // heap-use-after-free: ASan stops right here
```

Without ASan, that `print` might show `42`, a random number, or crash much later. With ASan, Xcode stops on the faulty line with **heap-use-after-free**.

## Heap buffer overflow

```swift
func sumFirstFour(_ values: [Int]) -> Int {
    values.withUnsafeBufferPointer { buffer in
        var total = 0
        for index in 0..<4 {
            total += buffer.baseAddress![index]    // raw pointer access: no bounds check
        }
        return total
    }
}

// sumFirstFour([1, 2, 3])        // heap-buffer-overflow: reads one element past the end
```

Swift arrays check their bounds, and so do `UnsafeBufferPointer` subscripts in debug builds. But `baseAddress!` turns the buffer into a raw `UnsafePointer`, which checks nothing. ASan reports **heap-buffer-overflow** at the faulty read. Iterating `buffer` directly, or indexing it instead of `baseAddress`, avoids the bug.

## Stack buffer overflow

```swift
func readPastLocal() -> Int {
    var value = 0
    return withUnsafeMutablePointer(to: &value) { pointer in
        pointer.advanced(by: 1).pointee     // reads the 8 bytes after `value`
    }
}

// print(readPastLocal())          // stack-buffer-overflow
```

## Escaping a pointer to a local variable

```swift
func escapedPointer() -> UnsafeMutablePointer<Int> {
    var local = 42
    return withUnsafeMutablePointer(to: &local) { $0 }   // the pointer outlives `local`
}

// print(escapedPointer().pointee)   // undefined behavior
```

This is the most common pointer mistake in Swift: the pointer from `withUnsafe…` is only valid **inside** the closure. Interestingly, ASan doesn't catch this one with its default settings: it just prints a garbage number. Turn on the stricter check by adding an environment variable to your scheme (**Edit Scheme → Run → Arguments → Environment Variables**):

```text
ASAN_OPTIONS=detect_stack_use_after_return=1
```

With it, ASan moves local variables to a special heap-backed area and reports **stack-use-after-return** at the bad read. It's off by default because it costs extra memory, but it's worth enabling when you suspect stack pointer bugs.

## Double free

```swift
let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 16)
buffer.deallocate()
// buffer.deallocate()              // attempting double-free
```

## Reading a report

An ASan report has a consistent structure:

1. **The bug type and address**, like `heap-use-after-free on address 0x6020000000f0`.
2. **The faulty access**: a read or write of N bytes, with the stack trace where it happened.
3. **Where the memory was freed**, for use-after-free and double free, with a stack trace.
4. **Where it was originally allocated**, with a stack trace.
5. A **shadow memory map** around the address, rarely needed.

The first trace tells you *where* the program misbehaved. The other two tell you *why* the memory wasn't valid anymore. Together, they usually point straight at the bug: "this object was freed here, but this other code still kept a pointer to it." Xcode shows the same information in the Issue navigator, and lets you jump to each frame.

## Limitations

- **It only finds bugs on code paths you run.** Good test coverage is what makes ASan effective.
- **It doesn't detect uninitialized reads** or data races. Use Thread Sanitizer for races; it can't be enabled together with ASan, so run them in separate passes.
- **It slows things down** and changes memory layout and timing, so it's for debug builds, tests, and CI, not for production.
- **Code must be rebuilt** with instrumentation. Precompiled binaries you link against aren't checked internally, although their calls to `malloc` and `free` are still tracked.

## Related tools

| Tool | Finds |
|---|---|
| **Address Sanitizer** | use-after-free, buffer overflows, double frees, stack misuse |
| **Thread Sanitizer** | data races between threads |
| **Undefined Behavior Sanitizer** | undefined behavior in C-family code, like misaligned pointers or signed overflow |
| **Malloc Scribble** | fills freed memory with `0x55`, so stale reads return obviously wrong values |
| **Guard Malloc** | puts each allocation on its own page so overflows crash immediately (simulator and macOS) |
| **Zombie Objects** | messages sent to deallocated Objective-C objects |

## When to reach for it

- Your app uses **unsafe pointers**, C or C++ code, or native third-party libraries.
- You see **crashes that make no sense**: `EXC_BAD_ACCESS` in unrelated code, corrupted values, crashes that disappear when you add logging.
- **Regularly, in CI**: run the test suite with ASan enabled on a schedule, so memory bugs are caught soon after they're introduced.

In pure, safe Swift, ASan has very little to find. That's a good argument for keeping unsafe code small and wrapped in safe types, so the area ASan has to cover stays small too.

## Interview questions

**How does Address Sanitizer detect an out-of-bounds access?**
Allocations are surrounded by poisoned red zones tracked in shadow memory; the compiler adds a check before every access, and touching a poisoned byte triggers a report.

**Why does ASan catch use-after-free reliably?**
Freed memory is poisoned and quarantined instead of being reused immediately, so later accesses hit poisoned shadow bytes.

**Can you run Address Sanitizer and Thread Sanitizer together?**
No. Each needs its own instrumentation and memory layout; run them in separate test passes.

**Why ship without ASan?**
It roughly doubles or triples CPU time and increases memory use; it's a debugging tool, not a runtime safety net.

## Summary

- ASan detects use-after-free, buffer overflows, stack misuse, and double frees at the exact faulty access.
- It works by shadow memory, poisoned red zones, and a quarantine for freed memory.
- Enable it in the scheme's Diagnostics tab or with `--sanitize=address`; add `detect_stack_use_after_return=1` for escaped stack pointers.
- Reports show the bad access, where memory was freed, and where it was allocated.
- Use it whenever unsafe pointers or C/C++ code are involved, and run your tests with it in CI.
