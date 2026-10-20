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
  - "SwiftPM"
  - "Tooling"
---

Swift Package Manager (SwiftPM) is the official tool for building, sharing, and depending on Swift code. It's part of the Swift toolchain and built into Xcode, needs no extra installation, and has become the default way to add libraries to Apple-platform projects. It's also the best tool for splitting your own app into modules. This guide goes past "paste a URL into Xcode": we'll build a real multi-target package with resources, a local dependency, a code-generating build plugin, and Swift Testing tests, then look at how version resolution works, how to modularize an app, and the mistakes that cause most SwiftPM headaches.

<!--more-->

## Packages, targets, and products

Three words, often confused:

- A **package** is a folder with a `Package.swift` manifest and source code. It's the unit of **versioning and distribution**: one Git repository, one set of version tags.
- A **target** is a unit of **compilation**: one module. `Sources/GreetingCore/` becomes the `GreetingCore` module, which other code `import`s. Test targets live in `Tests/`.
- A **product** is what the package **offers to others**: a library (made of one or more targets) or an executable. Targets that aren't part of any product are internal to the package.

Clients depend on **packages** and link **products**; inside a package, targets depend on each other directly.

## Creating a package

From the terminal:

```bash
mkdir Greeting && cd Greeting
swift package init --type library     # also: executable, tool, macro, build-tool-plugin…
swift build
swift test
```

Or in Xcode: **File → New → Package**. Opening the folder (or `Package.swift`) in Xcode works too: there's no project file to maintain, because the manifest **is** the project.

## A real package, end to end

Here's the layout of the package we'll build. It has a core module with a JSON resource, a public library that depends on another package, a command-line tool, a build plugin that generates source code, and tests:

```text
Greeting/
├── Package.swift
├── Sources/
│   ├── GreetingCore/
│   │   ├── Greetings.swift
│   │   └── Resources/greetings.json
│   ├── Greeting/Greeting.swift
│   ├── greet/main.swift
│   └── VersionGen/main.swift
├── Plugins/
│   └── VersionPlugin/VersionPlugin.swift
└── Tests/
    └── GreetingCoreTests/GreetingTableTests.swift
```

### The manifest

`Package.swift` is ordinary Swift code that uses the `PackageDescription` API:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Greeting",
    defaultLocalization: "en",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "Greeting", targets: ["Greeting"]),
        .executable(name: "greet", targets: ["greet"]),
    ],
    dependencies: [
        .package(path: "../Formatting"),
        // A remote dependency looks like this:
        // .package(url: "https://github.com/apple/swift-collections.git", from: "1.1.0"),
    ],
    targets: [
        .target(
            name: "GreetingCore",
            resources: [.process("Resources")],
            plugins: [.plugin(name: "VersionPlugin")]
        ),
        .target(
            name: "Greeting",
            dependencies: [
                "GreetingCore",
                .product(name: "Formatting", package: "Formatting"),
            ]
        ),
        .executableTarget(name: "greet", dependencies: ["Greeting"]),
        .executableTarget(name: "VersionGen"),
        .plugin(name: "VersionPlugin", capability: .buildTool(), dependencies: ["VersionGen"]),
        .testTarget(name: "GreetingCoreTests", dependencies: ["GreetingCore"]),
    ]
)
```

A few things worth knowing about this file:

- **The first line isn't a normal comment.** `// swift-tools-version: 6.0` is required, and it selects the manifest API you can use and the minimum SwiftPM version that can build the package. With 6.0 and later, it also makes **Swift 6 language mode** the default for every target.
- **`platforms`** sets **minimum** deployment targets. Without it, SwiftPM assumes very old OS versions, and APIs like `Task` or `Bundle.module` features will fail to compile with "only available in macOS 10.15 or newer" errors.
- **Only the `Greeting` library is a product.** `GreetingCore` is an internal building block that clients can't link directly.
- **Remote dependencies are referenced by URL**, local ones by path. A local path dependency is ideal while developing two packages side by side.

### Resources and `Bundle.module`

Code can't assume where resource files end up: inside an app bundle, a test bundle, or next to a command-line tool. SwiftPM solves that by generating a `Bundle.module` accessor for any target with resources:

```swift
// Sources/GreetingCore/Greetings.swift
import Foundation

package struct GreetingTable: Sendable {
    package let entries: [String: String]

    package init() throws {
        let url = Bundle.module.url(forResource: "greetings", withExtension: "json")!
        entries = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
    }

    package func word(for language: String) -> String {
        entries[language] ?? entries["en", default: "Hi"]
    }
}
```

`.process("Resources")` lets SwiftPM optimize files for the platform: asset catalogs are compiled, storyboards built, and `.lproj` folders treated as localizations (which is why `defaultLocalization` is set). `.copy("Resources")` keeps a folder **exactly** as it is, including its structure, which is what you want for something like a bundled website or a folder of fixtures.

Notice the **`package`** access level (Swift 5.9). `GreetingTable` is visible to every target **in this package**, `Greeting` included, but invisible to clients. Before `package` existed, the only options were `public`, which leaks implementation details to everyone, or `@_spi` and other workarounds. See [Access Control in Swift](/swift-access-control/) for the full picture.

### The library and the tool

```swift
// Sources/Greeting/Greeting.swift
import Formatting
import GreetingCore

public func greet(_ name: String, language: String = "en", loud: Bool = false) throws -> String {
    let text = "\(try GreetingTable().word(for: language)), \(name)"
    return loud ? shout(text) : text
}

public let greetingLibraryVersion = GreetingCore.libraryVersion
```

```swift
// Sources/greet/main.swift
import Greeting

print(try greet("Sam"))
print(try greet("Sam", language: "fr", loud: true))
print("built with Greeting \(greetingLibraryVersion)")
```

`shout(_:)` comes from the `Formatting` package. `libraryVersion` doesn't appear in any source file you've seen so far: the build plugin generates it.

### A build tool plugin

**Build tool plugins** run during every build, and generate source files or resources that get compiled into the target, which is how tools like SwiftGen and protocol buffer generators integrate. A plugin is a small Swift program that tells SwiftPM **which commands to run**; the actual work is done by an executable target, here `VersionGen`:

```swift
// Sources/VersionGen/main.swift
import Foundation

let output = CommandLine.arguments[1]
let source = "package let libraryVersion = \"1.4.0\"\n"
try source.write(toFile: output, atomically: true, encoding: .utf8)
```

```swift
// Plugins/VersionPlugin/VersionPlugin.swift
import PackagePlugin

@main
struct VersionPlugin: BuildToolPlugin {
    func createBuildCommands(context: PluginContext, target: Target) throws -> [Command] {
        let output = context.pluginWorkDirectoryURL.appending(path: "Version.swift")
        return [
            .buildCommand(
                displayName: "Generating Version.swift",
                executable: try context.tool(named: "VersionGen").url,
                arguments: [output.path()],
                outputFiles: [output]
            ),
        ]
    }
}
```

Because the command declares its **output files**, SwiftPM compiles the generated `Version.swift` into `GreetingCore`, and only reruns the generator when needed. Plugins run in a **sandbox** with no network access and write access only to their work directory, so a dependency's plugin can't quietly modify your source tree. Xcode also asks you to trust a package's plugins (and macros) the first time you use them.

The other kind, **command plugins**, run on demand, for tasks like formatting or generating documentation: `swift package plugin <name>`, or right-clicking the package in Xcode. These may ask for permission to write to the package directory.

### Tests with Swift Testing

Since Swift 6, the toolchain includes **Swift Testing**, with `@Test` functions, `#expect`, and parameterized tests:

```swift
// Tests/GreetingCoreTests/GreetingTableTests.swift
import Testing
@testable import GreetingCore

@Test func fallsBackToEnglish() throws {
    let table = try GreetingTable()
    #expect(table.word(for: "de") == "Hello")
}

@Test(arguments: ["en", "fr"])
func knownLanguages(language: String) throws {
    #expect(try GreetingTable().entries[language] != nil)
}
```

XCTest still works side by side, and `swift test` runs both.

### Building, running, and testing

```text
$ swift run greet
Hello, Sam
BONJOUR, SAM!
built with Greeting 1.4.0

$ swift test
✔ Test fallsBackToEnglish() passed after 0.005 seconds.
✔ Test knownLanguages(language:) with 2 test cases passed after 0.005 seconds.
✔ Test run with 2 tests in 0 suites passed after 0.005 seconds.
```

The JSON resource was found through `Bundle.module`, `shout` came from the other package, and the version string came from code that only exists in the build directory.

## Versions and resolution

SwiftPM uses **semantic versioning**: `MAJOR.MINOR.PATCH`, read from the Git tags of each dependency. Bump MAJOR for breaking changes, MINOR for new features, PATCH for fixes. The requirement you write decides which versions are acceptable:

| Requirement | Accepts |
|---|---|
| `from: "1.1.0"` | `1.1.0` up to, but not including, `2.0.0` (the usual choice) |
| `.upToNextMinor(from: "1.1.0")` | `1.1.x` only |
| `exact: "1.1.3"` | exactly that version (avoid in libraries) |
| `"1.1.0"..<"1.5.0"` | an explicit range |
| `branch: "main"` / `revision: "…"` | a branch or commit (for development only) |

SwiftPM resolves the **whole graph** at once, finding one version of each package that satisfies every requirement, from your manifest and from your dependencies' manifests. There's only **one version of each package** in a build; if two dependencies need incompatible ranges of the same package, resolution fails, and the error lists the conflicting requirements. That's the strongest argument for libraries using broad ranges like `from:`, and never `exact:`.

The result is written to **`Package.resolved`**:

- **Commit it for apps** (and for Xcode projects, where it lives inside the `.xcodeproj` or `.xcworkspace`), so every developer and CI machine builds exactly the same versions.
- Libraries usually don't commit it: their clients resolve their own graph anyway.
- `swift package update` (or **File → Packages → Update to Latest Package Versions**) moves to the newest allowed versions; `swift package resolve` installs exactly what `Package.resolved` says.

Branch and revision dependencies are fine during development, but a package that depends on a branch can't be depended on by version. Tag a release first.

## Adding packages to an app

In Xcode: **File → Add Package Dependencies…**, paste the repository URL, pick a version rule, and choose which products to link to which targets. Xcode stores the dependency in the project file rather than in a `Package.swift`.

From the command line (Swift 6), `swift package add-dependency <url> --from 1.1.0` edits a manifest for you, and `add-target` and `add-product` exist for the other common edits.

## Modularizing your own app

Packages aren't just for third-party code. Splitting an app into **local packages**, like `Networking`, `DesignSystem`, `FeatureProfile`, and a thin app target that wires them together, brings real benefits:

- **Faster incremental builds**: an unchanged module isn't recompiled, and modules that don't depend on each other build in parallel.
- **Enforced boundaries**: a feature module can only use what another module declares `public`, so accidental coupling becomes a compile error instead of a code review comment.
- **Fast tests**: each module's tests run on its own, often without launching the app or a simulator.
- **Faster SwiftUI previews**, which build only the module you're working on.

A common structure is one package with many targets, kept in the app's repository:

```swift
// swift-tools-version: 6.0
// AppModules/Package.swift
import PackageDescription

let package = Package(
    name: "AppModules",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "FeatureProfile", targets: ["FeatureProfile"]),
        .library(name: "FeatureSettings", targets: ["FeatureSettings"]),
    ],
    targets: [
        .target(name: "Networking"),
        .target(name: "DesignSystem"),
        .target(name: "FeatureProfile", dependencies: ["Networking", "DesignSystem"]),
        .target(name: "FeatureSettings", dependencies: ["DesignSystem"]),
        .testTarget(name: "FeatureProfileTests", dependencies: ["FeatureProfile"]),
    ]
)
```

Drag the folder into your Xcode project, then link the feature products to the app target. Keep dependencies pointing **one way**, features depend on infrastructure, never the reverse and never feature-to-feature, and SwiftPM will reject cycles for you.

## Swift settings per target

Targets can opt into compiler features and language modes individually, which is exactly what a gradual Swift 6 migration needs:

```swift
// .target(
//     name: "LegacyNetworking",
//     swiftSettings: [
//         .swiftLanguageMode(.v5),                          // stay in Swift 5 mode for now
//         .enableUpcomingFeature("StrictConcurrency"),       // but get concurrency warnings
//     ]
// ),
// .target(
//     name: "CppBridge",
//     swiftSettings: [.interoperabilityMode(.Cxx)]          // see the interop article
// ),
```

`.define("FEATURE_X")` adds a compilation condition for `#if FEATURE_X`, and `condition: .when(platforms: [.iOS])` limits a setting or a dependency to some platforms. **Avoid `unsafeFlags`**: a package that uses them can't be used as a versioned dependency by others. See [Swift Interoperability](/swift-interoperability/) for `.interoperabilityMode(.Cxx)`.

## Binary targets and macros

- **Binary targets** distribute closed-source code as an XCFramework: `.binaryTarget(name: "Analytics", url: "https://…/Analytics.xcframework.zip", checksum: "…")`. Compute the checksum with `swift package compute-checksum`; SwiftPM refuses a download that doesn't match it.
- **Macros** are distributed as packages, with a `.macro` target holding the compiler plugin; see [Macros in Swift](/swift-macros/). Because they depend on SwiftSyntax, they noticeably increase clean build times.

## Useful commands

```bash
swift build -c release              # optimized build
swift test --parallel               # run tests in parallel
swift test --filter GreetingCoreTests
swift run greet                     # build and run an executable product
swift package resolve               # install exactly what Package.resolved says
swift package update                # move to the newest allowed versions
swift package show-dependencies     # print the resolved dependency tree
swift package describe              # print targets, products, and their sources
swift package clean                 # remove build artifacts
swift package reset                 # also remove the dependency cache
```

When resolution gets stuck in Xcode, **File → Packages → Reset Package Caches** is the equivalent of `reset`, and deleting `DerivedData` is the last resort.

## Common pitfalls

- **Missing `platforms`**, so availability errors appear for APIs your app clearly supports.
- **Loading resources with `Bundle.main`** inside a package; use `Bundle.module`.
- **Overly strict requirements** (`exact:`) in libraries, which cause resolution conflicts for everyone downstream.
- **Not committing `Package.resolved`** in an app, so CI and teammates silently build different versions.
- **Making everything `public`** to share code between targets; use `package` instead.
- **A single giant module**, which throws away most of the build-time and boundary benefits.

## Interview questions

**What's the difference between a target and a product?**
A target is a module that gets compiled; a product is what a package exposes to clients, made of one or more targets. Clients can only use products.

**What does `swift-tools-version` control?**
The manifest API available, the minimum SwiftPM version that can build the package, and, from 6.0, the default Swift language mode.

**Should `Package.resolved` be committed?**
For apps, yes, to get reproducible builds. Libraries usually don't, since their clients resolve the whole graph themselves.

**What happens if two dependencies need incompatible versions of the same package?**
Resolution fails: a build contains exactly one version of each package. That's why libraries should use broad version ranges.

**How do you share code between modules of one package without making it `public`?**
Use the `package` access level.

## Summary

- A package is versioned and distributed as a unit; targets are modules; products are what clients can use.
- The manifest is Swift code; `swift-tools-version` and `platforms` matter more than they look.
- Resources go through `Bundle.module`; `package` access shares code between targets without leaking it.
- Build tool plugins generate code during the build, in a sandbox; Swift Testing comes with the toolchain.
- One version of each package per build: use broad version ranges in libraries, and commit `Package.resolved` for apps.
- Local packages are the most practical way to modularize an app, with per-target settings for gradual Swift 6 migration.
