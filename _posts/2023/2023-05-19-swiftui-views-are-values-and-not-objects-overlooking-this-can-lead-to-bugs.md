---
layout: post
title: "SwiftUI Views Are Values, Not Objects: Understanding the Implications"
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

In SwiftUI, a view is not a long-lived object sitting on screen. It is a lightweight value, usually a `struct`, that *describes* a piece of UI. SwiftUI creates these values, reads them, and throws them away constantly.

<!--more-->

That one fact explains a lot of SwiftUI behavior that looks strange if you come from UIKit: why you can't just assign to a property inside `body`, why `@State` sometimes "ignores" a new value you pass in, why a `.task` keeps working with stale data, and why state can suddenly reset. Let's look at what "views are values" really means, how SwiftUI uses it to update the screen, and the bugs you get when you forget it. 🧐

{%
 include centered-image.html
 image_path="../images/covers/swiftui_values_thumbnail.webp"
 alt_text="Separate interface snapshots connected by arrows, showing views rebuilt from state"
 caption="SwiftUI views as value snapshots driven by state"
 width="640"
 height="400"
%}

## A View Is a Description, Not the Thing on Screen

In UIKit, a `UILabel` is an object. You create it once, keep a reference to it, and change its `text` over time. The object *is* the thing on screen.

In SwiftUI, this:

```swift
struct Greeting: View {
    let name: String

    var body: some View {
        Text("Hello, \(name)")
            .font(.title)
    }
}
```

is just a recipe. A `Greeting` value holds a string and knows how to produce a `body`. It isn't rendered, and it has no frame and no lifetime of its own. SwiftUI reads the description and keeps its own, separate, long-lived representation of the UI (internally a dependency graph, often called the *attribute graph*). That internal representation is what owns the state, the layout results, and the platform views or layers that end up on screen.

So there are two different lifetimes to keep apart:

- **The lifetime of a view value.** Very short. A `Greeting` struct may be created every time its parent's `body` runs, then discarded.
- **The lifetime of a view's identity.** As long as SwiftUI considers "this view" to be the same view in the hierarchy. This is where `@State` storage lives, and it is the span between `onAppear` and `onDisappear` (roughly; containers like `List` can fire these more than once as rows scroll in and out).

Most of the bugs below come from mixing up these two lifetimes.

### Why structs?

Making views value types is a deliberate design choice, not just a matter of taste:

- **They're cheap.** A small struct is stored inline and is often just a few bytes. Creating thousands of them per second costs almost nothing, while creating and tearing down class instances means heap allocation and reference counting.
- **No shared mutable state between copies.** A view value can't be changed behind your back by someone holding another reference to it, so the description SwiftUI reads is exactly the one `body` produced.
- **No inheritance.** There's no `UIView`-style base class carrying dozens of stored properties. Behavior is added by composition (wrapping views in other views and modifiers) instead.
- **They're easy to compare.** SwiftUI can compare a new view value with the previous one to decide whether anything below it needs updating. More on that below.

## What Value Semantics Does (and Doesn't) Give You

### Views aren't "immutable", but `body` can't mutate them

A view struct can declare `var` properties, and its initializer can set them however it likes. What you can't do is mutate `self` from inside `body`, because `body` is a non-mutating computed property:

```swift
struct Counter: View {
    var count = 0

    var body: some View {
        Button("Tapped \(count) times") {
            count += 1 // ❌ Cannot assign to property: 'self' is immutable
        }
    }
}
```

Even if this compiled, it would be pointless: the struct is a throwaway copy, and SwiftUI would make a fresh `Counter` with `count = 0` the next time the parent's `body` runs. State that must survive belongs in storage SwiftUI manages for you:

```swift
struct Counter: View {
    @State private var count = 0

    var body: some View {
        Button("Tapped \(count) times") {
            count += 1 // ✅ writes to storage owned by SwiftUI, not to the struct
        }
    }
}
```

`@State` is a property wrapper. The struct holds a small handle, and the real value lives in SwiftUI's graph, tied to the view's identity. That is why it survives the struct being recreated.

### Modifiers wrap, they don't mutate

`.font(.title)` doesn't change the `Text`. It returns a *new* value of a *different type* that wraps the original. You can see this by printing the type:

```swift
let view = Text("Hi")
    .padding()
    .background(.red)

print(type(of: view))
// ModifiedContent<ModifiedContent<Text, _PaddingLayout>, _BackgroundStyleModifier<Color>>
```

(The exact internal type names vary between SDK versions, but the nesting is the point.)

Chaining modifiers builds a nested type that describes the whole thing, from the inside out. That's also why modifier order matters: `.padding().background(.red)` paints the padding red, while `.background(.red).padding()` paints only behind the text and adds clear space around it. They are different descriptions, so they produce different results.

### Thread safety is not automatic

A common claim is that value types are "inherently thread-safe". That's only partially true. Copying a struct gives you an independent copy of its stored values, but if those values include references (an `ObservableObject`, a class-based model, a closure capturing shared state), the copies still point to the same shared object. Swift models this with `Sendable`, not with "it's a struct".

For SwiftUI specifically, the `View` protocol is isolated to the main actor (made explicit in the iOS 18 SDK), so `body` and view initializers run on the main thread anyway. Being a value type is not what keeps your views safe from data races. Main-actor isolation does that.

## Who Owns the Data?

Because the view struct itself can't hold anything durable, every piece of data in a view is either a plain input that gets replaced on each re-creation, or a handle to storage that lives somewhere else. Choosing the right property wrapper is mostly a question of *who owns the data and how long it lives*:

| Declaration | Who owns the data | Lives as long as |
|---|---|---|
| `let` / `var` (no wrapper) | The parent, passed in | One view value (replaced on every re-creation) |
| `@State` | This view (SwiftUI stores it) | This view's identity |
| `@Binding` | Someone else; this view can read and write it | The owner's storage |
| `@StateObject` | This view (for `ObservableObject`) | This view's identity |
| `@ObservedObject` | Someone else (for `ObservableObject`) | Whoever owns the object |
| `@State` with an `@Observable` class | This view (iOS 17+) | This view's identity |
| `@Environment` / `@EnvironmentObject` | An ancestor view | The ancestor's storage |

A plain stored property isn't wrong. It is the right choice for input data the view only displays. It just can't be the source of truth for anything the view changes.

## How SwiftUI Decides What to Update

When state changes, SwiftUI doesn't rebuild the whole screen, and it doesn't run a React-style "diff two whole trees" pass either. Roughly:

1. A piece of state changes, such as a `@State` value or a property of an `@Observable` model.
2. SwiftUI's dependency graph knows which views *read* that state while their `body` ran, so only those views are invalidated.
3. SwiftUI re-runs `body` for the invalidated views, producing new child view values.
4. For each child, it compares the new value with the previous one. If they're equal, it can skip running that child's `body`. If not, the child is updated as well.
5. Layout and rendering are updated for whatever actually changed.

This works because views are cheap values: creating and comparing them costs far less than creating and tearing down objects. It is also why **view initializers and `body` should be cheap and free of side effects**. SwiftUI may call them often, and you don't control when.

### How views are compared

By default SwiftUI compares a view's stored properties field by field. Simple values like numbers, strings, and `Equatable` structs compare well. Some things can't be compared in a meaningful way, closures being the classic example, so a view that stores a closure is often treated as "changed" every time its parent re-renders.

If you know better than SwiftUI which properties matter, you can make the view `Equatable` and apply `.equatable()` so SwiftUI uses your `==`:

```swift
struct ScoreRow: View, Equatable {
    let player: Player
    let onTap: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.player.id == rhs.player.id && lhs.player.score == rhs.player.score
    }

    var body: some View {
        Button(player.name, action: onTap)
    }
}

// In the parent:
ScoreRow(player: player, onTap: { select(player) })
    .equatable()
```

Use this sparingly and only after measuring. If your `==` ignores something the body actually depends on, the view will show stale content, which is exactly the kind of bug this post is about.

### Smaller views mean smaller updates

Each separate `View` struct gets its own node in SwiftUI's graph, so it can be compared and skipped on its own. A computed property or a `@ViewBuilder` function inside the same view does not: it is just part of the parent's `body`, and it re-runs whenever the parent does.

```swift
struct Dashboard: View {
    @State private var model = DashboardModel()

    var body: some View {
        VStack {
            header           // re-runs whenever Dashboard's body runs
            ChartView(points: model.points) // can be skipped if `points` didn't change
        }
    }

    private var header: some View {
        Text(model.title).font(.largeTitle)
    }
}
```

Computed properties are fine for organizing code. Extract a real subview when a part of the screen is expensive, or depends on only a small slice of the data.

### `@Observable` tracks what you read

How precisely views are invalidated depends on how you model your data:

- With **`ObservableObject`**, any `@Published` property change fires `objectWillChange`, and every view observing that object is invalidated, even views that never read the changed property.
- With the **`@Observable` macro** (iOS 17+), SwiftUI records which properties each `body` actually read and invalidates a view only when one of *those* properties changes.

Either way, the dependency is on what `body` reads. A view that receives a whole model but displays a single property still depends on that model; with `ObservableObject` that means more invalidations than necessary.

### Identity decides whether state survives

To match "old" and "new" views, SwiftUI uses **identity**:

- **Structural identity** comes from a view's type and its position in the hierarchy. The branches of an `if`/`else` in a `@ViewBuilder` are different positions (under the hood the result is a `_ConditionalContent` with two slots), so they count as different views.
- **Explicit identity** comes from `ForEach` (via `Identifiable` or `id:`) and from the `.id(_:)` modifier.

When identity changes, SwiftUI treats the old view as removed and the new one as inserted. Its state is destroyed and recreated, and transitions play instead of in-place animations.

`AnyView` deserves a mention here. It erases the wrapped view's type, so SwiftUI can no longer see the structure statically. When the type inside an `AnyView` changes, SwiftUI has to throw away the old content and build the new one. `AnyView` works, but prefer `@ViewBuilder`, `Group`, or `some View` when you can.

### Animations interpolate data, not views

SwiftUI doesn't animate by "comparing old and new views". When a change happens inside a transaction that carries an animation (for example via `withAnimation`), SwiftUI interpolates *animatable data*, such as positions, sizes, opacities, or a shape's `animatableData`, from the old value to the new one over time. Views that are inserted or removed use transitions. Identity matters here too: the same view with a new value animates in place, while a view with new identity gets a transition.

## Bugs That Come From Forgetting Views Are Values

### 1. Expecting `@State` to follow a new value passed in

```swift
struct Editor: View {
    @State private var text: String

    init(initialText: String) {
        _text = State(initialValue: initialText)
    }

    var body: some View {
        TextField("Text", text: $text)
    }
}
```

`State(initialValue:)` is used **only when the view's identity is first created**. When the parent later passes a different `initialText`, a new `Editor` struct is made, but SwiftUI keeps the existing storage and ignores the new initial value. If the parent owns the data, take a `@Binding` instead. If you really want to reset the state, give the view a new identity with `.id(someKey)`.

### 2. Creating a model with `@ObservedObject`

```swift
struct ProfileView: View {
    @ObservedObject var model = ProfileModel() // ❌
    // ...
}
```

`@ObservedObject` does not own its object. Every time the parent re-evaluates its `body`, a new `ProfileView` struct is created, and with it a brand-new `ProfileModel`. Anything the old model had loaded is lost. If the view creates and owns the object, use `@StateObject` (or `@State` with an `@Observable` class on iOS 17+). Use `@ObservedObject` only for objects that someone else owns and passes in.

A related subtlety: with `@StateObject` and `@State`, the default-value expression still *runs* every time the struct is initialized. SwiftUI just discards the extra instances and keeps the original. Keep model initializers cheap, or create the model lazily (for example in `.task`).

### 3. Doing work in `init` or `body`

Because view values are created and discarded freely, an `init` that starts a network request, or a `body` that sorts a large array or formats dates with a fresh `DateFormatter`, will repeat that work more often than you expect. Put side effects in `.task`, `.onAppear`, or `.onChange(of:)`, which are tied to the view's identity, and move expensive work into your model.

### 4. A `.task` that keeps using an old value

Closures inside a view capture a *copy* of the view struct at the moment they're created. Plain properties in that copy never change:

```swift
struct ArticleView: View {
    let articleID: Article.ID
    @State private var article: Article?

    var body: some View {
        content
            .task {
                article = try? await api.fetch(articleID) // ❌ runs once
            }
    }
}
```

`.task` starts when the view appears and is tied to the view's identity, not to its inputs. If the parent keeps the same `ArticleView` on screen but passes a new `articleID`, the task doesn't run again, and the screen keeps showing the old article. Tell SwiftUI what the task depends on:

```swift
.task(id: articleID) {
    article = try? await api.fetch(articleID) // ✅ cancelled and restarted when articleID changes
}
```

The same reasoning applies to `.onAppear`, and to any long-running work (timers, async sequences) that captured `self` when it started.

### 5. Unstable identities in `ForEach`

```swift
ForEach(items.indices, id: \.self) { index in
    ItemRow(item: items[index])
}
```

Here the identity of each row is its *position*. Delete the first item and every row below it gets a new item but keeps its old identity, which means it also keeps the old row's `@State`. Text fields show the wrong text, toggles stay in the wrong state, and animations slide the wrong rows. The same thing happens with `id: \.self` on values that can repeat or change.

Use a stable, unique identifier that belongs to the data:

```swift
ForEach(items) { item in // Item: Identifiable, with a stable id
    ItemRow(item: item)
}
```

And avoid generating ids on the fly, such as `let id = UUID()` in a struct you re-create from the server on every refresh. A new id is a new identity, and the row resets.

### 6. Accidentally resetting state with identity changes

```swift
if isCompact {
    DetailView(item: item)
} else {
    DetailView(item: item)
        .padding()
}
```

These are two different `DetailView`s as far as SwiftUI is concerned, because they sit in different branches. Toggling `isCompact` destroys one and creates the other, which resets any `@State` inside. Prefer a single view whose modifiers depend on the condition:

```swift
DetailView(item: item)
    .padding(isCompact ? 0 : 16)
```

The same applies to `.id(UUID())`: it generates a new identity on every `body` evaluation and resets the view each time. The popular `.if(condition) { $0.padding() }` helper extension has the same problem, because it is just an `if`/`else` in disguise.

## Seeing It for Yourself

You don't have to take any of this on faith. SwiftUI has a debugging helper that prints why a view's `body` ran:

```swift
var body: some View {
    let _ = Self._printChanges()
    // ...
}
```

Each time `body` runs, it prints the view name and what changed, for example `ArticleView: @self, _article changed.` Here `@self` means the view value itself was different from the previous one, and `_article` is the `@State` storage. On iOS 17 and later, `Self._logChanges()` does the same thing through the unified logging system. Both start with an underscore because they are meant for debugging only, so don't ship them.

For real performance work, use the SwiftUI template in Instruments, which shows how often each view's `body` runs and how long it takes.

## Comparison with UIKit

In UIKit you write two code paths: one that builds the UI, and one that updates it when data changes (setting `label.text`, calling `tableView.reloadData()`, and so on). Forgetting an update in the second path is a classic source of UI that's out of sync with the data.

SwiftUI merges these into one path: `body` describes the UI for the *current* state, and SwiftUI works out what to change. You still handle events (button actions, gestures, `onChange`), but those handlers update *state*, not views. The UI follows from the state.

The trade-off is control. In UIKit you decide exactly when each object is created, updated, and destroyed. In SwiftUI you give that up, and in exchange you have to describe identity and dependencies correctly so SwiftUI can make those decisions for you.

## Conclusion

A SwiftUI view is a cheap, disposable description of UI, not the UI itself. SwiftUI keeps the real, long-lived structure, along with your state, in its own graph and matches new descriptions to it by identity.

Once you keep the two lifetimes apart (short-lived view values versus long-lived view identity), most of SwiftUI's surprises make sense:

- Put state that must persist in `@State`, `@StateObject`, or an `@Observable` model, never in plain stored properties.
- Use `@Binding` or `@ObservedObject` for data owned by someone else.
- Keep `init` and `body` cheap and free of side effects.
- Use `.task(id:)` and `.onChange(of:)` when work depends on an input that can change.
- Give `ForEach` stable, unique ids, and be deliberate about identity everywhere else, because changing it resets state.
- When in doubt, add `Self._printChanges()` and watch what actually happens.

## Further Reading

- [Demystify SwiftUI](https://developer.apple.com/videos/play/wwdc2021/10022/) (WWDC21): identity, lifetime, and dependencies.
- [Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/) (WWDC23): how `@Observable` tracks dependencies.
- [Demystify SwiftUI performance](https://developer.apple.com/videos/play/wwdc2023/10160/) (WWDC23): dependencies, identity, and what makes updates slow.
