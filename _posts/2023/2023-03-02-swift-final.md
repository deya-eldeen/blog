---
layout: post
hidden: true
title: "final in Swift: Closing Inheritance Deliberately"
date: "2023-03-02"
last_modified_at: "2023-03-02"
permalink: /swift-final/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Inheritance", "final"]
thumbnail: assets/img/article-placeholder.svg
---
A subclass can customize behavior its parent exposes, which means a subclassable class has a larger contract than its public method list suggests. Its author must also consider how inherited behavior interacts with overrides. `final` closes that extension path when subclassing is not part of the design.

<!--more-->

## Final classes and final members

```swift
final class RequestCounter {
    private(set) var count = 0

    func recordRequest() {
        count += 1
    }
}

class ImportJob {
    final func run() -> String {
        "Start; " + process() + "; finish"
    }

    func process() -> String {
        "Import data"
    }
}

final class PreviewImportJob: ImportJob {
    override func process() -> String {
        "Preview data"
    }
}

let job: ImportJob = PreviewImportJob()
assert(job.run() == "Start; Preview data; finish")
```

`RequestCounter` cannot have subclasses. `ImportJob` permits subclasses, but `run` cannot be overridden. The author intentionally leaves `process` as the customization point while protecting the surrounding sequence.

A final method can still call overridable behavior, as `run` does here. Marking the outer method final does not freeze every decision made inside it.

Swift also allows final properties and subscripts. The language guide documents the restrictions in [Preventing Overrides](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/inheritance/#Preventing-Overrides).

## Final does not mean immutable

```swift
let counter = RequestCounter()
counter.recordRequest()
counter.recordRequest()
assert(counter.count == 2)
```

The class is final and the reference is a constant, yet its state changes. `final` controls inheritance and overriding. It does not make properties immutable, add synchronization, or prove that the instance is safe to share across tasks.

If the type needs immutable state, use immutable properties and an appropriate representation. If it needs coordinated mutation, choose an isolation strategy. These are separate design decisions.

## Public and open describe a different boundary

A public class can be used outside its defining module, but subclassing it outside that module requires `open`. Similarly, an externally overridable member must be open rather than merely public. Within the module, a non-final public class may still be subclassed.

This means `final` can communicate a useful local restriction even when the class is not open. When publishing a library, choose deliberately whether clients may only call an API or may also extend its inheritance contract. See [Access Control](/swift-access-control/) for that distinction.

## Testing does not require inheritance

A final concrete class can conform to a protocol. Consumers can depend on that protocol and tests can supply another implementation. You do not have to keep a class subclassable solely so that tests can override a method.

On the other hand, do not add a protocol to every final class automatically. Pure calculations can be tested directly. Introduce substitution where a consumer actually needs control over a dependency or side effect.

## Treat optimization as a possible benefit

Knowing that a member cannot be overridden can help the compiler optimize calls. That is useful, but it is not a reason to promise a particular speedup. Optimization settings, visibility, and the call site still matter.

Use `final` to express the supported design first. If performance is the motivation, measure the workload before and after the change. A clear inheritance contract remains valuable even when the benchmark does not move.

## Closing inheritance reduces the promises you must maintain

A subclassable class has clients that call it and clients that extend it. A method rearrangement that is invisible to ordinary callers can still break a subclass that depends on which override is invoked first. That makes inheritance a public design surface even when no extra public methods are added.

Consider a cache that calls an overridable `didStore` hook after mutation. If a later refactor calls the hook before mutation, a subclass reading the cache during the hook sees different state. The base method's return value may be unchanged, yet the subclass contract has changed.

Making a class final removes that particular form of extension dependency. It does not remove normal API obligations to callers. You still need to preserve documented results, errors, side effects, and ownership.

## Keep a final implementation replaceable at the consumer boundary

Closing a concrete class to inheritance does not force consumers to depend on that concrete class. A narrow contract can express the operation a consumer actually needs.

```swift
protocol TextDelivering {
    func deliver(_ text: String) throws
}

final class RecordingDelivery: TextDelivering {
    private(set) var messages: [String] = []

    func deliver(_ text: String) throws {
        messages.append(text)
    }
}

struct AnnouncementService {
    let delivery: any TextDelivering

    func announce(_ text: String) throws {
        try delivery.deliver("Announcement: " + text)
    }
}

let deliveryRecorder = RecordingDelivery()
let announcementService = AnnouncementService(delivery: deliveryRecorder)
try announcementService.announce("Version 2")
assert(deliveryRecorder.messages == ["Announcement: Version 2"])
```

A production implementation can also be final. The consumer's variation point is the `TextDelivering` contract, so a test supplies a recorder rather than subclassing a concrete network client and overriding an incidental internal method.

The distinction matters: inheritance customization extends an implementation; protocol substitution replaces a dependency. If tests require replacing only the delivery effect, exposing every internal method to overriding would create a larger contract than those tests need.

## A final workflow can still permit unsafe behavior through hooks

The earlier `ImportJob.run` protects its outer sequence, but `process` is still overridable. An override could block indefinitely, mutate shared state, or reenter `run`. Finalizing the wrapper does not prove the entire operation is safe.

Design hook contracts with the same care as public methods. State whether hooks can throw, whether they may call back into the owner, and whether they may retain arguments. If the workflow cannot tolerate reentrancy, represent an in-progress state and define how repeated calls behave.

Alternatively, accept a pure transformation instead of an open-ended method when the domain permits it. A smaller variation contract makes more of the workflow's behavior locally understandable.

## Final and value semantics solve different problems

A final object can still be aliased by many owners. Each owner can observe its mutable state. Copying a reference to a final class still copies a reference, and `let` still protects the binding rather than every property of the object.

If the requirement is an independent edit buffer, a final class alone does not provide it. Use a value representation or an explicit copying policy. If the requirement is concurrent shared mutation, `final` does not provide isolation either. An actor, lock, or another appropriate synchronization design addresses that separate problem.

The same separation applies to `Sendable`: making a class final may be relevant to a conformance because subclasses cannot add unexpected state, but finality alone does not establish safe transfer. The stored properties and mutation strategy still matter.

## Understand the module boundary before choosing a modifier

| Declaration intent | Typical choice | What remains possible |
|---|---|---|
| Internal concrete helper with no subclass contract | `final class` | Direct use and protocol conformance |
| Public concrete API with no inheritance support | `public final class` | External callers use the public API |
| Public class extensible only within its module | Non-final `public class` | Internal subclasses; external use |
| Framework extension point for external subclasses | `open class` and eligible open members | Documented cross-module inheritance |

A class can expose some open members and close other members with `final`. That can preserve essential invariants while leaving intentional hooks. The important question is whether the combination matches a supported extension story rather than merely whichever modifiers make one subclass compile.

## Do not promise a benchmark result from a source modifier

A compiler can optimize a call when it proves the target implementation. Finality provides one form of evidence, but whole-module optimization and other analysis may already prove the same fact. Conversely, a final method can perform expensive work unrelated to dispatch.

Measure a representative workload with the build settings that matter to the application. Compare allocations, retained object graphs, I/O, and algorithmic work before attributing a large cost to a virtual call. Source-level simplicity and runtime speed are related only through the actual generated behavior.

## Exercise: review a class before removing final

Suppose a test asks to override a private networking detail. Before removing `final`, identify the consumer's real dependency. Could the network effect be injected through an existing client contract? Would a recorded response be enough to exercise the behavior?

If external inheritance really is required, write down which members are hooks, their ordering rules, and which invariants subclasses must preserve. Then test one representative subclass through the base interface. Removing one keyword is a small textual edit that can create a substantial new maintenance obligation.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
