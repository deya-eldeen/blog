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
---

Most Swift code can't corrupt memory. But the moment you use `Unsafe` pointers, call C or C++ code, or depend on a library that does, memory bugs are possible again, and they're the worst kind: crashes far from the cause, or no crash at all, just wrong data. **Address Sanitizer** (ASan) catches these bugs at the exact line where they happen.

<!--more-->

## What Address Sanitizer finds

- **Use after free:** accessing memory that has already been deallocated.
- **Heap buffer overflow:** reading or writing past the end, or before the start, of an allocation.
- **Stack buffer overflow:** the same, for stack memory.
- **Use after scope:** using a pointer to a local variable after its scope ended.
- **Double free** and some invalid frees.

It works for Swift, C, C++, and Objective-C code in the same app.

## Enabling it

In Xcode: **Product → Scheme → Edit Scheme → Run → Diagnostics → Address Sanitizer**. You can also enable it for the **Test** action, which is a great way to run your whole test suite with memory checking.

From the command line:

```bash
swift build --sanitize=address
swift test --sanitize=address
```

ASan rebuilds your code with extra checks around every memory access. Expect your app to run roughly 2–3× slower and use more memory, which is fine for debugging and testing, but not for release builds.

## How it works

ASan keeps **shadow memory**: a compact map recording which bytes of your app's memory are valid to access. The compiler inserts a check before every load and store. When memory is freed, ASan marks it poisoned and keeps it out of circulation for a while (in "quarantine"), so a later access to it is caught instead of silently reading whatever was allocated there next. Allocations also get poisoned **red zones** around them, so stepping just outside a buffer is caught.

## A use-after-free in Swift

```swift
func makeDanglingPointer() -> UnsafeMutablePointer<Int> {
    let pointer = UnsafeMutablePointer<Int>.allocate(capacity: 1)
    pointer.initialize(to: 42)
    pointer.deinitialize(count: 1)
    pointer.deallocate()
    return pointer                // the memory is already freed
}

let dangling = makeDanglingPointer()
// print(dangling.pointee)       // use after free: ASan stops right here
```

Without ASan, that `print` might show `42`, a random number, or crash much later. With ASan, the app stops immediately and Xcode shows a report: **heap-use-after-free**, with three stack traces: where the bad access happened, where the memory was freed, and where it was originally allocated.

## A buffer overflow

```swift
func sumFirstFour(_ values: [Int]) -> Int {
    values.withUnsafeBufferPointer { buffer in
        var total = 0
        for index in 0..<4 {
            total += buffer.baseAddress![index]    // no bounds check on raw pointer access
        }
        return total
    }
}

// sumFirstFour([1, 2, 3])        // reads past the end: heap-buffer-overflow
```

Swift's arrays check their bounds, but raw pointers don't, and `baseAddress!` + an index skips every safety net. ASan reports a **heap-buffer-overflow** at the faulty read. Iterating the `buffer` itself, or indexing the `UnsafeBufferPointer` (which is bounds-checked in debug builds), avoids the bug.

## Reading a report

An ASan report contains:

1. **The bug type and address**, like `heap-use-after-free on address 0x6020000000f0`.
2. **The faulty access**, a read or write of N bytes, with a stack trace.
3. **Where the memory was freed**, for use-after-free.
4. **Where it was allocated**.
5. A **shadow memory dump**, rarely needed.

The first stack trace tells you where the program misbehaved; the other two tell you why that memory wasn't valid anymore. Together, they usually point straight at the bug.

## Related tools

| Tool | Finds |
|---|---|
| **Address Sanitizer** | use-after-free, buffer overflows, double frees |
| **Thread Sanitizer** | data races between threads (can't be enabled together with ASan) |
| **Undefined Behavior Sanitizer** | undefined behavior in C-family code, like misaligned pointers |
| **Malloc Scribble / Guard Malloc** | lighter-weight checks that make some memory bugs crash sooner |
| **Zombie Objects** | messages sent to deallocated Objective-C objects |

## When to reach for it

- Your app has **unsafe pointers**, C/C++ code, or third-party native libraries.
- You see **crashes that make no sense**, like `EXC_BAD_ACCESS` in unrelated code or corrupted values.
- **In CI**, by running the test suite with ASan enabled on a regular schedule.

In pure, safe Swift, ASan has little to find, which is a good reason to keep unsafe code small and wrapped in safe types.

## Summary

- ASan detects use-after-free, buffer overflows, use-after-scope, and double frees at the exact faulty access.
- Enable it in the scheme's Diagnostics tab or with `--sanitize=address`; it slows code down about 2–3×.
- Reports show the bad access, where memory was freed, and where it was allocated.
- Use it whenever unsafe pointers or C/C++ code are involved, and run your tests with it in CI.
