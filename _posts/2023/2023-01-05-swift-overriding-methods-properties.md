---
layout: post
hidden: true
title: "Overriding Methods and Properties in Swift"
date: "2023-01-05"
last_modified_at: "2023-01-05"
permalink: /swift-overriding-methods-properties/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Inheritance", "Overriding"]
thumbnail: assets/img/article-placeholder.svg
---
An override customizes behavior that a superclass already promises. It is useful when the subclass remains a valid replacement for the parent, but needs a different implementation of one operation. The `override` keyword also asks the compiler to check that the parent actually has the member you intend to customize.

<!--more-->

## Override a method

```swift
class Document {
    var title: String

    init(title: String) {
        self.title = title
    }

    func summary() -> String {
        title
    }

    var displayTitle: String {
        title
    }
}

final class ReviewedDocument: Document {
    var reviewer = "Unassigned"

    override func summary() -> String {
        super.summary() + " — reviewer: " + reviewer
    }

    override var displayTitle: String {
        "Reviewed: " + title
    }
}

let document = ReviewedDocument(title: "Release plan")
document.reviewer = "Maya"
let baseReference: Document = document
assert(baseReference.summary() == "Release plan — reviewer: Maya")
assert(baseReference.displayTitle == "Reviewed: Release plan")
```

The inherited interface is still usable through a `Document` reference. The subclass calls `super.summary()` because it wants to extend that particular implementation. An override can instead replace a method completely; calling `super` is not a universal requirement for arbitrary Swift methods.

Framework APIs may impose an additional contract. For lifecycle methods, check the framework documentation to see whether and when the superclass implementation must run.

## Computed properties and observers

A subclass can override an inherited property with a computed implementation, subject to access and mutability rules. A read-only property can become read-write, but an inherited read-write property cannot become read-only. Callers using the superclass must retain the operations its interface provides.

You cannot override a stored property by introducing another stored property with the same name. You can add observers to eligible inherited mutable properties:

```swift
final class LoggedDocument: Document {
    private(set) var renameCount = 0

    override var title: String {
        didSet {
            renameCount += 1
        }
    }
}

let logged = LoggedDocument(title: "Draft")
logged.title = "Published"
assert(logged.renameCount == 1)
```

Do not combine a custom setter and property observers in the same overriding declaration. Put the observation logic in the setter when implementing a computed read-write override. Immutable stored properties cannot acquire mutation observers through a subclass.

The language guide covers these constraints in [Inheritance](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/inheritance/).

## Preserve the parent's behavioral contract

The compiler catches a misspelled signature. It cannot prove that a subclass returns meaningful results, preserves required side effects, or accepts every input the parent allows.

If `Document.summary()` is documented as a quick, side-effect-free operation, a subclass should not quietly turn it into a blocking network request. The signature would compile while the behavior violates callers' expectations.

Write tests through the parent interface when reviewing substitutability. That is how real consumers encounter the override, and it reveals assumptions that a test written only against the subclass might miss.

## Overriding is different from overloading

An override specializes an inherited operation. An overload introduces another operation with the same base name but a different signature. Adding `summary(limit:)` does not replace `summary()`.

Also remember that an extension-only protocol method is not a superclass-style customization point. If conforming types must supply varying behavior, make the operation a protocol requirement. For unrelated implementations without shared state, [protocol polymorphism](/swift-polymorphism/) can offer a smaller design than another inheritance layer.

## Put a contract around an override point

A base class that offers an overridable method is offering an extension API. Specify what subclasses may assume, what they must preserve, and which surrounding behavior they must not bypass.

```swift
class TextImportPipeline {
    private(set) var completedImports = 0

    final func run(_ input: String) -> String {
        let normalized = normalize(input)
        completedImports += 1
        return normalized
    }

    func normalize(_ input: String) -> String {
        input
    }
}

final class UppercaseImportPipeline: TextImportPipeline {
    override func normalize(_ input: String) -> String {
        input.uppercased()
    }
}

let importPipeline: TextImportPipeline = UppercaseImportPipeline()
assert(importPipeline.run("Swift") == "SWIFT")
assert(importPipeline.completedImports == 1)
```

The workflow is final, while normalization is a narrow hook. A subclass cannot accidentally remove import accounting by replacing `run`. The design still needs a semantic rule for `normalize`: for example, whether it may change length, perform I/O, or fail. The signature cannot express all those expectations.

This pattern is useful when the base class genuinely owns the workflow. If normalization is the only variation and there is no meaningful shared lifecycle, an injected function or policy object may be simpler than inheritance. Protecting a workflow with `final` does not by itself justify a hierarchy.

## Overriding a property preserves the original operation set

A superclass property is an API consisting of at least a getter, and possibly a setter. A subclass can specialize the implementation but must keep the capabilities promised by the parent.

```swift
class BoundedLevel {
    private var storedLevel = 0

    var level: Int {
        get { storedLevel }
        set { storedLevel = min(100, max(0, newValue)) }
    }
}

final class AuditedLevel: BoundedLevel {
    private(set) var requestedValues: [Int] = []

    override var level: Int {
        get { super.level }
        set {
            requestedValues.append(newValue)
            super.level = newValue
        }
    }
}

let auditedLevel = AuditedLevel()
auditedLevel.level = 150
assert(auditedLevel.level == 100)
assert(auditedLevel.requestedValues == [150])
```

The override records the requested input and delegates storage policy to the parent setter. It observes 150 as a request even though the stored value becomes 100. That difference matters for logs, validation messages, and tests.

An observer-based override would observe the property's change under the language's observer semantics; it is not necessarily the same policy as recording the raw setter argument. Choose a custom setter when you need to control exactly which stage is observed.

Avoid recursively assigning the same property from its own computed setter. To reuse the inherited setter, qualify the access with `super`, as above. If you choose to replace the setter entirely, you also take responsibility for any parent invariant it enforced.

## A super call is part of the algorithm

“Always call super first” is not a universal rule. A subclass may need to validate input before delegating, extend a result afterward, or replace a hook entirely. Framework lifecycle methods can impose their own documented requirements, which take precedence over a generic pattern.

When a parent method creates a resource and a subclass needs to customize that resource, ordering is obvious: creation must precede customization. When a parent method releases resources and a subclass needs to finish using them, the required order may be reversed.

Document such requirements for any subclass API you own. Better still, centralize the mandatory sequence in a final method and expose narrower hooks when that makes the contract easier to enforce.

## Calls through different references should remain substitutable

Use the subclass through a superclass variable in tests. Then exercise empty input, repeated calls, and values near the parent's documented boundaries. A subclass that accepts a narrower set of inputs or unexpectedly changes side effects may violate the base contract despite compiling correctly.

For `BoundedLevel`, callers expect any integer assignment to produce a value in `0...100`. A subclass that throws a runtime trap for 150 would strengthen the precondition. A subclass that stores 150 unchanged would weaken the postcondition. Both are behavioral changes beyond simply “customizing the property.”

Return values also matter. Swift permits certain covariant override result types, but a more specific static type does not guarantee a correct result. The semantic promise remains the thing consumers rely on.

## Know which declarations are actual override points

Only eligible inherited class members participate in superclass overriding. A same-named free function, an overload with different labels, or an extension-only protocol helper is a different operation.

Ordinary Swift class extensions are not a general place to add overridable superclass members. Objective-C interoperability introduces additional dispatch behavior, so do not generalize a result from an `@objc` experiment to every Swift method. Declare intended hooks explicitly in the class when designing an inheritance API.

Access control also limits overriding across module boundaries. `public` allows use outside a module; externally supported subclass overriding requires `open` where applicable. These language rules are documented in [Access Control](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/).

## Refactoring exercise: remove an accidental obligation

Suppose every subclass must override `run`, remember to call `super.run`, and then call `recordCompletion`. Refactor the mandatory accounting into a final workflow and leave a single `process` hook. Explain whether the hook runs before or after accounting and what happens if processing fails.

That last question often exposes the real design issue. A hierarchy can compile while disagreeing about whether a failed operation counts as completed. Resolve that behavioral contract before polishing override syntax.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
