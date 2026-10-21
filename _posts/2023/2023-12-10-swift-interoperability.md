---
layout: post
hidden: true
title: "Swift Interoperability with Objective-C, C, and C++"
date: "2023-12-10"
last_modified_at: "2023-12-10"
permalink: /swift-interoperability/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "Objective-C"
  - "Interoperability"
thumbnail: "images/covers/swift_interoperability_thumbnail.webp"
thumbnail_ready: true
---

Swift didn't arrive in an empty world. Apple's platforms are built on decades of Objective-C and C, and huge amounts of valuable code are written in C++. Swift was designed to call into all three directly, and, for Objective-C and since Swift 5.9 for C++, to be called back. Understanding how that bridge works helps you use system APIs well, migrate old projects one file at a time, wrap C libraries safely, and reuse C++ code without writing glue by hand.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_interoperability_thumbnail.webp"
 alt_text="Distinct software modules connected through language-interface adapters"
 caption="Swift Interoperability with Objective-C, C, and C++"
 width="640"
 height="400"
%}

## Objective-C → Swift: what the importer does

When you `import Foundation` or `import UIKit`, you're using Objective-C APIs that the compiler **imports** into Swift on the fly. It doesn't just expose them as-is; it translates them to feel like Swift. Here's an Objective-C header:

```objc
// Bridge.h
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, PaymentStatus) {
    PaymentStatusPending,
    PaymentStatusPaid,
    PaymentStatusFailed
};

typedef NS_OPTIONS(NSUInteger, ShippingOptions) {
    ShippingOptionsExpress  = 1 << 0,
    ShippingOptionsGiftWrap = 1 << 1
};

@interface LegacyStore : NSObject
- (nullable NSString *)titleForItemWithID:(NSInteger)itemID;
- (BOOL)saveItemNamed:(NSString *)name error:(NSError **)error;
- (void)insertItem:(NSString *)item atIndex:(NSUInteger)index;
@end

NS_ASSUME_NONNULL_END
```

And here's how Swift sees it:

```swift
// let store = LegacyStore()
//
// let title = store.titleForItem(withID: 1)   // String?: `nullable` became an optional
// try store.saveItemNamed("Pen")              // BOOL + NSError** became `throws`
// store.insertItem("Pen", at: 0)              // "atIndex:" was shortened to "at:"
//
// let status: PaymentStatus = .paid          // NS_ENUM became a Swift enum
// let options: ShippingOptions = [.express, .giftWrap]   // NS_OPTIONS became an OptionSet
```

The main translations:

- **Names** are split into a base name and argument labels, and redundant words are trimmed: `insertItem:atIndex:` becomes `insertItem(_:at:)`, and `titleForItemWithID:` becomes `titleForItem(withID:)`.
- **Nullability** annotations decide optionality. `nullable` becomes an optional, `nonnull` (or anything inside `NS_ASSUME_NONNULL_BEGIN`/`END`) becomes non-optional. Unannotated pointers become **implicitly unwrapped optionals** (`String!`), the worst of both worlds.
- **Errors:** a method that returns `BOOL` (or an object) and takes a trailing `NSError **` becomes a Swift `throws` method.
- **Enums and options:** `NS_ENUM` becomes a Swift enum, `NS_OPTIONS` an `OptionSet`, and `NS_ERROR_ENUM` an error type you can `catch`.
- **Lightweight generics:** `NSArray<NSString *> *` imports as `[String]`, while a bare `NSArray *` imports as `[Any]`.
- **Bridged types:** `NSString` ↔ `String`, `NSArray` ↔ `Array`, `NSDictionary` ↔ `Dictionary`, `NSNumber` ↔ numeric types.
- **Completion handlers become `async`** (Swift 5.5): a method whose last parameter is a completion block can be called with `await`.

### Getting your own Objective-C into Swift

In an **app target**, add a **bridging header** (`MyApp-Bridging-Header.h`) and `#import` the headers Swift should see. In a **framework** or package, expose headers through the module's umbrella header or a **module map** instead; frameworks can't use bridging headers.

Annotate the headers before importing them: `NS_ASSUME_NONNULL_BEGIN`/`END`, `nullable` where nil is real, and lightweight generics. That single step makes the Swift side dramatically nicer.

### Refining the Swift API from Objective-C

Objective-C authors can shape how their API looks in Swift:

```objc
- (void)loadWithCompletion:(void (^)(NSData * _Nullable, NSError * _Nullable))completion
    NS_SWIFT_NAME(load(completion:));

+ (instancetype)storeWithPath:(NSString *)path NS_SWIFT_NAME(init(path:));

- (void)legacyReset NS_SWIFT_UNAVAILABLE("Use reset(keepingCache:) instead");

- (NSInteger)rawCount NS_REFINED_FOR_SWIFT;   // imported as __rawCount, to wrap in a nicer Swift API
```

## Swift → Objective-C

Objective-C can only see Swift declarations it can represent:

- classes that inherit (directly or indirectly) from `NSObject`,
- members marked `@objc` (or every member, with `@objcMembers` on the class),
- `@objc` protocols, and enums declared `@objc` with an integer raw type.

```swift
import Foundation

@objc(MYPaymentService)
final class PaymentService: NSObject {
    @objc func charge(amount: Double) -> Bool {
        amount > 0
    }

    // Not visible to Objective-C: Decimal and String parameters are fine,
    // but a Swift-only type like a struct or a generic couldn't be represented.
    func charge(_ amount: Decimal, currency: String) {}
}

print(PaymentService().charge(amount: 10))   // true
```

Xcode generates a header, `MyApp-Swift.h`, which Objective-C files `#import` to use these classes. The `@objc(MYPaymentService)` attribute sets the name Objective-C sees, which is useful for adding a prefix.

Swift features **without** an Objective-C equivalent aren't visible: structs, enums with associated values, generics, tuples, optionals of value types like `Int?`, and protocols with associated types. The common pattern is a thin `@objc` wrapper class around Swift-only code.

`@objc` only *exposes* a member. `dynamic` additionally forces calls to go through the Objective-C runtime, which KVO and method swizzling require.

## C

Swift imports C headers directly, through a bridging header or a module map. C functions become Swift functions, C structs become Swift structs (with a memberwise initializer), plain C enums become a struct type plus matching global constants (or real Swift enums, when declared with `NS_ENUM` or `enum_extensibility`), and pointers become `Unsafe…Pointer` types:

| C | Swift |
|---|---|
| `const T *` | `UnsafePointer<T>` |
| `T *` | `UnsafeMutablePointer<T>` |
| `const void *` / `void *` | `UnsafeRawPointer` / `UnsafeMutableRawPointer` |
| `T * _Nullable` | `Unsafe…Pointer<T>?` |
| pointer to an incomplete struct | `OpaquePointer` |
| `const char *` parameter | accepts a Swift `String` directly |

Many C APIs are available just by importing Foundation (which re-exports Darwin):

```swift
let squareRoot = sqrt(16.0)
let length = strlen("hello")      // a Swift String is passed as `const char *` automatically
print(squareRoot, length)         // 4.0 5
```

### C callbacks and context pointers

A common C pattern is a callback function pointer plus a `void *context` that's passed back to it. A Swift closure can be used as a C function pointer only if it **captures nothing** (it becomes a `@convention(c)` function), so state travels through the context pointer. `Unmanaged` converts a Swift object to and from that raw pointer:

```c
// C header
typedef void (*progress_callback)(void * _Nullable context, int percent);
void run_job(progress_callback callback, void * _Nullable context);
```

```swift
// final class JobTracker {
//     var updates: [Int] = []
// }
//
// let tracker = JobTracker()
// let context = Unmanaged.passUnretained(tracker).toOpaque()
//
// run_job({ context, percent in
//     // No captures allowed here: recover the object from the context pointer.
//     let tracker = Unmanaged<JobTracker>.fromOpaque(context!).takeUnretainedValue()
//     tracker.updates.append(Int(percent))
// }, context)
//
// print(tracker.updates)   // [0, 50, 100]
```

`passUnretained` doesn't keep the object alive, so `tracker` must outlive the job, which is fine here because `run_job` is synchronous. If the C library calls back later, use `passRetained` and balance it with exactly one `release()` when the callbacks are done.

## C++ (Swift 5.9)

Since Swift 5.9, Swift can call C++ directly, with no Objective-C++ wrapper in between. Enable it per target: in Xcode, set **C++ and Objective-C Interoperability** to "C++ / Objective-C++"; in a package, add `swiftSettings: [.interoperabilityMode(.Cxx)]`. Expose the C++ headers through a module map:

```cpp
// Geometry.hpp
#include <string>
#include <vector>

struct Point { double x; double y; };
using PointVector = std::vector<Point>;

inline double totalX(const PointVector &points) {
    double sum = 0;
    for (const auto &p : points) sum += p.x;
    return sum;
}

inline std::string greeting(const std::string &name) { return "Hello, " + name; }
```

```swift
// import Geometry
// import CxxStdlib
//
// var points = PointVector()
// points.push_back(Point(x: 1, y: 2))
// points.push_back(Point(x: 3, y: 4))
// print(totalX(points), points.size())     // 4.0 2
//
// let message = greeting(std.string("Sam"))
// print(String(message))                   // Hello, Sam
```

A few practical notes:

- **Use C++ type aliases for templates.** Swift sees `std::vector`'s hidden allocator parameter, so writing `std.vector<Point>` in Swift doesn't work; a `using PointVector = std::vector<Point>;` alias in the header does.
- **C++ value types become Swift structs**, copied with their copy constructors. Types that should be shared by reference can be annotated (`SWIFT_SHARED_REFERENCE`) to import as reference-counted classes.
- **Standard library types** like `std::string`, `std::vector`, `std::map`, and `std::optional` are supported, with conversions such as `String(cxxString)`.
- **Coverage is growing.** Not every C++ feature imports yet; check the Swift documentation's C++ interoperability status for your compiler version.

C++ code can call Swift too, through a generated header, which makes gradual adoption possible in both directions.

## Practical advice

- **Migrate incrementally.** Mixed Objective-C/Swift targets are normal. Convert one class at a time, starting with leaf code nothing else depends on.
- **Annotate before importing.** Nullability and generics turn `String!` and `[Any]` into `String?` and `[String]`.
- **Wrap unsafe APIs.** Hide C pointers and `Unmanaged` behind small Swift types with safe interfaces.
- **Keep the boundary narrow.** The fewer types cross between languages, the easier both sides are to change.

## Interview questions

**How does an Objective-C method with an `NSError **` parameter appear in Swift?**
As a `throws` method, with the error parameter removed and a `BOOL` return value dropped.

**What happens to unannotated Objective-C pointers?**
They import as implicitly unwrapped optionals (`T!`). Add nullability annotations to get proper optionals or non-optionals.

**Can a capturing Swift closure be passed as a C function pointer?**
No. C function pointers can't carry context; pass state through a `void *` context parameter, typically with `Unmanaged`.

**What can't Objective-C see from Swift?**
Structs, enums with associated values, generics, tuples, and other Swift-only types; only `NSObject` subclasses and `@objc` members are exposed.

## Summary

- The importer translates Objective-C into idiomatic Swift: names and labels, optionals from nullability, `throws` from `NSError **`, enums and option sets, `async` from completion handlers.
- Swift exposes `NSObject` subclasses and `@objc` members to Objective-C through a generated header.
- C headers import directly; pointers map to `Unsafe…Pointer` types, and callbacks carry state through context pointers.
- Since Swift 5.9, Swift calls C++ directly when C++ interoperability is enabled; use type aliases for templates.
