---
layout: post
title: "Swift Package Manager: A Practical Guide"
date: "2024-11-10"
last_modified_at: "2024-11-10"
permalink: /swift-package-manager/
excerpt_separator: <!--more-->
author: deyaeldeen
categories:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Swift"
  - "SPM"
  - "Tooling"
---

Swift Package Manager (SwiftPM) is the official tool for building, sharing, and depending on Swift code. It's built into the Swift toolchain and into Xcode, needs no extra installation, and has become the default way to add libraries to Apple-platform projects. It's also a great way to split your own app into modules.

<!--more-->

## Packages, products, and targets

- A **package** is a folder with a `Package.swift` manifest and source code.
- A **target** is a unit of code, a module: `Sources/MyLibrary/…` becomes the `MyLibrary` module. Test targets live in `Tests/`.
- A **product** is what the package offers to others: a library (one or more targets) or an executable.

## Creating a package

From the terminal:

```bash
mkdir Greeting && cd Greeting
swift package init --type library
swift build
swift test
```

Or in Xcode: **File → New → Package**. The result:

```text
Greeting/
├── Package.swift
├── Sources/
│   └── Greeting/
│       └── Greeting.swift
└── Tests/
    └── GreetingTests/
        └── GreetingTests.swift
```

## The manifest

`Package.swift` is written in Swift, using the `PackageDescription` API:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Greeting",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "Greeting", targets: ["Greeting"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-collections.git", from: "1.1.0"),
    ],
    targets: [
        .target(
            name: "Greeting",
            dependencies: [
                .product(name: "Collections", package: "swift-collections"),
            ]
        ),
        .testTarget(
            name: "GreetingTests",
            dependencies: ["Greeting"]
        ),
    ]
)
```

The first-line comment, `swift-tools-version`, is required. It sets the minimum SwiftPM version and the manifest API available, and with 6.0 and later, the default Swift language mode.

## Versions and resolution

SwiftPM follows **semantic versioning**: `MAJOR.MINOR.PATCH`. Common requirements:

| Requirement | Accepts |
|---|---|
| `from: "1.1.0"` | `1.1.0` up to, but not including, `2.0.0` (the usual choice) |
| `.upToNextMinor(from: "1.1.0")` | `1.1.x` only |
| `exact: "1.1.3"` | exactly that version (avoid in libraries) |
| `branch: "main"` / `revision: "…"` | a branch or commit (for development only) |

Resolved versions are recorded in `Package.resolved`. **Commit it for apps** so everyone builds the same versions; libraries usually don't commit it. `swift package update` (or **File → Packages → Update to Latest Package Versions**) moves to the newest allowed versions.

## Adding packages to an app

In Xcode: **File → Add Package Dependencies…**, paste the repository URL, pick a version rule, and choose which products to link to which targets. Xcode manages the dependency in the project file rather than a `Package.swift`.

## Resources

Targets can include files like images, JSON, and localized strings:

```swift
// .target(
//     name: "Greeting",
//     resources: [.process("Resources")]    // optimized, e.g. asset catalogs compiled
// )
```

Access them through the generated `Bundle.module`:

```swift
// let url = Bundle.module.url(forResource: "greetings", withExtension: "json")
```

`.process` lets SwiftPM optimize files for the platform; `.copy` keeps a folder structure exactly as is.

## Modularizing your own app

Packages aren't just for third-party code. Splitting an app into local packages, like `Networking`, `DesignSystem`, and `FeatureProfile`, brings real benefits:

- **Faster builds**, since unchanged modules aren't recompiled.
- **Clear boundaries**, because [access control](/swift-access-control/) enforces what each module exposes.
- **Fast tests** for each module, without launching the whole app.
- **SwiftUI previews** that build only the module you're working on.

Drag a local package folder into your Xcode project, then link its products to the app target.

## Binary targets and plugins

- **Binary targets** distribute closed-source XCFrameworks: `.binaryTarget(name:url:checksum:)`.
- **Build tool plugins** generate code during the build, like SwiftGen or protocol buffers.
- **Command plugins** add commands such as formatting: `swift package plugin <name>`.
- **Macros** are distributed as packages too; see [Macros in Swift](/swift-macros/).

## Useful commands

```bash
swift build -c release         # build optimized
swift test --parallel          # run tests in parallel
swift run MyTool               # build and run an executable product
swift package resolve          # resolve dependencies
swift package show-dependencies
```

## Summary

- A package has a `Package.swift` manifest, targets (modules), and products (what others can use).
- Dependencies use semantic versioning; commit `Package.resolved` for apps.
- Targets can bundle resources, accessed through `Bundle.module`.
- Local packages are a great way to modularize an app; plugins, binary targets, and macros extend SwiftPM further.
