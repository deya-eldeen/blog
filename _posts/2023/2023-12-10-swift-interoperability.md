---
layout: post
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
---

Swift didn't arrive in an empty world. Apple's platforms are built on decades of Objective-C and C, and huge amounts of useful code are written in C++. Swift was designed to call into all three and, in the case of Objective-C, to be called back. Understanding how that bridge works helps you use system APIs, migrate old projects gradually, and reuse existing libraries.

<!--more-->

## Objective-C → Swift

When you `import Foundation` or `import UIKit`, you're using Objective-C APIs, imported and translated into Swift automatically. The importer:

- turns Objective-C methods into Swift-style names, so `-insertSubview:atIndex:` becomes `insertSubview(_:at:)`,
- maps `nil`-able pointers to optionals, using **nullability annotations** (`nullable`, `nonnull`),
- bridges types like `NSString` ↔ `String`, `NSArray` ↔ `Array`, and `NSDictionary` ↔ `Dictionary`,
- turns `NSError **` out-parameters into Swift `throws`,
- turns completion-handler methods into `async` functions.

### Using your own Objective-C code in an app

Add a **bridging header** to the app target, `MyApp-Bridging-Header.h`, and import the headers you want Swift to see:

```objc
// MyApp-Bridging-Header.h
#import "LegacyAnalytics.h"
```

```objc
// LegacyAnalytics.h
NS_ASSUME_NONNULL_BEGIN
@interface LegacyAnalytics : NSObject
- (void)trackEvent:(NSString *)name properties:(nullable NSDictionary<NSString *, id> *)properties;
@end
NS_ASSUME_NONNULL_END
```

In Swift, it's just another class:

```swift
// LegacyAnalytics().trackEvent("signup", properties: ["plan": "pro"])
```

Annotate headers with nullability and lightweight generics (`NSArray<NSString *> *`). Without them, Swift has to import pointers as implicitly unwrapped optionals and collections as `[Any]`. In frameworks, use a module map or umbrella header instead of a bridging header.

### Refining names

Objective-C authors can shape the Swift API with macros like `NS_SWIFT_NAME`, `NS_REFINED_FOR_SWIFT`, and `NS_SWIFT_UNAVAILABLE`:

```objc
- (void)loadWithCompletion:(void (^)(NSData * _Nullable, NSError * _Nullable))completion
    NS_SWIFT_NAME(load(completion:));
```

## Swift → Objective-C

Objective-C can only see Swift declarations it understands: classes that inherit from `NSObject`, `@objc` protocols, and members marked `@objc`:

```swift
import Foundation

@objc(MYPaymentService)
final class PaymentService: NSObject {
    @objc func charge(amount: Double) -> Bool {
        amount > 0
    }

    // Not visible to Objective-C: Swift-only types can't be represented there.
    func charge(_ amount: Decimal, currency: String) {}
}
```

Xcode generates a header, `MyApp-Swift.h`, that Objective-C files import to use these classes. Swift features without an Objective-C equivalent, like structs, enums with associated values, generics, tuples, and `async` sequences, aren't visible. A common pattern is a thin `@objc` wrapper class around Swift-only code.

`@objc` exposes a member; `dynamic` additionally forces calls to go through the Objective-C runtime, which is required for [KVO](/swift-key-value-observing/) and [swizzling](/swift-method-swizzling/).

## C

Swift imports C headers directly, through a bridging header or a module map. C functions become Swift functions, structs become Swift structs, and pointers become `UnsafePointer` types:

```c
// mathutils.h
double average(const double *values, int count);
```

```swift
// let values: [Double] = [1, 2, 3]
// let mean = values.withUnsafeBufferPointer { buffer in
//     average(buffer.baseAddress, Int32(buffer.count))
// }
```

Many C APIs are already available. Darwin's standard C library, for example, comes with `Foundation`:

```swift
let squareRoot = sqrt(16.0)
let length = strlen("hello")      // Swift strings are passed to `const char *` automatically
print(squareRoot, length)
```

Pointer types tell you who owns memory and whether it's mutable: `UnsafePointer<T>` (`const T *`), `UnsafeMutablePointer<T>` (`T *`), `UnsafeRawPointer` (`const void *`), and `OpaquePointer` for incomplete struct types. Keep pointers inside `withUnsafe…` closures and never let them escape.

## C++

Since Swift 5.9, Swift can call C++ directly, with no Objective-C++ wrapper in between. Enable it per target with the **C++ and Objective-C Interoperability** build setting, set to "C++ / Objective-C++", or in a package:

```swift
// .target(
//     name: "Engine",
//     swiftSettings: [.interoperabilityMode(.Cxx)]
// )
```

Then C++ types are usable from Swift:

```cpp
// Geometry.hpp
#include <vector>
struct Point { double x; double y; };
inline double totalX(const std::vector<Point> &points) {
    double sum = 0;
    for (const auto &p : points) sum += p.x;
    return sum;
}
```

```swift
// var points = std.vector<Point>()
// points.push_back(Point(x: 1, y: 2))
// print(totalX(points))
```

C++ interoperability supports many standard library types (`std::string`, `std::vector`, `std::map`) and is still evolving, with each Swift release covering more of the language. C++ code can also call Swift, through a generated header.

## Practical advice

- **Migrate incrementally.** Mixed Objective-C and Swift targets are normal; convert one class at a time, starting with leaf code that nothing else depends on.
- **Annotate before importing.** Nullability and generics annotations make imported APIs feel native.
- **Wrap unsafe APIs.** Hide C pointers behind small Swift types with safe interfaces.
- **Keep the boundary narrow.** The fewer types cross between languages, the easier both sides are to change.

## Summary

- Objective-C APIs are imported automatically, with renaming, optionals from nullability, error-to-`throws`, and `async` translation.
- Swift exposes `NSObject` subclasses and `@objc` members to Objective-C through a generated header.
- C headers import directly, with pointers mapped to `Unsafe…Pointer` types.
- Swift 5.9+ calls C++ directly when C++ interoperability is enabled.
