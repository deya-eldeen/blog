---
layout: post
title: "iOS Accessibility Basics"
date: "2023-08-02"
last_modified_at: "2026-10-20"
permalink: /ios-accessibility/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/ios_accessibility_thumbnail.webp"
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
redirect_from:
  - /ios-accessibility-series-part-1/
---

iOS accessibility is about building apps that people with disabilities can use as fully and independently as everyone else. Apple ships a remarkable set of assistive technologies with every iPhone and iPad, from the VoiceOver screen reader to Voice Control and Switch Control, and it gives developers the APIs to make their apps work with all of them. [Apple's accessibility site](https://developer.apple.com/accessibility/) is the official starting point.

<!--more-->

The World Health Organization estimates that about 1.3 billion people, roughly 1 in 6 of us, live with a significant disability. Add the people who are temporarily injured, getting older, or just using their phone one-handed on a bright, noisy street, and accessibility stops being an edge case. It's simply part of building a good app.

The good news: most of the work is small, concrete, and much cheaper when you do it from the start. This post covers why accessibility matters, then walks through the practical side: what each assistive technology needs from your app, the SwiftUI and UIKit APIs that provide it, and how to test the result.

{%
 include centered-image.html
 image_path="../images/covers/ios_accessibility_thumbnail.webp"
 alt_text="A smartphone surrounded by accessibility, hearing, speech, and scalable text symbols"
 caption="Building accessible and inclusive iOS interfaces"
 width="640"
 height="400"
%}

## Why Accessibility Matters

Making your app accessible opens it to people with visual, hearing, motor, speech, and cognitive disabilities, many of whom rely on their iPhone more than anyone: to read mail, recognize objects, navigate cities, and talk to the people they love. If your app doesn't work with VoiceOver, for a blind user it simply doesn't work.

Accessibility also tends to improve the app for everyone. This is known as the *curb-cut effect*, after the sidewalk ramps designed for wheelchair users that turned out to help everyone pushing a stroller or pulling a suitcase. Captions help people in loud places, larger text helps tired eyes, clear labels help people new to your app, and good contrast helps everyone outdoors.

### Why Accessibility Gets Overlooked

Many teams skip accessibility for reasons that don't hold up:

1. **Lack of awareness.** Many developers have never seen someone use VoiceOver, so they don't know what's broken.
2. **Perceived complexity.** It looks like a big, specialized field. In practice, standard UIKit and SwiftUI controls are accessible out of the box, and most of the remaining work is a handful of modifiers.
3. **Misaligned priorities.** Visual polish and new features win, and accessibility is pushed to "later", which is when it becomes expensive.
4. **Cost.** Retrofitting an app is costly. Building it accessibly from the start usually isn't.
5. **"Our users don't need it."** Disabilities are common, often invisible, and many people don't call themselves "disabled" even though they use larger text or captions every day.

## Laws and Standards

*This section is a general overview, not legal advice. Requirements depend on where you operate and who your users are.*

### Standards: WCAG

The **Web Content Accessibility Guidelines (WCAG)** are the most widely used accessibility standard. They're published by the **W3C** through its **Web Accessibility Initiative (WAI)**. The current version is **WCAG 2.2** (2023), and most laws reference **level AA** of WCAG 2.1 or 2.2. WCAG was written for the web, but the W3C's *WCAG2ICT* guidance explains how to apply it to native apps, and most of it carries over directly: text alternatives, contrast ratios, resizable text, no information conveyed by color alone, and so on.

Meeting WCAG doesn't automatically make an app pleasant to use with assistive technology, and it doesn't by itself guarantee legal compliance. It's still the best yardstick available.

### Laws in the United States

- **The Americans with Disabilities Act (ADA)** prohibits discrimination by businesses open to the public (Title III) and by state and local governments (Title II). The ADA doesn't mention apps or websites explicitly, and courts have disagreed about how far Title III reaches, but thousands of digital accessibility lawsuits are filed every year.
- In 2024, the Department of Justice issued a rule under **Title II** that requires state and local governments' websites and mobile apps to meet **WCAG 2.1 level AA**, with compliance dates in 2026 and 2027 depending on the size of the government.
- **Section 508** of the Rehabilitation Act requires **federal agencies** to make the technology they build, buy, and use accessible. (Organizations that *receive* federal funding are covered by a different part of the same law, Section 504.)

### Laws in Europe and elsewhere

- The **European Accessibility Act (EAA)** has applied since **June 28, 2025**. It covers many consumer products and services sold in the EU, including e-commerce, banking, e-books, and passenger transport services, and their apps. Its technical requirements are based on the European standard **EN 301 549**, which in turn includes WCAG.
- Many other countries have their own laws, such as Canada's Accessible Canada Act and Ontario's AODA, often also built on WCAG.

### What has happened in court

A few cases are often cited:

- **National Federation of the Blind v. Target (2006–2008):** A federal court allowed claims that Target's inaccessible website violated the ADA, because of its connection to Target's physical stores. The case settled for $6 million.
- **National Association of the Deaf v. Netflix (2012):** A court held that the ADA could apply to a web-only streaming service. Netflix settled and agreed to caption all of its content.
- **Robles v. Domino's Pizza (2019):** The Ninth Circuit ruled that the ADA applied to Domino's website and app, because they connected customers to its physical restaurants. The Supreme Court declined to hear Domino's appeal, and the case settled in 2022.

None of these ended with a final judgment that set the rules for every app. They're important because they show that courts take digital accessibility seriously, and most businesses choose to settle and fix their apps rather than fight.

### The consequences of ignoring it

- **Lawsuits and settlements:** Legal fees, settlements, and court-ordered remediation plans.
- **Fines:** Under laws like the EAA, regulators can impose penalties.
- **Reputation:** People notice, and people with disabilities and their families talk to each other.
- **Lost users:** The most common consequence, and the quietest one. People who can't use your app just leave.

## How People Use Their iPhones: Apple's Assistive Technologies

Before writing any code, it helps to know what you're building for. Here are the main assistive technologies built into iOS and iPadOS, all found under **Settings → Accessibility**:

| Technology | Who it helps | What it needs from your app |
|---|---|---|
| **VoiceOver** | Blind and low-vision users | Every element has a meaningful label, the right traits, and a sensible reading order. |
| **Dynamic Type / Larger Text** | Low-vision users, older users, anyone | Text that scales, and layouts that adapt instead of truncating. |
| **Voice Control** | People who can't use touch | Visible text and labels that match what users would naturally say. |
| **Switch Control** | People with limited mobility who use one or more switches | Elements reachable in a logical order, with actions available without complex gestures. |
| **AssistiveTouch** | People who find gestures or physical buttons difficult | Alternatives to gestures like pinch, shake, or long press. |
| **Full Keyboard Access** | Keyboard users, especially on iPad | Every control reachable and usable with a keyboard. |
| **Display settings** (Increase Contrast, Reduce Transparency, Bold Text, Button Shapes, Smart Invert, Differentiate Without Color) | Low-vision and color-blind users | Respect these settings instead of overriding them. |
| **Reduce Motion** | People with vestibular disorders or motion sensitivity | Gentler alternatives to large animations, parallax, and auto-playing motion. |
| **Captions, Audio Descriptions, Live Captions** | Deaf, hard-of-hearing, and blind users | Caption tracks and audio descriptions for media, no information conveyed by sound alone. |
| **Assistive Access, Guided Access** | People with cognitive disabilities | Simple, predictable flows. |
| **Live Speech, Personal Voice** | People who can't speak, or are losing their voice | Don't require voice input for core features. |

The rest of this post goes through these one by one, with code. Most of the APIs exist in both SwiftUI and UIKit; I'll show SwiftUI first and UIKit where it differs.

## VoiceOver: Labels, Values, Traits, and Hints

VoiceOver reads the element under the user's finger, and users swipe left and right to move between elements. For each element, it typically reads four pieces of information:

| Property | Example | Question it answers |
|---|---|---|
| **Label** | "Volume" | What is this? |
| **Value** | "60 percent" | What is its current state? |
| **Traits** | "adjustable", "button", "selected", "heading" | What kind of thing is it, and how does it behave? |
| **Hint** | "Swipe up or down to adjust." | What happens if I use it? (optional, read after a pause) |

Standard controls like `Button`, `Toggle`, `Slider`, and `UISwitch` fill most of this in automatically. Your job is mostly to fix what the system can't guess.

### Label icon-only buttons

This is the single most common VoiceOver bug. A button with only an image has no text for VoiceOver to read:

```swift
Button {
    toggleFavorite()
} label: {
    Image(systemName: isFavorite ? "heart.fill" : "heart")
}
.accessibilityLabel("Favorite")
.accessibilityAddTraits(isFavorite ? .isSelected : [])
```

VoiceOver now reads "Favorite, selected, button" instead of a guess based on the symbol's name (or worse, the image's file name). In UIKit:

```swift
favoriteButton.accessibilityLabel = "Favorite"
favoriteButton.accessibilityTraits = isFavorite ? [.button, .selected] : .button
```

An even better option in SwiftUI is to use a `Label`, which gives you a text label for free and lets the style decide what's visible:

```swift
Button(action: toggleFavorite) {
    Label("Favorite", systemImage: "heart")
}
.labelStyle(.iconOnly) // shows only the icon, VoiceOver still reads "Favorite"
```

### Write good labels

Apple's guidelines for labels:

- **Be short and specific:** "Add to cart", not "This button adds the current item to your shopping cart".
- **Don't include the control type.** VoiceOver already says "button", so "Play button" is read as "Play button, button".
- **Start with a capital letter and don't end with a period.** VoiceOver reads labels better that way.
- **Describe what it is, not what it looks like:** "Delete", not "Trash can".
- **Localize them.** Labels are user-facing text like any other. `accessibilityLabel` in SwiftUI accepts localized string keys, so add them to your string catalog.

Hints are optional and are read after a short pause, if the user hasn't turned them off. Use them only when the result of an action isn't obvious, and describe the result rather than the gesture: "Plays the song", not "Double-tap to play the song". VoiceOver users already know how to activate things.

### Hide decorative images, describe meaningful ones

Images that are purely decorative should be skipped entirely, so users don't swipe through noise:

```swift
Image(decorative: "background-wave")       // never read by VoiceOver

Image("divider")
    .accessibilityHidden(true)              // same, for any view
```

Meaningful images need a label that describes what matters about them in context:

```swift
Image("chart-weekly-sales")
    .accessibilityLabel("Weekly sales, up 12 percent from last week")
```

In UIKit, images aren't accessibility elements by default. Set `isAccessibilityElement = true` and an `accessibilityLabel` for meaningful ones.

### Group related content

Without grouping, a list row with a name, a price, a rating, and a thumbnail can take four or five swipes. Combine it into one element:

```swift
HStack {
    Image(product.imageName)
        .accessibilityHidden(true)
    VStack(alignment: .leading) {
        Text(product.name)
        Text(product.price, format: .currency(code: "USD"))
    }
    Spacer()
    RatingView(rating: product.rating)
}
.accessibilityElement(children: .combine)
```

`.combine` joins the children's labels, so VoiceOver reads the whole row in one go. If the automatic result reads awkwardly, use `.ignore` and write the label yourself:

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel("\(product.name), \(product.formattedPrice), rated \(product.rating) out of 5")
```

In UIKit, make the cell itself the accessibility element: set `isAccessibilityElement = true` on the cell and give it an `accessibilityLabel` built from its contents.

### Use the right traits

Traits tell VoiceOver what an element *is*:

- `.isButton` for anything tappable that isn't a real `Button`. In SwiftUI, a view with `.onTapGesture` is **not** a button to VoiceOver, so prefer a real `Button` with a custom style.
- `.isHeader` for section titles. VoiceOver users can jump between headings with the **rotor** (a two-finger twisting gesture), which makes long screens much faster to navigate.
- `.isSelected` for the current tab, the chosen option, a toggled-on state.
- `.isLink`, `.isImage`, `.isSearchField`, `.updatesFrequently`, and others for their matching roles.

```swift
Text("Recent Orders")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
```

### Expose values and adjustable controls

A custom control needs to tell VoiceOver its state and let users change it. Take a five-star rating view:

```swift
struct RatingView: View {
    @Binding var rating: Int

    var body: some View {
        HStack {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: star <= rating ? "star.fill" : "star")
                    .onTapGesture { rating = star }
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Rating")
        .accessibilityValue("\(rating) out of 5 stars")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: rating = min(rating + 1, 5)
            case .decrement: rating = max(rating - 1, 1)
            @unknown default: break
            }
        }
    }
}
```

VoiceOver reads "Rating, 3 out of 5 stars, adjustable", and the user swipes up or down to change it, instead of hunting for five separate tiny stars. In UIKit, add the `.adjustable` trait and override `accessibilityIncrement()` and `accessibilityDecrement()`.

If a custom control behaves exactly like a standard one, SwiftUI's `.accessibilityRepresentation` lets you hand VoiceOver a standard control to describe it:

```swift
CustomToggleView(isOn: $isOn)
    .accessibilityRepresentation {
        Toggle("Notifications", isOn: $isOn)
    }
```

### Replace gestures with custom actions

Swipe-to-delete, long-press menus, and drag-and-drop are hard or impossible for many assistive technology users. Custom actions put them in a list VoiceOver users reach by swiping up or down, and Switch Control and Voice Control can use them too:

```swift
MessageRow(message: message)
    .accessibilityAction(named: "Reply") { reply(to: message) }
    .accessibilityAction(named: "Archive") { archive(message) }
    .accessibilityAction(named: "Delete") { delete(message) }
```

In UIKit:

```swift
cell.accessibilityCustomActions = [
    UIAccessibilityCustomAction(name: "Reply") { _ in self.reply(to: message); return true },
    UIAccessibilityCustomAction(name: "Delete") { _ in self.delete(message); return true }
]
```

This also keeps rows to a single swipe stop, instead of exposing every small button inside them.

### Control reading order and focus

VoiceOver reads elements roughly from top-left to bottom-right (or top-right to bottom-left in right-to-left languages). When your layout doesn't match the logical order, for example a big number shown above its title, adjust it:

```swift
VStack {
    Text("72°")
        .accessibilitySortPriority(1) // read second
    Text("Current temperature")
        .accessibilitySortPriority(2) // read first: higher priority goes first
}
.accessibilityElement(children: .contain)
```

When something important appears or changes, move VoiceOver's focus to it or announce it. `@AccessibilityFocusState` moves focus in SwiftUI:

```swift
struct LoginForm: View {
    @State private var errorMessage: String?
    @AccessibilityFocusState private var isErrorFocused: Bool

    var body: some View {
        VStack {
            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .accessibilityFocused($isErrorFocused)
            }
            Button("Sign In", action: signIn)
        }
    }

    private func signIn() {
        errorMessage = "Incorrect password. Try again."
        isErrorFocused = true
    }
}
```

For short-lived status messages that shouldn't steal focus, post an announcement:

```swift
AccessibilityNotification.Announcement("Saved to Favorites").post() // iOS 17+
```

In UIKit, use `UIAccessibility.post(notification: .announcement, argument: "Saved to Favorites")`. When a large part of the screen changes, post `.screenChanged` (for a new screen) or `.layoutChanged` (for a smaller change), optionally passing the element to focus as the argument.

Two more UIKit details are easy to miss when building custom popups and overlays:

- Set `accessibilityViewIsModal = true` on the overlay, so VoiceOver doesn't wander into the content behind it. SwiftUI's sheets, alerts, and popovers do this for you.
- Override `accessibilityPerformEscape()` to dismiss it, so the VoiceOver "escape" gesture (a two-finger Z-shaped scrub) works. In SwiftUI, use `.accessibilityAction(.escape) { dismiss() }` on custom overlays.

## Dynamic Type: Text That Scales

Dynamic Type lets people choose their preferred text size in **Settings → Accessibility → Display & Text Size → Larger Text**. There are seven standard sizes, plus five much larger *accessibility sizes* (AX1 to AX5) once the user turns on **Larger Accessibility Sizes**. At the largest size, body text is more than three times the default.

A large share of iPhone users change their text size from the default, so this is one of the most-used accessibility features of all.

### Use text styles

In SwiftUI, the built-in text styles scale automatically:

```swift
Text("Order summary")
    .font(.headline)

Text(order.details)
    .font(.body)
```

For custom fonts, tell SwiftUI which text style to scale with:

```swift
Text("Welcome back")
    .font(.custom("Avenir Next", size: 28, relativeTo: .title))
```

`.font(.system(size: 17))` and `.font(.custom("Avenir Next", fixedSize: 17))` do **not** scale. Avoid them for anything people need to read.

Use `@ScaledMetric` for non-text sizes that should grow with the text, like icons and spacing:

```swift
@ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 24

Image(systemName: "bell")
    .frame(width: iconSize, height: iconSize)
```

In UIKit, use preferred fonts and turn on automatic updates. `UIFontMetrics` handles custom fonts:

```swift
// System font
titleLabel.font = .preferredFont(forTextStyle: .headline)
titleLabel.adjustsFontForContentSizeCategory = true
titleLabel.numberOfLines = 0

// Custom font
let avenir = UIFont(name: "AvenirNext-Regular", size: 17)!
bodyLabel.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: avenir)
bodyLabel.adjustsFontForContentSizeCategory = true
bodyLabel.numberOfLines = 0
```

Without `adjustsFontForContentSizeCategory`, the font is only correct for the text size at the moment you set it, and doesn't update when the user changes the setting while the app is running.

### Make layouts adapt

Scaling text is the easy part. The real work is making sure the layout survives it:

- **Let text wrap.** Avoid `lineLimit(1)` and `numberOfLines = 1` for meaningful content, and avoid fixed heights on text containers.
- **Put scrollable content in a `ScrollView`** or table/collection view, so it can grow beyond the screen.
- **Switch from horizontal to vertical layouts at large sizes.** Side-by-side content that fits at the default size will be crushed at AX5:

```swift
struct ContactRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let contact: Contact

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading))
            : AnyLayout(HStackLayout())

        layout {
            Text(contact.name).font(.headline)
            Spacer()
            Text(contact.phone).font(.body)
        }
    }
}
```

`AnyLayout` keeps the children's identity when the layout changes, so state and animations are preserved. Another option is `ViewThatFits`, which picks the first layout that fits the available space.

In UIKit, check `traitCollection.preferredContentSizeCategory.isAccessibilityCategory` and switch a `UIStackView`'s `axis` from `.horizontal` to `.vertical`.

### Large Content Viewer for UI that can't grow

Some elements, like tab bars, toolbars, and segmented controls, can't grow much without breaking the layout. For those, iOS offers the **Large Content Viewer**: when the user long-presses the element at an accessibility text size, a large version of its icon and title appears in the middle of the screen. System tab bars and toolbars support it automatically. For custom ones:

```swift
CustomTabButton(title: "Library", systemImage: "books.vertical")
    .accessibilityShowsLargeContentViewer {
        Label("Library", systemImage: "books.vertical")
    }
```

In UIKit, set `showsLargeContentViewer = true` on the view and add a `UILargeContentViewerInteraction` to its container.

## Color, Contrast, and Display Settings

### Meet contrast ratios

WCAG level AA requires a contrast ratio of at least:

- **4.5:1** for regular text,
- **3:1** for large text (roughly 18 points, or 14 points bold, and larger),
- **3:1** for icons, borders of input fields, and other graphics people need in order to understand or use the interface.

Light gray text on a white background is the classic failure. The Accessibility Inspector in Xcode includes a color contrast calculator, and the automated audit described below flags low contrast too.

### Don't rely on color alone

About 1 in 12 men and 1 in 200 women have some form of color vision deficiency, most commonly red-green. Never make color the *only* way to convey something: pair it with an icon, text, or a pattern. A form field with an error should show a message and an icon, not just a red border. A chart's lines should differ in shape or be labeled directly.

Users can also ask apps to do this explicitly with **Differentiate Without Color**:

```swift
@Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

var statusIndicator: some View {
    HStack {
        Circle()
            .fill(isOnline ? .green : .red)
            .frame(width: 10, height: 10)
        if differentiateWithoutColor {
            Image(systemName: isOnline ? "checkmark" : "xmark")
        }
    }
}
```

### Respect the user's display settings

System colors (`.primary`, `.secondary`, `Color(.systemBackground)`, `UIColor.label`, and so on) automatically adapt to Dark Mode and to **Increase Contrast**. For your own colors, add a **High Contrast** variant in the asset catalog (select the color set, then check **High Contrast** under Appearances in the Attributes inspector), and the system picks it automatically.

Some settings to check for when you draw custom UI:

| Setting | SwiftUI | UIKit |
|---|---|---|
| Increase Contrast | `@Environment(\.colorSchemeContrast)` | `traitCollection.accessibilityContrast` |
| Reduce Transparency | `@Environment(\.accessibilityReduceTransparency)` | `UIAccessibility.isReduceTransparencyEnabled` |
| Bold Text | `@Environment(\.legibilityWeight)` | `UIAccessibility.isBoldTextEnabled` |
| Button Shapes | `@Environment(\.accessibilityShowButtonShapes)` | `UIAccessibility.buttonShapesEnabled` |
| Smart Invert | `.accessibilityIgnoresInvertColors()` | `accessibilityIgnoresInvertColors` |

**Smart Invert** inverts the colors of the interface but tries to leave photos and videos alone. Mark your images, video players, and maps with `.accessibilityIgnoresInvertColors()` so they don't appear as negatives.

## Motion and Animation

Large animations, parallax, and zooming transitions can cause dizziness and nausea for people with vestibular disorders. When **Reduce Motion** is on, replace them with gentler effects, like a cross-fade, rather than removing feedback entirely:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

var body: some View {
    DetailCard()
        .transition(reduceMotion ? .opacity : .move(edge: .bottom))
}
```

In UIKit, check `UIAccessibility.isReduceMotionEnabled` and observe `UIAccessibility.reduceMotionStatusDidChangeNotification`.

Also:

- Don't auto-play video when `UIAccessibility.isVideoAutoplayEnabled` is `false`.
- Give users a way to pause, stop, or hide anything that moves for more than five seconds (WCAG 2.2.2).
- Never flash anything more than three times per second (WCAG 2.3.1). Flashing content can trigger seizures.

## Motor Accessibility: Touch Targets, Voice Control, and Switches

### Make targets big enough

Apple's Human Interface Guidelines recommend touch targets of at least **44×44 points**. The visible icon can be smaller; the tappable area shouldn't be:

```swift
Button(action: close) {
    Image(systemName: "xmark")
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle()) // the whole frame is tappable, not just the glyph
}
.accessibilityLabel("Close")
```

Leave space between targets too, so a slightly-off tap doesn't hit the wrong control.

### Provide alternatives to complex gestures

Pinching, multi-finger swipes, shaking, precise dragging, and long presses are hard for many people. Every action reachable through such a gesture should also be available through a simple tap: a visible button, a menu, or at least a custom accessibility action as shown above.

Avoid time limits where you can. If a session must expire, warn the user and let them extend it.

### Support Voice Control

Voice Control lets people use their device entirely by speaking: "Tap Send", "Scroll down", "Show numbers". It uses your accessibility labels as the names people speak, which is one more reason they should be short and match the visible text. A button that shows "Send" but has the label "Submit message" can't be activated by saying what the user sees.

When people might naturally use several names for one control, give Voice Control alternatives:

```swift
Button("Compose", action: compose)
    .accessibilityInputLabels(["Compose", "New message", "Write"])
```

In UIKit, set `accessibilityUserInputLabels`.

### Switch Control and Full Keyboard Access

Switch Control users move through the screen one element at a time with a switch or two, and Full Keyboard Access users do the same with Tab and the arrow keys. Both depend on the same foundation as VoiceOver: a logical element order, sensible grouping (one stop per list row, not five), and actions that don't require gestures. If your app works well with VoiceOver, it usually works well with these too. Still, test them, because custom controls that ignore focus are a common failure.

## Hearing Accessibility

- **Caption your videos.** `AVPlayerViewController` (and SwiftUI's `VideoPlayer`) shows closed captions and subtitles automatically when the media includes caption tracks and the user has enabled them in **Settings → Accessibility → Subtitles & Captioning**. Your job is to provide the tracks. If you build a custom player, respect the setting with `MACaptionAppearanceGetDisplayType` from the MediaAccessibility framework.
- **Add audio descriptions** when important information in a video is only shown visually. This helps blind users.
- **Never convey information through sound alone.** Pair alert sounds with something visible, and consider haptics:

```swift
Button("Pay", action: pay)
    .sensoryFeedback(.success, trigger: paymentSucceeded) // iOS 17+
```

- **Offer transcripts** for podcasts and audio-only content.

## Cognitive Accessibility

Cognitive disabilities affect memory, attention, reading, and problem solving, and they're the most common kind of disability. They are also the hardest to address with a single API, because most of the work is good design:

- **Use plain language.** Short sentences, familiar words, no jargon.
- **Be consistent.** Keep navigation and controls in the same place across screens, and call the same thing by the same name everywhere.
- **Write useful error messages.** Say what went wrong and how to fix it: "Password must be at least 8 characters", not "Invalid input".
- **Let people undo.** Confirm destructive actions, and offer undo where you can.
- **Reduce distractions.** Limit auto-playing content, pop-ups, and timers.
- **Don't rely on memory.** Show the information people need on the screen where they need it, instead of expecting them to remember it from a previous step.

iOS also offers **Guided Access**, which locks the device to one app, and **Assistive Access**, a simplified version of iOS with large buttons and a reduced set of apps. Clear, simple flows in your own app make both work better.

## Speech Accessibility

People with speech disabilities may not be able to use voice input, or may use an AAC (augmentative and alternative communication) app to speak for them. iOS also includes **Live Speech**, which speaks typed text aloud, and **Personal Voice**, which lets people at risk of losing their voice create a synthesized version of it.

For your app, the rule is simple: **never make voice the only way in.** Anything that can be done by speaking, like voice search or a voice assistant, should also be possible by typing or tapping.

## Types of Disabilities: A Summary

| Disability type | What to do |
|---|---|
| **Visual** (blindness, low vision, color blindness) | Label every element for VoiceOver, support Dynamic Type at all sizes, meet contrast ratios, never rely on color alone, and respect Increase Contrast, Bold Text, and Smart Invert. |
| **Hearing** | Caption videos, provide transcripts, pair sounds with visual cues and haptics. |
| **Motor** | Make targets at least 44×44 points, offer alternatives to complex gestures and time limits, and support Voice Control, Switch Control, and Full Keyboard Access. |
| **Vestibular** | Respect Reduce Motion, avoid parallax and large zooming transitions, never flash content. |
| **Cognitive** | Use plain language, consistent navigation, clear error messages, undo, and fewer distractions. |
| **Speech** | Never require voice input; always offer a typed or tapped alternative. |
| **Situational and temporary** (bright sun, noisy room, a broken arm, holding a baby) | The same features help everyone: captions, good contrast, larger text, one-handed reachability. |

## Testing Accessibility

You can't know whether your app is accessible without using it the way your users do. A good routine mixes manual testing, tools, and automation.

### Test with VoiceOver on a real device

1. Set up the **Accessibility Shortcut** under **Settings → Accessibility → Accessibility Shortcut** and choose VoiceOver. Now triple-clicking the side button (or Home button) turns VoiceOver on and off.
2. Learn the basic gestures: **tap** to select and hear an element, **swipe right/left** to move to the next/previous element, **double-tap** to activate, **two-finger swipe up** to read the whole screen, and **three-finger swipe** to scroll.
3. Go through your app's main flows using only those gestures. For the real experience, turn on **Screen Curtain** (a three-finger triple-tap with VoiceOver on), which turns the display off so you can't cheat by looking.

Ask yourself: Can I reach everything? Does every element make sense out of context? Do I know when something changes? Can I complete the task?

### Use Xcode's tools

- **Accessibility Inspector** (Xcode → Open Developer Tool → Accessibility Inspector) shows the label, value, traits, and other properties of any element in the simulator or on a connected device. Its **Audit** tab scans the current screen for common problems, and its color contrast calculator checks color pairs.
- **Environment Overrides**, in the debug bar while your app runs, let you switch text size, Increase Contrast, Reduce Motion, Bold Text, and other settings instantly, without leaving Xcode.
- **Xcode Previews** can show the same view at every Dynamic Type size at once, using the variants button in the preview canvas.

### Automate audits in UI tests

Since Xcode 15 (on iOS 17 and later), UI tests can run the same audit as the Accessibility Inspector:

```swift
import XCTest

final class AccessibilityAuditTests: XCTestCase {
    func testHomeScreenPassesAccessibilityAudit() throws {
        let app = XCUIApplication()
        app.launch()

        try app.performAccessibilityAudit()
    }

    func testSettingsPassesContrastAndDynamicTypeAudit() throws {
        let app = XCUIApplication()
        app.launch()
        app.buttons["Settings"].tap()

        try app.performAccessibilityAudit(for: [.contrast, .dynamicType]) { issue in
            // Return true to ignore a known issue, false to fail the test.
            issue.element?.identifier == "decorative-banner"
        }
    }
}
```

The audit checks things like missing labels, low contrast, clipped text at large sizes, small hit regions, and elements that VoiceOver can't reach. Run it on every important screen in CI, so regressions are caught before they ship. It can't tell you whether a label is *meaningful*, though, or whether a flow makes sense, so it complements manual testing rather than replacing it.

### Test with real people

The best feedback comes from people who use assistive technology every day. If you can, include users with disabilities in your usability testing, or work with accessibility testing services that employ them.

## Show Your Work: Accessibility Nutrition Labels

Since 2025, the App Store lets developers declare which accessibility features their apps support, in **Accessibility Nutrition Labels** on the product page. You fill them in in App Store Connect for features like VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion, Captions, and Audio Descriptions.

Only declare a feature if users can complete your app's common tasks with it. That's the bar Apple sets, and it's a useful checklist in its own right. The labels also give people with disabilities a way to find apps that will actually work for them, which makes accessibility a visible part of your product, not just a hidden quality.

## Accessibility Best Practices: A Checklist

Before shipping a screen, check that:

- [ ] Every interactive element has a short, meaningful, localized label, and icon-only buttons are labeled.
- [ ] Decorative images are hidden from VoiceOver; meaningful ones are described.
- [ ] Related content is grouped, so list rows are one swipe stop.
- [ ] Headings have the `.isHeader` trait.
- [ ] Custom controls expose their value, traits, and actions (adjustable, toggle, selected).
- [ ] Swipe, long-press, and drag actions are also available as buttons or custom actions.
- [ ] Focus moves to, or an announcement is posted for, important changes and errors.
- [ ] All text uses Dynamic Type and the layout works at AX5 without clipping or overlap.
- [ ] Text meets 4.5:1 contrast (3:1 for large text and important graphics) in both light and dark mode.
- [ ] Nothing is conveyed by color, sound, or motion alone.
- [ ] Reduce Motion is respected, and nothing flashes.
- [ ] Touch targets are at least 44×44 points.
- [ ] Videos have captions.
- [ ] The screen passes `performAccessibilityAudit()` and a manual VoiceOver run-through.

## Conclusion

Accessibility isn't a separate feature you bolt on at the end. It's a quality of how your app is built, like performance or security, and like those, it's far cheaper to get right from the start. Standard controls give you a head start, a few modifiers cover most of what remains, and Xcode's tools make it easy to check your work.

Start small: turn on VoiceOver and try your app's most important flow with your eyes closed. Then do the same at the largest text size. What you find will be your first to-do list, and fixing it will make your app better for everyone who uses it.

## Further Reading

- [Apple Accessibility for developers](https://developer.apple.com/accessibility/)
- [Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and the [WCAG2ICT guidance](https://www.w3.org/TR/wcag2ict-22/) for applying it to apps
- WWDC sessions: search the [Developer app or website](https://developer.apple.com/videos/) for "accessibility". Every year has several practical sessions, including ones on SwiftUI accessibility and automated audits.
