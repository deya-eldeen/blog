---
layout: post
hidden: true
title: "RxCocoa: Binding Observables to UIKit"
date: "2026-05-22"
last_modified_at: "2026-05-22"
permalink: /rxswift-rxcocoa-uikit/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, RxSwift, RxCocoa, UIKit, Reactive Programming]
thumbnail: assets/img/article-placeholder.svg
---
RxSwift on its own knows nothing about buttons, text fields, or table views. **RxCocoa** is the library that connects the two: it adds an `rx` namespace to UIKit and AppKit types, through which a text field's text becomes an observable, a button's taps become a stream of events, a label's text becomes something an observable can be bound to, and a table view can be driven by an array. It is the main reason RxSwift is still common in UIKit apps: Apple never gave UIKit controls Combine publishers, so RxCocoa remains the most complete reactive layer over UIKit.

This article covers RxCocoa's three building blocks, `ControlProperty`, `ControlEvent`, and `Binder`, and the delegate proxies behind table and scroll view bindings. Every example ran in the iOS simulator against real UIKit controls, and the measurements answer the questions that decide whether a binding works: what a text field emits when the text is set in code, whether a two-way binding loops, what happens to a tap stream when its button is deallocated, which thread a binder writes on, and what RxCocoa does when a table view already has a data source.

<!--more-->

The examples use RxSwift 6.10.2 in Swift 6 language mode, compiled with the Swift 6.4 toolchain from Xcode 27.1. They ran in a unit-test bundle hosted by an app, on an iPhone 17 simulator with iOS 27; a host app matters, because without one `UIControl.sendActions(for:)` has no `UIApplication` to send through, and taps are silently lost. The blocks run in order, on the main thread, inside one test.

<!-- ios -->
```swift
@preconcurrency import RxSwift
import RxCocoa
import RxRelay
import UIKit
```

<!-- ios -->
```swift
/// Sets a text field's text and sends the event a keystroke would send.
@MainActor func enter(_ text: String, into field: UITextField) {
    field.text = text
    field.sendActions(for: .editingChanged)
}

let bag = DisposeBag()
```

## The `rx` namespace

Every RxCocoa extension lives behind `.rx`. It is a small wrapper, `Reactive<Base>`, that any type conforming to `ReactiveCompatible` gets for free, and all `NSObject` subclasses conform. `button.rx.tap` is a property RxCocoa declares on `Reactive<UIButton>`; `label.rx.text` is a `Binder` that `Reactive` synthesizes from the label's writable `text` property, through `@dynamicMemberLookup`, since RxSwift 6. The namespace keeps RxCocoa's names from colliding with UIKit's, and it is the same mechanism you use to add your own, as [Writing Custom Reactive Extensions](/rxswift-custom-reactive-extensions/) shows.

What comes out of `.rx` is one of three kinds of thing:

| Type | Direction | Initial element | Examples |
| --- | --- | --- | --- |
| `ControlProperty<T>` | read and write | yes, the current value | `textField.rx.text`, `switch.rx.isOn`, `slider.rx.value` |
| `ControlEvent<T>` | read only | no | `button.rx.tap`, `textField.rx.controlEvent(.editingDidEnd)` |
| `Binder<T>` | write only | not applicable | `label.rx.text`, `view.rx.isHidden`, `button.rx.isEnabled` |

All three are main-thread types. `ControlProperty` and `ControlEvent` deliver on the main thread and never error, like a `Driver`; `Binder` always writes on the main thread.

## `ControlProperty`: the current value, then user changes

`textField.rx.text` is a `ControlProperty<String?>`. Subscribing emits the field's current text immediately, and after that it emits whenever the field sends one of its editing events, which is what typing does:

<!-- ios -->
```swift
let field = UITextField()
var seenTexts: [String?] = []
field.rx.text.subscribe(onNext: { seenTexts.append($0) }).disposed(by: bag)

enter("typed", into: field)
field.text = "set in code"                                  // no event is sent
assert(seenTexts == ["", "typed"])
```

Setting `text` in code emitted nothing. RxCocoa observes the control's *events*, and UIKit does not send editing events for programmatic changes, so the observable reflects what the user did, not what the field contains. Code that sets a field's text and expects the change to flow through its bindings has to send the event itself, or, better, change the source of truth that the field is bound to.

`rx.text.orEmpty` converts the optional to a `String`, mapping `nil` to `""`, which is almost always what a binding wants. Other controls work the same way: `UISwitch.rx.isOn`, `UISlider.rx.value`, `UISegmentedControl.rx.selectedSegmentIndex`, and `UIDatePicker.rx.date` all emit their current value and then user changes.

### Two-way binding

A `ControlProperty` is also an observer: binding a value *to* it sets the control's value. That makes two-way binding with a relay possible, by binding in both directions:

<!-- ios -->
```swift
let name = BehaviorRelay(value: "Ada")
let nameField = UITextField()
var nameHistory: [String] = []
name.subscribe(onNext: { nameHistory.append($0) }).disposed(by: bag)

name.bind(to: nameField.rx.text).disposed(by: bag)          // model to view
nameField.rx.text.orEmpty.bind(to: name).disposed(by: bag)  // view to model

enter("Grace", into: nameField)                             // the user types
name.accept("Hopper")                                       // the model changes
assert(nameField.text == "Hopper")
assert(nameHistory == ["Ada", "Ada", "Grace", "Hopper"])
```

There is no infinite loop: when the relay sets the field's text, the field sends no event, as measured above, so nothing flows back. But the relay received `"Ada"` twice. The second binding's subscription emitted the field's current text, which the first binding had just set to `"Ada"`, and fed it straight back into the relay. A subscriber of the relay that saves to disk or starts a request runs one extra time per screen. The obvious fix, `distinctUntilChanged()` on the view-to-model direction, does not remove it:

<!-- ios -->
```swift
let country = BehaviorRelay(value: "France")
let countryField = UITextField()
var countryHistory: [String] = []
country.subscribe(onNext: { countryHistory.append($0) }).disposed(by: bag)

country.bind(to: countryField.rx.text).disposed(by: bag)
countryField.rx.text.orEmpty.distinctUntilChanged().bind(to: country).disposed(by: bag)
assert(countryHistory == ["France", "France"])              // still echoed
```

`distinctUntilChanged()` compares each element with the field's *previous* element, and the echo is the field's first element, so there is nothing to compare it with. Comparing with the model's current value removes it:

<!-- ios -->
```swift
let city = BehaviorRelay(value: "Paris")
let cityField = UITextField()
var cityHistory: [String] = []
city.subscribe(onNext: { cityHistory.append($0) }).disposed(by: bag)

city.bind(to: cityField.rx.text).disposed(by: bag)
cityField.rx.text.orEmpty
    .filter { [city] in $0 != city.value }                  // ignore the echo of the model's own value
    .bind(to: city).disposed(by: bag)

enter("Rome", into: cityField)
assert(cityHistory == ["Paris", "Rome"])
```

## `ControlEvent`: events, and the end of the control

`button.rx.tap` is a `ControlEvent<Void>`. It has no initial element, emits on each `touchUpInside`, and has a property that is easy to miss: it *completes* when the control is deallocated.

<!-- ios -->
```swift
var button: UIButton? = UIButton()
var tapLog: [String] = []
button!.rx.tap.subscribe(
    onNext: { tapLog.append("tap") },
    onCompleted: { tapLog.append("completed") }
).disposed(by: bag)

button!.sendActions(for: .touchUpInside)
button = nil                                                // the button is deallocated
assert(tapLog == ["tap", "completed"])
```

Because it completes, a chain started from a control's event ends by itself when the control goes away, and its subscription is released even if the bag that holds it lives on. That does not make bags unnecessary: a chain that merges the tap with a long-lived source, or that captures the view controller strongly, still needs the view controller's bag to end it.

`rx.controlEvent(_:)` gives the same kind of stream for any `UIControl.Event`, such as `.editingDidEnd` for "the user left the field" or `.valueChanged` for a custom control.

## `Binder`: writing to views, on the main thread

`label.rx.text`, `view.rx.isHidden`, and `button.rx.isEnabled` are `Binder`s. A `Binder` is an observer that applies each element to an object, with two guarantees: it holds the object weakly, so a binding never keeps a view alive, and it always applies the element on the main thread, scheduling it there if it arrives elsewhere.

To see the second guarantee, here is a binder that also records which thread it ran on, bound to a source that delivers on a background queue. The source is built in a `nonisolated` function because, as [Schedulers](/rxswift-schedulers/#swift-6-main-actor-closures-on-background-threads) explained, closures written in main-actor code must not run in the background:

<!-- ios -->
```swift
nonisolated func titleFromBackground() -> Observable<String> {
    Observable.just("Loaded").observe(on: ConcurrentDispatchQueueScheduler(qos: .userInitiated))
}

let titleLabel = UILabel()
var binderRanOnMainThread = false
let recordingBinder = Binder<String>(titleLabel) { label, text in
    binderRanOnMainThread = Thread.isMainThread
    label.text = text
}

titleFromBackground().bind(to: recordingBinder).disposed(by: bag)
assert(titleLabel.text == nil)                              // not yet: the element was rescheduled
RunLoop.main.run(until: Date().addingTimeInterval(0.2))
assert(titleLabel.text == "Loaded" && binderRanOnMainThread)
```

The label was untouched when `bind` returned, and set on the main thread once the main queue ran. The binder's closure is written in main-actor code and touches a `UILabel`, which is `@MainActor`; both are safe because `Binder` only ever calls it on the main thread. That makes `Binder` the right way to expose any view property to RxSwift, and it is how the custom binders in [Writing Custom Reactive Extensions](/rxswift-custom-reactive-extensions/) are built.

A `Binder` treats an error as a programmer error: a debug build stops with `fatalError("Binding error: ...")`, the same rule as `bind(onNext:)` in [Subscribing](/rxswift-subscribing/#bind-subscribing-when-failure-is-a-bug). Chains bound to views should be `Driver`s, which cannot fail.

## Table views

`tableView.rx.items(cellIdentifier:cellType:)` binds an observable of arrays to a table view. RxCocoa installs a data source that answers the table's questions from the latest array and configures each cell with a closure:

<!-- ios -->
```swift
let table = UITableView()
table.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
let fruits = BehaviorRelay(value: ["apple", "banana", "cherry"])

fruits.bind(to: table.rx.items(cellIdentifier: "Cell", cellType: UITableViewCell.self)) { row, fruit, cell in
    var content = cell.defaultContentConfiguration()
    content.text = "\(row + 1). \(fruit)"
    cell.contentConfiguration = content
}.disposed(by: bag)

assert(table.numberOfRows(inSection: 0) == 3)
fruits.accept(["date"])
assert(table.numberOfRows(inSection: 0) == 1)               // a new array reloads the table
```

Each new array calls `reloadData()`, which is simple and correct but has no animations and resets the scroll position's anchoring. For animated inserts and deletes, the RxDataSources library provides data sources that diff consecutive arrays.

Selections come back as events. `rx.itemSelected` gives index paths, and `rx.modelSelected(_:)` looks up the element in the bound array:

<!-- ios -->
```swift
var picked: [String] = []
table.rx.modelSelected(String.self).subscribe(onNext: { picked.append($0) }).disposed(by: bag)
table.delegate?.tableView?(table, didSelectRowAt: IndexPath(row: 0, section: 0))  // what a tap calls
assert(picked == ["date"])
```

### Delegate proxies, and an existing data source

To turn delegate callbacks into observables without taking the delegate away from you, RxCocoa installs a **delegate proxy**: an object that becomes the table's `dataSource` or `delegate`, turns the callbacks it understands into events, and forwards everything to the delegate you set, if any. The same mechanism powers `scrollView.rx.contentOffset`, which emits the current offset and then every change:

<!-- ios -->
```swift
let scroller = UIScrollView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
scroller.contentSize = CGSize(width: 320, height: 4_000)
var offsets: [CGFloat] = []
scroller.rx.contentOffset.map(\.y).subscribe(onNext: { offsets.append($0) }).disposed(by: bag)

scroller.setContentOffset(CGPoint(x: 0, y: 50), animated: false)
scroller.contentOffset = CGPoint(x: 0, y: 80)
assert(offsets == [0, 50, 80])
```

The proxy has one rule that surfaces as a crash in development. Binding items to a table view whose `dataSource` was already set, by a storyboard, a `dataSource = self` in `viewDidLoad`, or a library, would silently replace that data source. RxCocoa refuses in debug builds:

<!-- skip-check -->
```swift
// Crashes in a debug build: the table already has a data source
let existingDataSource = UITableViewController()
let preconfigured = UITableView()
preconfigured.dataSource = existingDataSource
let replacing = Observable.just(["a"]).bind(to: preconfigured.rx.items(cellIdentifier: "Cell")) { _, _, _ in }
```

In the simulator that stopped the test with `Assertion failed: This is a feature to warn you that there is already a delegate (or data source) set somewhere previously. The action you are trying to perform will clear that delegate (data source) and that means that some of your features that depend on that delegate (data source) being set will likely stop working.` The message continues with the fix: set the data source to `nil` before binding, and check the storyboard. The check is an `assert`, so a release build replaces the data source without warning.

Delegates are handled more gently than data sources: when RxCocoa installs a delegate proxy for observables such as `modelSelected` and `contentOffset`, a delegate you set *before* that becomes the proxy's *forward* delegate and keeps receiving its callbacks. [Writing Custom Reactive Extensions](/rxswift-custom-reactive-extensions/) builds a proxy and measures the forwarding.

## Notifications and the keyboard

RxCocoa also extends Foundation. `NotificationCenter.default.rx.notification(_:)` turns a notification into an observable and removes its observer when disposed, which makes the classic keyboard-avoidance code a short chain:

<!-- ios -->
```swift
let keyboardHeight = Observable.merge(
    NotificationCenter.default.rx.notification(UIResponder.keyboardWillShowNotification)
        .map { ($0.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect)?.height ?? 0 },
    NotificationCenter.default.rx.notification(UIResponder.keyboardWillHideNotification)
        .map { _ in CGFloat(0) }
)

var insets: [CGFloat] = []
keyboardHeight.subscribe(onNext: { insets.append($0) }).disposed(by: bag)

NotificationCenter.default.post(name: UIResponder.keyboardWillShowNotification, object: nil,
    userInfo: [UIResponder.keyboardFrameEndUserInfoKey: CGRect(x: 0, y: 500, width: 320, height: 336)])
NotificationCenter.default.post(name: UIResponder.keyboardWillHideNotification, object: nil)
assert(insets == [336, 0])
```

Notifications are delivered on the thread that posts them, unlike control events. A notification posted from a background thread reaches the chain on that thread, so a chain that updates views needs `observe(on: MainScheduler.instance)` or a `Driver` at its end, for the reasons in [Schedulers](/rxswift-schedulers/).

## Putting it together

A typical screen binds input controls into a view model and the view model's outputs back to views, as [MVVM with RxSwift](/rxswift-mvvm/) builds out. Here is the smallest version, a character counter for a message field that also disables a "Send" button when the message is empty or too long:

<!-- ios -->
```swift
let message = UITextField()
let counter = UILabel()
let send = UIButton(type: .system)

let length = message.rx.text.orEmpty.map(\.count).asDriver(onErrorJustReturn: 0)
length.map { "\($0)/140" }.drive(counter.rx.text).disposed(by: bag)
length.map { (1...140).contains($0) }.drive(send.rx.isEnabled).disposed(by: bag)

assert(counter.text == "0/140" && !send.isEnabled)
enter("Hello", into: message)
assert(counter.text == "5/140" && send.isEnabled)
enter(String(repeating: "x", count: 141), into: message)
assert(counter.text == "141/140" && !send.isEnabled)
```

The initial values are correct before any typing, because `rx.text` emits the field's current text on subscription and `Driver` delivers synchronously on the main thread.

## RxCocoa and Combine

UIKit has no Combine publishers for its controls. `NotificationCenter.Publisher` and KVO publishers exist, and since iOS 14 controls accept closures through `UIAction`, but there is no `button.publisher(for: .touchUpInside)` and no binding of a publisher to a table view. Projects that use Combine with UIKit write or import that layer themselves. That gap is why RxCocoa is often the last part of RxSwift to leave a UIKit codebase, and a reason to keep it at the edges, in views and view controllers, even when the rest of the app moves to Combine or `async`/`await`. [Notifications as Publishers](/combine-notification-publishers/) and [Key-Value Observing (KVO) with Publishers](/combine-kvo-publishers/) cover what Combine does provide.

<!-- ios -->
```swift
withExtendedLifetime(bag) {}
```

## Summary

- `.rx` exposes `ControlProperty` (current value, then user changes), `ControlEvent` (events only), and `Binder` (write-only) for UIKit types. All three are main-thread types.
- Setting a control's value in code sends no event, so `rx.text` did not emit it.
- A two-way binding with a relay did not loop, but echoed the initial value back into the relay; `distinctUntilChanged()` did not remove the echo, and filtering out the model's own value did.
- `ControlEvent` completes when its control is deallocated.
- `Binder` holds its object weakly and applies elements on the main thread: an element from a background queue was applied after the main queue ran.
- `rx.items` reloads the table for each array; binding to a table that already has a data source stops debug builds with an assertion and silently replaces it in release.
- Notification-based observables deliver on the posting thread; add `observe(on: MainScheduler.instance)` before touching views.
- Running these examples needs a host app: without one, `sendActions(for:)` delivers nothing.

## Exercise

Build a sign-up form with an email field, a password field, a "show password" `UISwitch` bound to the password field's `isSecureTextEntry`, and a strength meter `UIProgressView` bound to a password-strength score. Write the bindings so that toggling the switch in code (with `setOn(_:animated:)` followed by `sendActions(for: .valueChanged)`) and toggling it as a user both update the field, then test both paths in a hosted unit test. Measure whether `UISwitch.rx.isOn` emits when you call `setOn` *without* sending the event, and explain the result using this article's text field measurement.

## Further reading

- The [RxCocoa source](https://github.com/ReactiveX/RxSwift/tree/main/RxCocoa), particularly `iOS/UITextField+Rx.swift`, `iOS/UITableView+Rx.swift`, and `Common/DelegateProxyType.swift`.
- [Traits: RxCocoa traits](https://github.com/ReactiveX/RxSwift/blob/main/Documentation/Traits.md#rxcocoa-traits) in the RxSwift documentation, on `ControlProperty` and `ControlEvent`.
- [RxDataSources](https://github.com/RxSwiftCommunity/RxDataSources), for animated table and collection view bindings.

Previous: [Schedulers: `observe(on:)` and `subscribe(on:)`](/rxswift-schedulers/). Next: [MVVM with RxSwift](/rxswift-mvvm/).

Return to the [RxSwift roadmap](/rxswift/).
