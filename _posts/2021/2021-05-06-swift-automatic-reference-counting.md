---
layout: post
title: "Automatic Reference Counting (ARC) in Swift"
date: "2021-05-06"
last_modified_at: "2021-05-06"
permalink: /swift-automatic-reference-counting/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "ARC"
  - "Memory Management"
---

Swift manages the memory of class instances with **Automatic Reference Counting** (ARC). Every object keeps count of how many strong references point at it; when the count drops to zero, the object is destroyed immediately. There's no garbage collector pausing your app and no manual `free`. But ARC has one blind spot, reference cycles, and understanding how it works is the difference between an app that releases memory and one that slowly leaks it.

<!--more-->

## How ARC counts

Every **strong** reference to a class instance adds one to its reference count, and every reference that goes away subtracts one. When the count reaches zero, `deinit` runs and the memory is released:

```swift
final class Person {
    let name: String

    init(name: String) {
        self.name = name
        print("\(name) created")
    }

    deinit {
        print("\(name) freed")
    }
}

var ref1: Person? = Person(name: "Ada")   // count = 1
var ref2 = ref1                           // count = 2
var ref3 = ref1                           // count = 3

ref1 = nil                                // count = 2
ref2 = nil                                // count = 1
ref3 = nil                                // count = 0: "Ada freed"
```

The compiler inserts the retain (increment) and release (decrement) calls for you at compile time, and the optimizer removes many redundant pairs. That's the "automatic" part: the counting happens at runtime, but the bookkeeping is generated at compile time.

ARC only applies to **reference types**: class instances, and closures (which are reference-counted objects too). Structs and enums are copied, not shared, so they don't need counting, although any class references stored inside them are counted.

## When does an object die?

Deterministically: the moment the last strong reference is released. That's different from garbage-collected languages, where an unreachable object waits for the next collection cycle. It makes ARC great for objects that hold scarce resources, like files and sockets, which can be closed in `deinit` at a predictable moment.

One subtlety: Swift only promises that an object lives until the **last use** of its last strong reference, not until the end of the scope. The optimizer may release it earlier than you'd expect:

```swift
func process() {
    let report = Person(name: "Report")
    print("Using \(report.name)")
    // `report` may be released right after its last use above,
    // even though the function hasn't returned yet.
    print("Doing other work")
}
```

That rarely matters, but it does when something else depends on the object staying alive, like a weak or unowned reference elsewhere, or an object that registers itself somewhere in `init`. `withExtendedLifetime(_:_:)` makes the guarantee explicit:

```swift
let session = Person(name: "Session")
withExtendedLifetime(session) {
    print("Session is guaranteed to be alive for this whole block")
}
```

## Strong reference cycles

ARC's one weakness: if two objects hold strong references to each other, neither count can ever reach zero.

```swift
final class Tenant {
    let name: String
    var apartment: Apartment?
    init(name: String) { self.name = name }
    deinit { print("Tenant \(name) freed") }
}

final class Apartment {
    let unit: String
    var tenant: Tenant?
    init(unit: String) { self.unit = unit }
    deinit { print("Apartment \(unit) freed") }
}

var john: Tenant? = Tenant(name: "John")
var unit4A: Apartment? = Apartment(unit: "4A")

john?.apartment = unit4A
unit4A?.tenant = john

john = nil
unit4A = nil
// Nothing is printed: each object keeps the other alive forever.
```

After the last two lines, your code has no way to reach either object, but both are still in memory. That's a **memory leak**. One leaked `Tenant` is harmless; one leaked view controller per screen visit, holding images and data, eventually gets your app killed.

## `weak` references

A `weak` reference doesn't increase the strong count. When the object it points to is destroyed, every weak reference to it **automatically becomes `nil`**. That's why weak references must be optional `var`s:

```swift
final class Lease {
    let unit: String
    weak var tenant: Tenant?     // doesn't keep the tenant alive
    init(unit: String) { self.unit = unit }
}

var occupant: Tenant? = Tenant(name: "Ana")
let lease = Lease(unit: "7B")
lease.tenant = occupant
print(lease.tenant?.name ?? "empty")   // Ana

occupant = nil                         // "Tenant Ana freed"
print(lease.tenant?.name ?? "empty")   // empty: zeroed automatically
```

Use `weak` when the other object **may be freed first**, and it's fine for your reference to become `nil` when that happens. The classic example is a **delegate**: a table view shouldn't keep its delegate (usually the view controller that owns the table) alive, so delegate properties are declared `weak`:

```swift
protocol DownloadDelegate: AnyObject {
    func downloadDidFinish()
}

final class DownloadTask {
    weak var delegate: DownloadDelegate?

    func finish() {
        delegate?.downloadDidFinish()   // safely does nothing if the delegate is gone
    }
}
```

The `AnyObject` constraint is required: only class instances can be referenced weakly, so the protocol must be class-only.

## `unowned` references

An `unowned` reference also doesn't increase the strong count, but it isn't optional and never becomes `nil`. It expresses an assumption: **the referenced object will outlive this reference**. A credit card never outlives its customer:

```swift
final class Customer {
    let name: String
    var card: CreditCard?
    init(name: String) { self.name = name }
    deinit { print("Customer \(name) freed") }
}

final class CreditCard {
    let number: String
    unowned let owner: Customer
    init(number: String, owner: Customer) {
        self.number = number
        self.owner = owner
    }
    deinit { print("Card \(number) freed") }
}

var ada: Customer? = Customer(name: "Ada")
ada?.card = CreditCard(number: "4242", owner: ada!)
ada = nil
// Customer Ada freed
// Card 4242 freed
```

If the assumption is ever wrong and you access an `unowned` reference after its object is gone, Swift stops your app with a fatal error ("attempted to read an unowned reference but object … was already deallocated"). That's a crash, but a **safe** one: Swift checks, rather than reading freed memory.

`unowned(unsafe)` removes that check, like a raw pointer. Accessing a dead object through it is undefined behavior. Avoid it unless profiling shows the check matters, which is almost never.

**Rule of thumb:** use `weak` unless you can prove the lifetime relationship. The optional is a small price for safety.

| | `strong` (default) | `weak` | `unowned` |
|---|---|---|---|
| Keeps the object alive | yes | no | no |
| Type | any | optional `var` | non-optional |
| After the object dies | — | becomes `nil` | accessing it traps |
| Use when | you own it | it may die first (delegates, parents) | it always outlives you |

## Under the hood: how Swift tracks references

Every Swift object starts with a small header: a pointer to its type's metadata and an inline **reference count** field. That field actually tracks more than one count:

- the **strong** count, which decides when `deinit` runs,
- the **unowned** count, which decides when the memory itself can be freed.

That's why an `unowned` access can be checked safely: when the strong count hits zero, the object is **deinitialized** (`deinit` runs, its properties are released), but if unowned references still exist, the memory stays allocated in a "dead" state until they're gone. An unowned access sees that the object is dead and traps instead of reading reused memory.

Weak references work differently. The first time an object is referenced weakly, Swift allocates a small **side table** for it, and weak references point to that side table instead of the object. When the object is destroyed, the side table records it, so every weak reference reads as `nil`, without Swift having to find and zero each one. It also means the object's memory can be freed immediately, even while weak references still exist; only the small side table lingers.

Two practical consequences:

- **Weak references cost a bit more** than strong ones: an extra allocation per object the first time it's weakly referenced, and an indirection on each access.
- **Retain counts are atomic** operations, because objects can be shared between threads. They're cheap, but in very hot code, avoiding unnecessary references (for example, passing a struct instead of a class) can make a measurable difference.

## Where cycles hide in real apps

### 1. Parent and child references

A parent owns its children; children that refer back to their parent should do so weakly:

```swift
final class Folder {
    var files: [File] = []
}

final class File {
    weak var folder: Folder?    // back-reference is weak
}
```

### 2. Delegates

Always `weak var delegate`, with an `AnyObject`-constrained protocol.

### 3. Closures that capture `self`

Closures are reference types, and they strongly capture the objects they use. If an object stores a closure that captures the object, that's a cycle:

```swift
final class HTMLElement {
    let name: String
    let text: String?

    lazy var asHTML: () -> String = { [unowned self] in
        if let text = self.text {
            return "<\(self.name)>\(text)</\(self.name)>"
        }
        return "<\(self.name) />"
    }

    init(name: String, text: String? = nil) {
        self.name = name
        self.text = text
    }

    deinit { print("\(name) freed") }
}

var paragraph: HTMLElement? = HTMLElement(name: "p", text: "Hello")
print(paragraph!.asHTML())   // <p>Hello</p>
paragraph = nil              // "p freed", thanks to [unowned self]
```

Without `[unowned self]`, the element would own the closure and the closure would own the element. Use `[weak self]` instead when the closure might outlive the object, like a network completion handler.

### 4. Timers

A repeating `Timer` is retained by the run loop, and it strongly retains its **target** (or its block). A view controller that creates a timer targeting itself won't be freed until the timer is invalidated, and if you invalidate it in `deinit`, `deinit` never runs. Invalidate timers when the screen disappears, and use the block-based API with `[weak self]`:

```swift
final class Clock {
    private var timer: Timer?

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {}
}
```

### 5. Notification observers

`NotificationCenter.addObserver(forName:object:queue:using:)` keeps the block alive until you remove the observer. A block that captures `self` strongly keeps `self` alive too. Capture weakly, and keep the returned token so you can remove the observer.

## Finding leaks

- **`deinit` logging.** Add a `print` to `deinit` of screens and view models during development. If it doesn't print when you leave a screen, something is holding it.
- **The Memory Graph Debugger.** In Xcode, click the three-circle button in the debug bar while the app runs. It shows every live object and the references keeping it alive, and flags some leaks with a purple warning.
- **Instruments.** The Leaks and Allocations templates show memory that's never freed during a real session; repeat a navigation flow several times and watch whether memory keeps growing.

`CFGetRetainCount` and similar tricks are misleading in Swift: the optimizer adds and removes retains freely, so the number rarely means what you think.

## ARC vs. garbage collection

| ARC | Tracing garbage collection |
|---|---|
| Frees memory as soon as the count reaches zero | Frees memory when the collector runs |
| Predictable timing, no collection pauses | Possible pauses, less predictable timing |
| Small cost on every retain and release | Cost concentrated in collection cycles |
| Can't detect reference cycles | Collects cycles automatically |
| `deinit` is reliable for releasing resources | Finalizers run late, or not at all |

## Interview questions

**What's the difference between `weak` and `unowned`?**
Both avoid keeping an object alive. `weak` is optional and becomes `nil` when the object dies; `unowned` is non-optional, assumes the object outlives the reference, and traps if accessed after it's gone.

**Why do delegate properties need to be `weak`, and why does the protocol need `AnyObject`?**
The delegate often owns the delegating object, so a strong reference would create a cycle. Only class instances can be weakly referenced, so the protocol must be restricted to classes.

**Does ARC work with structs?**
Structs aren't reference counted, but any class references stored inside them are.

**Can an object be freed while weak references to it still exist?**
Yes. Weak references point to a side table, which outlives the object and reports `nil`.

## Summary

- ARC counts strong references to class instances (and closures) and frees an instance as soon as its count reaches zero.
- Objects live until their last use, not necessarily until the end of the scope; `withExtendedLifetime` makes it explicit.
- Strong reference cycles leak; ARC can't detect them.
- `weak` (optional, zeroed through a side table) and `unowned` (non-optional, checked) break cycles.
- Watch for cycles in parent/child links, delegates, stored closures, timers, and notification observers, and verify fixes with `deinit` logs and the Memory Graph Debugger.
