---
layout: post
hidden: true
title: "Designated and Convenience Initializers in Swift"
date: "2022-12-01"
last_modified_at: "2022-12-01"
permalink: /swift-designated-convenience-initializers/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Initialization", "Inheritance"]
thumbnail: assets/img/article-placeholder.svg
---
A class can offer several ways to create an instance without having several independent implementations of its setup rules. Designated initializers establish the class's stored state. Convenience initializers provide alternate entry points that delegate to that setup.

The distinction becomes especially useful when a subclass adds state of its own.

<!--more-->

## Build one primary path

```swift
class Endpoint {
    let host: String
    let port: Int

    init(host: String, port: Int) {
        precondition(!host.isEmpty)
        precondition((1...65535).contains(port))
        self.host = host
        self.port = port
    }

    convenience init(host: String) {
        self.init(host: host, port: 443)
    }
}

let secureDefault = Endpoint(host: "example.com")
assert(secureDefault.port == 443)
```

The convenience initializer chooses a default rather than copying validation and assignment. If the valid port range changes, there is one setup path to review.

A designated initializer delegates upward to a superclass designated initializer when the class has a superclass. A convenience initializer delegates across to another initializer on the same class, eventually reaching a designated initializer. Those class delegation rules are documented in [Initialization](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/initialization/).

## Add subclass state in the right order

```swift
final class AuthenticatedEndpoint: Endpoint {
    let credentialName: String

    init(host: String, port: Int, credentialName: String) {
        self.credentialName = credentialName
        super.init(host: host, port: port)
    }

    convenience init(host: String, credentialName: String) {
        self.init(host: host, port: 443, credentialName: credentialName)
    }
}

let endpoint = AuthenticatedEndpoint(
    host: "api.example.com",
    credentialName: "production"
)
assert(endpoint.host == "api.example.com")
assert(endpoint.credentialName == "production")
```

The subclass initializes the property it introduces before delegating upward. The superclass establishes its own properties. Once the first initialization phase is complete, the initializer can perform permitted customization using the initialized instance.

This order prevents the superclass setup from receiving a subclass whose introduced storage has no value. It also explains why using `self` for arbitrary method calls before `super.init` is not allowed.

## Do not assume every initializer is inherited

Subclass initializer inheritance is conditional. In the common case where all introduced stored properties have defaults, a subclass that defines no designated initializers inherits its superclass designated initializers. If it provides implementations of all the superclass designated initializers, including inherited implementations, it also inherits the superclass convenience initializers.

Our `AuthenticatedEndpoint` introduces a required credential with no default. Inheriting `Endpoint(host:)` would not provide that credential, so expecting it to appear automatically would be a design mistake.

When overriding a superclass designated initializer, use `override`, even if the subclass implementation is itself a convenience initializer. Matching a superclass convenience initializer is a different case; it is not overridden in the same way.

## Keep alternate entry points honest

A convenience initializer should make a meaningful construction easier. It can supply defaults, unpack a configuration value, or adapt an older API. If a default hides a required decision, prefer an explicit argument.

A named factory can be clearer when the operation has a distinct purpose, needs caching, or may return an existing instance. The `convenience` keyword does not mean that every possible way to obtain an object belongs in its initializer list.

When debugging a construction problem, trace the delegation path: alternate entry point, designated setup for the current class, then designated setup for the superclass. Every route should finish with the same invariants established.

## Trace the two initialization phases

Swift class initialization separates establishing storage from later customization. In the first phase, each class initializes the stored properties it introduces, then delegates to a superclass designated initializer. After the chain establishes a valid instance, the second phase can customize inherited state and use instance behavior where permitted.

For the endpoint example, the path is:

```text
AuthenticatedEndpoint convenience initializer
    → AuthenticatedEndpoint designated initializer
        → initialize credentialName
        → Endpoint designated initializer
            → initialize host and port
        ← superclass initialization complete
    ← instance construction complete
```

Before delegation, the subclass owns the task of initializing its newly introduced properties. It cannot treat `self` as a fully available object or modify inherited storage as though the superclass were finished. A convenience initializer has a different obligation: delegate to another initializer on the same class before assigning properties or using the initialized instance.

These restrictions prevent one initializer from depending on storage that another initializer has not yet established. They are compiler-enforced rules, rather than stylistic advice to put `super.init` near the top.

## Verify automatic inheritance with concrete subclasses

Initializer inheritance is easier to understand when you compare two cases that differ in one meaningful way.

```swift
final class BrandedEndpoint: Endpoint {
    var label = "Default brand"
}

let inheritedDesignated = BrandedEndpoint(host: "example.com", port: 8443)
let inheritedConvenience = BrandedEndpoint(host: "example.com")
assert(inheritedDesignated.label == "Default brand")
assert(inheritedConvenience.port == 443)

final class AuditedEndpoint: Endpoint {
    let source: String

    override init(host: String, port: Int) {
        source = "application"
        super.init(host: host, port: port)
    }
}

let auditedDefault = AuditedEndpoint(host: "example.com")
assert(auditedDefault.source == "application")
assert(auditedDefault.port == 443)
```

`BrandedEndpoint` adds only a property with a default and declares no designated initializer. It can inherit the superclass's designated construction paths and, under the inheritance rules, its convenience initializer.

`AuditedEndpoint` supplies an implementation of the parent's designated initializer. That implementation establishes its new required storage. Because it covers all of `Endpoint`'s designated initializers, it can inherit the convenience initializer as well. That convenience entry point delegates through the subclass's designated implementation; it does not bypass the subclass's `source` assignment.

By contrast, the earlier `AuthenticatedEndpoint` has a designated initializer with an additional credential argument. It does not supply every superclass designated construction path, so you should not expect the parent's credential-free convenience initializer to appear.

## Required initializers support construction through a type

A factory receiving a subclass metatype cannot safely call an arbitrary initializer that subclasses are allowed to omit. `required` establishes a construction contract across the hierarchy.

```swift
class ProcessingJob {
    let name: String

    required init(name: String) {
        self.name = name
    }
}

final class RetryingProcessingJob: ProcessingJob {
    var retryLimit = 3
}

func makeJob<J: ProcessingJob>(_ type: J.Type, name: String) -> J {
    type.init(name: name)
}

let processingJob = makeJob(RetryingProcessingJob.self, name: "Import")
assert(processingJob.name == "Import")
assert(processingJob.retryLimit == 3)
```

The subclass inherits the required initializer in this case. A subclass that supplies a needed implementation marks it `required`; the required modifier communicates the ongoing obligation down a non-final hierarchy. You do not additionally write `override` when implementing a required designated initializer.

A protocol initializer requirement introduces a similar concern for non-final conforming classes: subclasses must remain constructible through the protocol's requirement. A final class has no further subclasses to protect. See [Initializer Requirements](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/#Initializer-Requirements) for the conformance rules.

## Do not confuse convenience with optional or cheap

`convenience` describes a delegation role. It does not mean the initializer cannot throw, cannot fail, or must do only trivial work. A convenience initializer can parse configuration or validate input before delegating, subject to initialization rules.

Nevertheless, keep its semantic role small enough to understand. If several convenience initializers each perform subtly different normalization before reaching the primary initializer, valid state may depend on which entry point the caller chose. Put essential invariants in the designated path, and let alternate paths adapt input into that common contract.

A named factory can be more honest for operations that read disk, consult a cache, or return an already existing object. Construction syntax usually suggests obtaining a newly initialized instance; a factory name can communicate additional policy.

## Design public initializer families for evolution

Every public initializer is an API entry point you may need to maintain. Default arguments are source-level conveniences, not a guarantee that all older compiled consumers will magically use new defaults in every distribution model.

More broadly, adding another designated initializer can affect the assumptions behind a subclass's inherited convenience initializers. Library authors should review subclass construction as part of API evolution, especially when the class is open to external inheritance.

A smaller set of clear construction paths is easier to keep consistent than many combinations of optional arguments. If configuration has several meaningful fields, a configuration value can make the contract visible without a long initializer overload family.

## Review exercise: draw every valid route

Add a required `region` to `AuthenticatedEndpoint`, with no default. List every initializer the subclass should expose, then trace how each supplies host, port, credential, and region. Any route that cannot answer one of those questions should not exist.

Finally, test the shortest convenience call and the fully specified call. They should agree on invariants even when their defaults differ. This catches a common mistake: validating one entry point thoroughly while allowing a supposedly convenient path to skip a rule.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
