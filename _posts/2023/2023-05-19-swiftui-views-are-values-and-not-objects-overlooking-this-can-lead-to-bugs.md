---
layout: post
title: "SwiftUI View Values, Identity, and State: Avoiding Common Bugs"
date: "2023-05-19"
last_modified_at: "2026-10-20"
permalink: /swiftui-views-are-values-and-not-objects-overlooking-this-can-lead-to-bugs/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/swiftui_values_thumbnail.webp"
thumbnail_ready: true
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

A custom SwiftUI view is usually a small `struct` describing part of an interface. Recreating that struct does not necessarily recreate the interface or reset its state. To understand why, separate three concepts: the **view value**, the **view's identity**, and the **storage associated with that identity**.

<!--more-->

That distinction explains why a new input can leave `@State` unchanged, why a model can be recreated unexpectedly, and why a list can display one item's local state alongside another item's data. Value semantics helps explain these behaviors, but it does not, by itself, explain SwiftUI's entire rendering system.

{%
 include centered-image.html
 image_path="../images/covers/swiftui_values_thumbnail.webp"
 alt_text="Separate interface snapshots connected by arrows, showing views rebuilt from state"
 caption="View descriptions can change while an identity and its state persist."
 width="640"
 height="400"
%}

## View Values and View Identity Have Different Lifetimes

Consider a view with an ordinary input:

```swift
struct Greeting: View {
    let name: String

    var body: some View {
        Text("Hello, \(name)")
            .font(.title)
    }
}
```

A `Greeting` value stores a name and describes content through `body`. It isn't a `UILabel` reference that you keep and update directly. SwiftUI uses the description to manage the displayed interface.

A parent can produce a new `Greeting` value during an update while SwiftUI continues to recognize the same view identity. SwiftUI-managed state belongs to that continuing identity. It isn't reset merely because a struct initializer ran again.

Appearance is a separate concern. `onAppear` and `onDisappear` are not constructor and destructor callbacks. A view can disappear and later reappear while associated state survives, depending on its container and whether its identity remains in the hierarchy. Avoid using appearance callbacks to infer an exact state-storage lifetime. [Apple's explanation of identity and lifetime](https://developer.apple.com/videos/play/wwdc2021/10022/) develops this distinction.

## Value Semantics Does Not Mean Immutability or Thread Safety

A struct can have mutable properties. Copying it copies its stored values, which can include references to shared class instances. It does not recursively clone everything reachable through those references.

A view value can therefore contain a reference to a model that other code also uses. Nor does declaring a struct make concurrent access to a shared variable safe. Isolation and `Sendable` are separate parts of Swift's concurrency model. See [the Swift language guide's discussion of concurrency](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/).

Current SwiftUI SDKs declare `View` with `@MainActor` isolation. That affects conforming code according to Swift's isolation rules; it is not a blanket statement that every view-related function or initializer must execute on the main actor. Some APIs are explicitly `nonisolated`, and older SDK annotations differ. [The `View` declaration](https://developer.apple.com/documentation/swiftui/view) is the relevant API contract.

### Why an ordinary counter property doesn't work

This example is intentionally invalid:

```swift
struct Counter: View {
    var count = 0

    var body: some View {
        Button("Count: \(count)") {
            count += 1 // Error: self is immutable here.
        }
    }
}
```

The action cannot mutate the captured view's ordinary stored property in this context. More fundamentally, an ordinary property does not establish persistent, observable local state for SwiftUI.

Use `@State` for this counter:

```swift
struct Counter: View {
    @State private var count = 0

    var body: some View {
        Button("Count: \(count)") {
            count += 1
        }
    }
}
```

The wrapper provides access to a value managed by SwiftUI. Writes through it can invalidate views that depend on that state. Updating the state from an event handler is appropriate; mutating state while evaluating `body` can cause update loops and other problems. [State documentation](https://developer.apple.com/documentation/swiftui/state) describes its intended use.

### Modifiers return configured values

Calling a modifier doesn't give you imperative access to a persistent view object. Modifier order matters because each call operates on the result of the preceding call:

```swift
Text("Hello").padding().background(.red)
Text("Hello").background(.red).padding()
```

In the first expression the background includes the padding. In the second the padding sits outside the background.

Many general modifiers produce wrapper view types, but **not every modifier returns a different type**. For example, the `Text.font(_:)` overload returns another `Text`. Avoid treating printed private generic type names as a stable API. [Text's font modifier](https://developer.apple.com/documentation/swiftui/text/font(_:)) documents its return type.

## Choose Storage and Observation Separately

A useful starting point is to ask where the source of truth lives, then how this view observes or edits it:

| Declaration | Typical purpose |
| --- | --- |
| Ordinary `let` or `var` | Input supplied to a view; it can contain values or references. |
| `@State` | Local state preserved by SwiftUI for a view identity. It can also hold an `@Observable` model on supported systems. |
| `@Binding` | Read and write an existing source of truth through a binding. |
| `@StateObject` | Preserve an `ObservableObject` instance as the view's source of truth. |
| `@ObservedObject` | Subscribe to an `ObservableObject` supplied from elsewhere. |
| `@Bindable` | Produce bindings to properties of an `@Observable` model. |
| `@Environment` / `@EnvironmentObject` | Obtain values or objects through the environment. Their underlying lifetimes depend on how they are supplied. |

A plain model property can be correct. In particular, an `@Observable` reference supplied by a parent does not need `@ObservedObject`: SwiftUI tracks supported property accesses during `body` evaluation. Use `@Bindable` when you need bindings to that model. These Observation examples require iOS 17, macOS 14, or the corresponding platform releases. [Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/) explains these choices.

Also distinguish ownership conventions from ARC. `@ObservedObject` is not a weak reference; it simply does not provide the identity-scoped object creation and preservation supplied by `@StateObject`. [ObservedObject documentation](https://developer.apple.com/documentation/swiftui/observedobject) recommends receiving it as an input.

## Updates Are Driven by Dependencies

A useful model of an update is:

1. A dependency changes: an input, state, an environment value, or observed model data.
2. SwiftUI determines which parts of the view hierarchy need updating.
3. It can evaluate affected `body` properties to obtain updated descriptions.
4. It performs the necessary layout and rendering work.

A `body` evaluation is not equivalent to recreating platform views, redrawing every pixel, or presenting a frame. Updates can be combined, and unchanged portions can avoid further work. SwiftUI's complete comparison and scheduling algorithms are implementation details, so correctness should not depend on a specific field-by-field comparison strategy or an exact number of `body` calls. [Demystify SwiftUI performance](https://developer.apple.com/videos/play/wwdc2023/10160/) provides Apple's practical model.

Observation granularity also matters. `ObservableObject` subscribers respond to its change publisher, usually driven by `@Published`; this is broader than property-access tracking. With `@Observable`, supported property reads during `body` establish more specific dependencies. Reading a property only inside a button action does not, by itself, establish a dependency for displaying that property.

Extracting a dedicated subview can give SwiftUI a useful update boundary. A computed property or `@ViewBuilder` helper still executes when its caller evaluates that expression; however, it can return child views that have their own identity and update behavior. Neither helper functions nor separate structs guarantee a particular performance result. Measure before restructuring a working screen.

### Equality must preserve behavior

`.equatable()` supplies an explicit equality-based update boundary for an `Equatable` view. A simple example uses only value inputs and synthesized equality:

```swift
struct ScoreSummary: View, Equatable {
    let name: String
    let score: Int

    var body: some View {
        Text("\(name): \(score)")
    }
}

// In a parent's body:
ScoreSummary(name: playerName, score: playerScore)
    .equatable()
```

Do not write `==` that ignores a displayed name or a changed action closure merely to reduce updates. An equality check that hides a meaningful change can produce stale content or behavior. Also, equality of input values does not erase independently changing state or environment dependencies. See [EquatableView](https://developer.apple.com/documentation/swiftui/equatableview).

## Common Bugs and Their Causes

### 1. Expecting a new input to replace existing state

```swift
struct DraftEditor: View {
    @State private var text: String

    init(initialText: String) {
        _text = State(initialValue: initialText)
    }

    var body: some View {
        TextField("Draft", text: $text)
    }
}
```

The initializer provides an initial value. If SwiftUI keeps the same identity, recreating `DraftEditor` with a different `initialText` does not replace the user's current draft.

If the parent owns the editable text, accept `@Binding var text: String`. If this is intentionally a separate draft, decide when to reset it explicitly. Applying `.id(documentID)` can reset the editor when switching documents, but it resets all state under that identity, not just the text.

### 2. Creating an owned model with `@ObservedObject`

```swift
struct ProfileView: View {
    @ObservedObject var model = ProfileModel() // Fragile ownership pattern.
    // ...
}
```

Evaluating this default expression creates a model for each new `ProfileView` value. Recreating the view can therefore replace its model and restart work or lose data.

For a model that this view creates and preserves, use:

```swift
@StateObject private var model = ProfileModel()
```

**`@StateObject` and property-wrapper-based `@State` do not initialize the same way.** `StateObject` takes its wrapped-value expression as an autoclosure. In the declaration above, SwiftUI evaluates that model-creation expression when it needs to create the state object, once for that identity. This preserves the instance across later view-value initializations.

If you construct the model in a local variable *before* passing it to `StateObject`, that eager construction has already happened. In contrast, `@State private var model = ObservableModel()` can evaluate its default expression whenever the containing view value is initialized, even when existing state storage is retained. Keep such initializers inexpensive and free of side effects. [StateObject documentation](https://developer.apple.com/documentation/swiftui/stateobject) explains its deferred creation behavior.

### 3. Treating `init`, `body`, or `onAppear` as a one-time setup hook

An initializer can run without a new view identity being inserted. `body` can run repeatedly. `onAppear` can also run again after reappearance.

Use lifecycle modifiers such as `.task` for appropriate work, and make the work tolerant of cancellation and repetition. Moving a synchronous, expensive computation into `.task` does not automatically move it off the main actor. Keep expensive processing in an appropriately isolated model or service.

### 4. Loading data without identifying which input it belongs to

A plain `.task { ... }` does not automatically restart for every changed stored property. If loading depends on an article ID, use that ID explicitly:

```swift
struct ArticleView: View {
    let articleID: UUID
    let load: @Sendable (UUID) async throws -> String

    @State private var text = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack {
            Text(text)
            if let errorMessage {
                Text(errorMessage)
            }
        }
        .task(id: articleID) {
            text = "Loading…"
            errorMessage = nil
            do {
                let result = try await load(articleID)
                try Task.checkCancellation()
                text = result
            } catch is CancellationError {
                // Cancellation needs no error message.
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = error.localizedDescription
            }
        }
    }
}
```

A changed ID requests cancellation of the old task and starts another. Cancellation is cooperative: the loader must support it, and checking before assigning helps prevent a cancelled operation from displaying its result. A task can also run again after the view reappears; it isn't a lifetime-wide “run once” mechanism. [Apple's task modifier documentation](https://developer.apple.com/documentation/swiftui/view/task(id:name:priority:file:line:_:)) describes cancellation and restart behavior.

### 5. Identifying list data by a changing position

```swift
ForEach(items.indices, id: \.self) { index in
    ItemRow(item: items[index])
}
```

Index identity can be appropriate for fixed positional data. For an editable collection of entities, removing or reordering items can associate a surviving row identity, and its local state, with a different entity.

Prefer stable, unique data identifiers:

```swift
ForEach(items) { item in // Item conforms to Identifiable.
    ItemRow(item: item)
}
```

A stored `UUID` is fine if it remains attached to the same logical item. A computed `id` that returns `UUID()` on every access is unstable; regenerating every ID on each refresh also loses continuity. For `id: \.self`, the values must provide the uniqueness and stability your use case requires. [ForEach documentation](https://developer.apple.com/documentation/swiftui/foreach) explains the role of its identifiers.

### 6. Changing structural identity unintentionally

```swift
if isCompact {
    DetailView(item: item)
} else {
    DetailView(item: item)
        .padding()
}
```

These branches give the content distinct structural identities. Switching branches can reset state inside `DetailView`. When only padding needs to change, keep one view:

```swift
DetailView(item: item)
    .padding(isCompact ? 0 : 16)
```

Likewise, `.id(UUID())` creates a new explicit identity each time that expression is evaluated. Use identity changes deliberately when you want replacement and a reset. Insertion and removal may animate through transitions when an appropriate animation transaction is present; an identity change alone does not guarantee an animation.

## Verify the Behavior You Depend On

For local debugging, Apple demonstrates this diagnostic:

```swift
var body: some View {
    let _ = Self._printChanges()
    Text("Example")
}
```

Its output is a best-effort explanation of a `body` evaluation, not a record of rendered frames. It is underscored and not a stable public API: remove it from shipping code. For performance questions, measure with Instruments instead of counting initializer calls.

The practical rule is to keep view descriptions inexpensive, give persistent data an explicit source of truth, and keep identifiers stable for the lifetimes you intend. Recreating a view value and replacing a view identity are different events; designing around that distinction prevents many common state bugs.
