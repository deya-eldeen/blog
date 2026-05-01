---
layout: post
title: "Avoiding Memory Leaks in Swift: Practical Capture List Patterns"
date: "2026-03-15"
last_modified_at: "2026-03-15"
permalink: /avoiding-memory-leaks-swift-capture-lists/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/memory_management_full.webp"
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "iOS"
  - "ARC"
  - "Memory Management"
  - "Closures"
published: true
---

Swift gives us ARC, but ARC is not a leak-proof shield. Memory leaks still happen when strong references create cycles, and closures are one of the most common places where that cycle begins. The good news is that capture lists give us precise control over how values are retained.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/memory_management_full.webp"
 alt_text="Avoiding memory leaks in Swift with capture lists"
 caption="Avoiding memory leaks in Swift with capture lists"
 width="960"
 height="1568"
%}

## Why leaks still happen with ARC

ARC deallocates objects when their strong reference count reaches zero. A leak happens when a group of objects keeps each other alive forever.

A classic cycle looks like this:

```swift
final class ProfileViewController: UIViewController {
    private let service = UserService()

    override func viewDidLoad() {
        super.viewDidLoad()

        service.onUserLoaded = {
            self.render()
        }
    }

    private func render() {}
}

final class UserService {
    var onUserLoaded: (() -> Void)?
}
```

`ProfileViewController` strongly owns `service`, and `service` strongly owns `onUserLoaded`, and that closure strongly captures `self`. That closes the loop.

## Capture lists in one sentence

A capture list is the bracket syntax before closure parameters that lets you control how captured values are retained.

```swift
service.onUserLoaded = { [weak self] in
    self?.render()
}
```

Now the closure does not increase `self`'s retain count.

## `weak` vs `unowned` in practice

### Use `weak` when the captured instance may disappear

`weak` references are optional and become `nil` automatically when the object deallocates.

```swift
service.onUserLoaded = { [weak self] in
    guard let self else { return }
    self.render()
}
```

This is the safe default for UI code and most escaping closures.

### Use `unowned` only when lifetime is guaranteed

```swift
final class Coordinator {
    private let child: Child

    init() {
        child = Child()
        child.onFinish = { [unowned self] in
            self.handleFinish()
        }
    }

    private func handleFinish() {}
}
```

`unowned` is non-optional and does not require unwrapping, but it will crash if accessed after deallocation. Use it only when the closure can never outlive the captured object.

## Common leak sources and fixes

### 1) Completion handlers stored by long-lived objects

Leak-prone:

```swift
apiClient.requestUser { result in
    self.handle(result)
}
```

Safer:

```swift
apiClient.requestUser { [weak self] result in
    guard let self else { return }
    self.handle(result)
}
```

### 2) Timers

`Timer` strongly retains its closure. If the closure strongly captures `self`, your object may never deallocate.

```swift
timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.tick()
}
```

Also invalidate timers when leaving scope.

```swift
deinit {
    timer?.invalidate()
}
```

### 3) Combine subscriptions

If `self` owns `cancellables`, and a `sink` closure strongly captures `self`, you can create a cycle.

```swift
publisher
    .sink { [weak self] value in
        self?.apply(value)
    }
    .store(in: &cancellables)
```

### 4) Task closures and async work

Tasks can outlive the view controller that started them.

```swift
task = Task { [weak self] in
    guard let self else { return }
    let data = try await repository.load()
    self.render(data)
}
```

And cancel long-running tasks:

```swift
deinit {
    task?.cancel()
}
```

## Capture values, not `self`, when possible

One of the best patterns is to capture only what is needed.

Instead of this:

```swift
service.onEvent = { [weak self] event in
    self?.logger.log(event)
}
```

Prefer this when possible:

```swift
let logger = logger
service.onEvent = { event in
    logger.log(event)
}
```

This avoids optional handling and reduces accidental `self` retention.

## Don’t use `[weak self]` everywhere by default

Not every closure needs weak capture. If a closure is non-escaping and used immediately, strong capture is typically fine.

```swift
items.forEach { item in
    self.process(item)
}
```

This closure is not stored and does not create a long-lived cycle.

A practical rule:

- If closure is escaping and stored or long-lived, evaluate weak/unowned.
- If closure is short-lived and non-escaping, strong capture is usually okay.
- If closure uses one dependency, capture that dependency directly.

## Useful capture list patterns

### Capture specific dependencies

```swift
service.onRetry = { [networkClient, cache] in
    networkClient.refresh()
    cache.clearExpired()
}
```

### Capture mutable value snapshots intentionally

```swift
var retryCount = 0
service.onRetry = { [retryCount] in
    print("Retry count at registration time: \(retryCount)")
}
```

### Rename captures for clarity

```swift
service.onAction = { [weak viewModel = self.viewModel] in
    viewModel?.reload()
}
```

## How to verify leaks in a real app

1. Open Xcode Memory Graph and look for retained view controllers after dismissal.
2. Use Instruments Leaks and Allocations on navigation loops.
3. Add `deinit` logs to critical types during development.
4. Re-check every escaping closure when you introduce a new stored callback.

## A quick review checklist

- Is this closure escaping?
- Who stores this closure?
- Does it capture `self` strongly?
- Should this be `[weak self]`, `[unowned self]`, or specific dependency capture?
- Is there a cancellation or invalidation path (`Task`, `Timer`, subscription)?

## Conclusion

Avoiding leaks in Swift is less about adding `[weak self]` everywhere and more about lifetime design. Capture lists let you encode lifetime intent directly in code. Use `weak` as the safe default for long-lived closures, reserve `unowned` for guaranteed lifetimes, and prefer capturing specific dependencies when possible. That combination keeps your code both safe and readable.
