---
layout: post
hidden: true
title: "Notifications as Publishers"
date: "2026-07-31"
last_modified_at: "2026-07-31"
permalink: /combine-notification-publishers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Combine, NotificationCenter, Concurrency]
thumbnail: assets/img/article-placeholder.svg
---
`NotificationCenter` is the oldest broadcast mechanism on Apple platforms, and the system still uses it for a long list of events: the app moving to the background, the keyboard appearing, the locale or time zone changing, a Core Data context saving, the user enabling Bold Text. Combine adds `publisher(for:object:)`, which turns a notification name into a publisher of `Notification` values, so these events can be debounced, merged, and mapped like anything else.

The publisher is simple, and its behavior is inherited from the notification center. Delivery is synchronous, inside the call to `post`, on the posting thread. The value is a `Notification`, which Swift 6 explicitly refuses to treat as `Sendable`, carrying an untyped `userInfo` dictionary. And the stream never completes. Those properties combine into one of the more surprising Swift 6 crashes: a main-actor subscriber in one part of the app takes the process down when an unrelated part posts the same notification from a background thread. This article measures that, shows the typed message API added in iOS 26 and macOS 26 and how it interoperates with classic notifications, and covers coalescing and testing.

<!--more-->

The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1 on macOS 26. Paste the blocks in order into one `main.swift`; the one iOS-only block is marked and was type-checked against the iOS 26 SDK separately.

## The publisher and synchronous delivery

`publisher(for:object:)` returns a `NotificationCenter.Publisher`. With `object: nil` it receives the named notification from any sender; with an object, only from that sender. Delivery happens inside `post`, before it returns:

```swift
import Combine
import Foundation

extension Notification.Name {
    static let cartDidChange = Notification.Name("CartDidChange")
}

final class Cart: NSObject {}
let mainCart = Cart()
let giftCart = Cart()

var deliveryLog: [String] = []
let anyCartHandle = NotificationCenter.default.publisher(for: .cartDidChange)
    .sink { notification in
        deliveryLog.append(notification.object as? Cart === mainCart ? "any: main" : "any: gift")
    }
let mainCartHandle = NotificationCenter.default.publisher(for: .cartDidChange, object: mainCart)
    .sink { _ in deliveryLog.append("main only") }

deliveryLog.append("before post")
NotificationCenter.default.post(name: .cartDidChange, object: mainCart)
deliveryLog.append("after post")
NotificationCenter.default.post(name: .cartDidChange, object: giftCart)

assert(deliveryLog == ["before post", "any: main", "main only", "after post", "any: gift"])
```

Synchronous delivery means the poster waits for every observer. A slow subscriber, such as one that writes to disk, slows down whoever posted, which might be the code handling a keystroke. Move expensive work behind a `receive(on:)` to a background queue, which also returns control to the poster immediately.

The publisher never completes: the center has no notion of "no more notifications of this name". Operators that wait for completion, such as `last()`, `collect()`, and `reduce`, never emit on it, as [Sequence Operators](/combine-first-last-collect/) measured for subjects.

## Turning `userInfo` into a type

A `Notification`'s payload is `userInfo: [AnyHashable: Any]?`, which every subscriber has to unpack and cast. Doing that once, with `compactMap` into a struct, turns a notification into a typed stream and drops malformed posts in one place:

```swift
struct CartChange: Equatable, Sendable {
    let itemCount: Int
    let total: Decimal
}

extension NotificationCenter {
    func cartChanges(of cart: Cart? = nil) -> AnyPublisher<CartChange, Never> {
        publisher(for: .cartDidChange, object: cart)
            .compactMap { notification in
                guard let count = notification.userInfo?["itemCount"] as? Int,
                      let total = notification.userInfo?["total"] as? Decimal else { return nil }
                return CartChange(itemCount: count, total: total)
            }
            .eraseToAnyPublisher()
    }
}

var changes: [CartChange] = []
let changesHandle = NotificationCenter.default.cartChanges(of: mainCart).sink { changes.append($0) }
NotificationCenter.default.post(name: .cartDidChange, object: mainCart,
                                userInfo: ["itemCount": 2, "total": Decimal(19.98)])
NotificationCenter.default.post(name: .cartDidChange, object: mainCart,
                                userInfo: ["itemCount": "two"])         // malformed: dropped
assert(changes == [CartChange(itemCount: 2, total: Decimal(19.98))])
```

The struct is `Sendable` and the `Notification` is not, which matters as soon as a thread is involved.

## The posting thread, and the Swift 6 crash

Observers run on the thread that posted. A notification posted from a background queue arrives on that queue:

```swift
import Synchronization

final class Flag: Sendable {
    private let value = Mutex<Bool?>(nil)
    func set(_ newValue: Bool) { value.withLock { $0 = newValue } }
    var current: Bool? { value.withLock { $0 } }
}

extension Notification.Name {
    static let backgroundSyncFinished = Notification.Name("BackgroundSyncFinished")
}

let deliveredOnMain = Flag()
let threadHandle = NotificationCenter.default.publisher(for: .backgroundSyncFinished)
    .sink { @Sendable _ in deliveredOnMain.set(Thread.isMainThread) }
DispatchQueue.global().async {
    NotificationCenter.default.post(name: .backgroundSyncFinished, object: nil)
}
while deliveredOnMain.current == nil { usleep(1_000) }
assert(deliveredOnMain.current == false)
threadHandle.cancel()
```

That handle carries `@Sendable` deliberately. The handles in the first section do not, and they are closures written in top-level code, which Swift 6 treats as main-actor code. When this article's test program first posted `.cartDidChange` from a background queue while those subscriptions were still alive, the process stopped with `EXC_BREAKPOINT` in the main-actor isolation check of one of *those* closures, not in the code that posted. That is the shape of the bug in a real app: a view model observes a notification with a `sink` written in a `@MainActor` class, and months later a background sync posts the same notification, and the crash report points at the view model.

The compiler cannot help, because `NotificationCenter` and Combine are not concurrency-checked APIs. Neither can a `receive(on:)` in the poster's code. The fix belongs to every observer: hop to the main queue before any main-actor closure, and convert the `Notification` to a `Sendable` value before it crosses threads, because Swift 6 explicitly rejects sending a `Notification` itself:

```swift
// Does not compile
func requireSendable<T: Sendable>(_ value: T) {}
requireSendable(Notification(name: .cartDidChange))
// error: conformance of 'Notification' to 'Sendable' is unavailable in macOS
```

A safe observer in a view model looks like this. The extension method that builds the typed publisher is not main-actor isolated, so its `compactMap` closure can run on the posting thread, and the `CartChange` it produces is `Sendable`:

```swift
@MainActor
final class CartBadgeModel: ObservableObject {
    @Published private(set) var badge = 0
    private var cancellables = Set<AnyCancellable>()

    init(center: NotificationCenter = .default) {
        center.cartChanges()
            .map(\.itemCount)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.badge = $0 }
            .store(in: &cancellables)
    }
}

anyCartHandle.cancel()                          // retire the main-actor closures from the first section
mainCartHandle.cancel()
changesHandle.cancel()

let badgeModel = CartBadgeModel()
DispatchQueue.global().async {
    NotificationCenter.default.post(name: .cartDidChange, object: nil,
                                    userInfo: ["itemCount": 4, "total": Decimal(40)])
}
let badgeDeadline = Date(timeIntervalSinceNow: 2)
while badgeModel.badge != 4 && Date() < badgeDeadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.01))
}
assert(badgeModel.badge == 4)                   // posted in the background, applied on the main actor
```

`.map(\.itemCount)` is a key path, so it carries no isolation, and the only main-actor closure is the `sink`, after the hop.

## Typed messages in iOS 26 and macOS 26

The SDKs for iOS 26 and macOS 26 add a typed layer to `NotificationCenter`. A message is a struct conforming to `NotificationCenter.MainActorMessage`, delivered on the main actor, or `NotificationCenter.AsyncMessage`, which is `Sendable` and delivered asynchronously. Observers register with `addObserver(of:for:using:)` and receive the struct instead of a `Notification`. The iOS 26 SDK's UIKit interface declares 73 of them, among them keyboard, scene, and application lifecycle messages. This iOS code type-checks against the iOS 26 SDK:

<!-- skip-check -->
```swift
import UIKit

@MainActor
final class KeyboardInsetModel {
    private(set) var bottomInset: CGFloat = 0
    private var tokens: [NotificationCenter.ObservationToken] = []

    func start(center: NotificationCenter = .default) {
        tokens.append(center.addObserver(of: UIScreen.self, for: .keyboardWillShow) { [weak self] message in
            self?.bottomInset = message.endFrame.height     // a CGRect, not a userInfo lookup
        })
        tokens.append(center.addObserver(of: UIScreen.self, for: .keyboardWillHide) { [weak self] _ in
            self?.bottomInset = 0
        })
        tokens.append(center.addObserver(of: UIApplication.shared, for: .didEnterBackground) { [weak self] _ in
            self?.bottomInset = 0
        })
    }

    func stop(center: NotificationCenter = .default) {
        tokens.forEach(center.removeObserver)
        tokens.removeAll()
    }
}
```

The observer closures are `@MainActor` in the API's signature, so the isolation problem from the previous section disappears: the compiler knows where they run. Your own notifications can adopt the same API by declaring a message type that converts to and from a `Notification`:

```swift
struct CartDidChangeMessage: NotificationCenter.MainActorMessage {
    typealias Subject = Cart
    static var name: Notification.Name { .cartDidChange }

    let itemCount: Int

    @MainActor static func makeMessage(_ notification: Notification) -> CartDidChangeMessage? {
        guard let count = notification.userInfo?["itemCount"] as? Int else { return nil }
        return CartDidChangeMessage(itemCount: count)
    }

    @MainActor static func makeNotification(_ message: CartDidChangeMessage) -> Notification {
        Notification(name: name, object: nil, userInfo: ["itemCount": message.itemCount])
    }
}
```

The two conversion functions are what make it interoperate with code that has not moved over. A typed observer receives typed posts and also classic posts that `makeMessage` can decode, and a classic observer receives typed posts as ordinary notifications:

```swift
var typedCounts: [Int] = []
let typedToken = NotificationCenter.default.addObserver(of: mainCart, for: CartDidChangeMessage.self) { message in
    typedCounts.append(message.itemCount)
}

var classicCounts: [Int] = []
let classicHandle = NotificationCenter.default.publisher(for: .cartDidChange, object: mainCart)
    .compactMap { $0.userInfo?["itemCount"] as? Int }
    .sink { classicCounts.append($0) }

NotificationCenter.default.post(CartDidChangeMessage(itemCount: 3), subject: mainCart)              // typed post
NotificationCenter.default.post(name: .cartDidChange, object: mainCart, userInfo: ["itemCount": 5]) // classic post
NotificationCenter.default.post(name: .cartDidChange, object: mainCart)                             // undecodable

assert(typedCounts == [3, 5])                   // the undecodable post was skipped
assert(classicCounts == [3, 5])                 // the typed post arrived as a Notification
NotificationCenter.default.removeObserver(typedToken)
```

That makes migration incremental: convert the poster or one observer at a time, and both kinds keep working. The typed API has no Combine publisher of its own. When a typed message should feed a pipeline, a small bridge keeps the typing and the main-actor guarantee, removing the observer when the subscription is cancelled:

```swift
extension NotificationCenter {
    @MainActor
    func messagePublisher<Message: NotificationCenter.MainActorMessage>(
        of subject: Message.Subject, for messageType: Message.Type
    ) -> AnyPublisher<Message, Never> where Message.Subject: AnyObject {
        Deferred {
            let output = PassthroughSubject<Message, Never>()
            var token: NotificationCenter.ObservationToken?
            return output.handleEvents(
                receiveSubscription: { _ in
                    token = self.addObserver(of: subject, for: messageType) { output.send($0) }
                },
                receiveCancel: { if let token { self.removeObserver(token) } }
            )
        }
        .eraseToAnyPublisher()
    }
}

var bridgedCounts: [Int] = []
let bridgedHandle = NotificationCenter.default
    .messagePublisher(of: mainCart, for: CartDidChangeMessage.self)
    .map(\.itemCount)
    .removeDuplicates()
    .sink { bridgedCounts.append($0) }
NotificationCenter.default.post(CartDidChangeMessage(itemCount: 6), subject: mainCart)
NotificationCenter.default.post(CartDidChangeMessage(itemCount: 6), subject: mainCart)
bridgedHandle.cancel()
NotificationCenter.default.post(CartDidChangeMessage(itemCount: 7), subject: mainCart)
assert(bridgedCounts == [6])                    // deduplicated, and nothing after cancellation
classicHandle.cancel()
```

For `AsyncMessage` types, the counterpart is the `messages(of:for:bufferSize:)` asynchronous sequence, which belongs in `async` code rather than in a pipeline; [Bridging Publishers to `async`/`await` with `.values`](/combine-publisher-values-async/) covers moving between the two worlds.

## Coalescing bursts

Some notifications arrive in bursts: a sync that posts "data changed" once per record, or a settings screen that posts on every slider tick. Foundation has had a coalescing mechanism for decades, `NotificationQueue`, which merges notifications enqueued with the same name before posting them on a later run loop turn:

```swift
extension Notification.Name {
    static let recordsDidChange = Notification.Name("RecordsDidChange")
}

var coalescedDeliveries = 0
let coalescedHandle = NotificationCenter.default.publisher(for: .recordsDidChange)
    .sink { _ in coalescedDeliveries += 1 }
for _ in 0..<5 {
    NotificationQueue.default.enqueue(Notification(name: .recordsDidChange),
                                      postingStyle: .asap, coalesceMask: [.onName], forModes: nil)
}
assert(coalescedDeliveries == 0)                // not posted yet
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
assert(coalescedDeliveries == 1)                // five enqueued, one delivered
coalescedHandle.cancel()
```

It requires the poster to opt in, and most posters do not. Combine lets the *observer* decide instead. `debounce` waits for the burst to end, and `collect(.byTime)` delivers the whole burst as one batch, which is useful when the observer needs every notification's payload:

```swift
let recordIDs = PassthroughSubject<Int, Never>()       // stands in for a notification publisher
var batches: [[Int]] = []
let batchHandle = recordIDs
    .collect(.byTime(DispatchQueue.main, .milliseconds(50)))
    .sink { batches.append($0) }
(1...5).forEach(recordIDs.send)
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.15))
assert(batches == [[1, 2, 3, 4, 5]])
batchHandle.cancel()
```

## Testing code that observes notifications

`NotificationCenter.default` is global state: every test that posts to it reaches every observer in the process, including those left over from other tests. Injecting the center, as `CartBadgeModel` does, lets a test use a private `NotificationCenter()` that nothing else can see:

```swift
let privateCenter = NotificationCenter()
let isolatedModel = CartBadgeModel(center: privateCenter)
privateCenter.post(name: .cartDidChange, object: nil, userInfo: ["itemCount": 9, "total": Decimal(1)])
NotificationCenter.default.post(name: .cartDidChange, object: nil, userInfo: ["itemCount": 1, "total": Decimal(1)])
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
assert(isolatedModel.badge == 9)                // only its own center reached it
assert(badgeModel.badge == 1)                   // the default center reached the other model
```

## Notifications or publishers

Notifications are the right tool when the poster cannot know who listens: system events, events crossing module boundaries, or Objective-C code. Inside your own Swift code, a publisher exposed by the type that owns the event, as in [Subjects](/combine-subjects/), is better on every axis this article measured: it is typed, it can be `Sendable`, it can complete, it is easy to replace in a test, and the compiler can see who depends on it.

## Summary

- `publisher(for:object:)` delivers synchronously inside `post`, on the posting thread, and never completes. Filtering by `object` limits it to one sender.
- Convert `userInfo` into a `Sendable` struct with `compactMap` once, in an extension; `Notification` is explicitly not `Sendable` in Swift 6.
- A main-actor `sink` on a notification crashes the process when anyone posts that notification from a background thread. Each observer must hop with `receive(on: DispatchQueue.main)` before its main-actor closures.
- iOS 26 and macOS 26 add typed `MainActorMessage` and `AsyncMessage` notifications. Typed observers decoded classic posts, and classic observers received typed posts, so migration can be incremental; a small `Deferred` bridge brings them into Combine.
- `NotificationQueue` coalesced five posts into one; `debounce` and `collect(.byTime)` let the observer coalesce without the poster's help.
- Inject the `NotificationCenter` so tests can use a private one.

## Exercise

Write a `TimeZoneClock` view model that shows the current time in the user's time zone and updates both every minute, using the `ticks(every:)` publisher from [Timers](/combine-timers/), and immediately when `NSSystemTimeZoneDidChange` is posted. Merge the two sources, read `TimeZone.current` only on the main actor, and make the notification side safe to post from any thread. Test it with a private `NotificationCenter` and a `VirtualTimeScheduler`: a tick produces an update, a time zone change between ticks produces an update without waiting for the next tick, and a notification posted from a background queue does not crash. Then convert the notification to a custom `MainActorMessage` and check that the classic post still reaches it.

## Further reading

- Apple's documentation for [`NotificationCenter.Publisher`](https://developer.apple.com/documentation/foundation/notificationcenter/publisher), [`NotificationCenter.MainActorMessage`](https://developer.apple.com/documentation/foundation/notificationcenter/mainactormessage), and [`NotificationQueue`](https://developer.apple.com/documentation/foundation/notificationqueue).
- The concurrency roadmap's [Sendable](/swift-sendable/) and [The Main Actor](/swift-main-actor/), for why a non-`Sendable` value and a main-actor closure cannot safely cross threads.
- [Combine in Practice](https://developer.apple.com/videos/play/wwdc2019/721/), WWDC19, which builds a notification publisher into a pipeline.

Previous: [Key-Value Observing with Publishers](/combine-kvo-publishers/). Next: [Error Handling: `catch`, `retry`, and `replaceError`](/combine-error-handling-catch-retry/).

Return to the [Combine roadmap](/combine/).
