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

## Case study: protect a workflow while allowing one calculation to vary

An export operation must validate its input, calculate the output, and record a successful completion. Product teams want different transformations, but they do not need permission to skip validation or report success before the transformation completes. A final coordinator with an injected calculation makes that boundary explicit.

The example also guards against a subtle problem: the injected closure can capture the coordinator and call it again while an export is already running. Closing inheritance does not prevent callbacks from reentering an object.

```swift
enum GuardedExportFailure: Error, Equatable {
    case emptyInput
    case alreadyRunning
}

final class GuardedExport {
    private let transform: (String) throws -> String
    private var running = false
    private(set) var completedOutputs: [String] = []

    init(transform: @escaping (String) throws -> String) {
        self.transform = transform
    }

    func run(_ input: String) throws -> String {
        guard !running else { throw GuardedExportFailure.alreadyRunning }
        guard !input.isEmpty else { throw GuardedExportFailure.emptyInput }

        running = true
        defer { running = false }
        let output = try transform(input)
        completedOutputs.append(output)
        return output
    }
}

let uppercaseExport = GuardedExport { $0.uppercased() }
let exportedHeading = try uppercaseExport.run("Release notes")
assert(exportedHeading == "RELEASE NOTES")
assert(uppercaseExport.completedOutputs == ["RELEASE NOTES"])

do {
    _ = try uppercaseExport.run("")
    assertionFailure("Empty input must be rejected")
} catch {
    assert(error as? GuardedExportFailure == .emptyInput)
}
assert(uppercaseExport.completedOutputs.count == 1)
```

The invariant lives in `run`: only a completed transformation is appended. The closure may throw, but it cannot access the private completion array. There is no subclass hook that can replace the workflow, and no setter that permits an outside caller to manufacture a successful completion.

This is still an intentionally synchronous object. The `running` flag handles nested calls on the same serialized execution path. It is not a lock and does not make simultaneous calls from different threads safe. An asynchronous version would need a deliberately isolated owner and explicit decisions about suspension and cancellation.

### Test hostile callbacks, not only friendly substitutions

A collaborator does not have to be malicious to reenter. A transformation can emit an event that triggers an observer, which starts another export. Exercise that path directly:

```swift
var reentrantExport: GuardedExport!
var rejectedNestedCall = false
reentrantExport = GuardedExport { input in
    do {
        _ = try reentrantExport.run("Nested")
    } catch GuardedExportFailure.alreadyRunning {
        rejectedNestedCall = true
    }
    return input + "!"
}
let outerOutput = try reentrantExport.run("Outer")
assert(outerOutput == "Outer!")
assert(rejectedNestedCall)
assert(reentrantExport.completedOutputs == ["Outer!"])
reentrantExport = nil
```

The outer operation succeeds because the transformation handles the rejected nested call. The stored closure refers to a variable that is cleared after the test, releasing the object. A production callback should have an equally deliberate ownership policy rather than creating an owner–closure retention cycle accidentally.

Next verify that failure releases the in-progress state. Otherwise, one error would leave the object permanently unusable.

```swift
enum TransformAttemptFailure: Error { case unavailable }
var transformAttempts = 0
let recoveringExport = GuardedExport { input in
    transformAttempts += 1
    if transformAttempts == 1 { throw TransformAttemptFailure.unavailable }
    return input
}
do {
    _ = try recoveringExport.run("First")
    assertionFailure("The first transformation should fail")
} catch TransformAttemptFailure.unavailable {}
assert(recoveringExport.completedOutputs.isEmpty)
let recoveredOutput = try recoveringExport.run("Second")
assert(recoveredOutput == "Second")
assert(recoveringExport.completedOutputs == ["Second"])
```

`defer` restores the flag on both success and error. It does not undo external effects performed by the transformation. If a closure writes a file and then throws, the coordinator cannot infer how to roll that write back. For this contract, prefer a calculation that returns data, with persistence owned by a separately defined stage.

### Compare the actual extension contracts

| Design | Supported variation | Author's continuing obligation |
|---|---|---|
| Open workflow method | Entire sequence | Document and tolerate replacement behavior |
| Final workflow with overridable hook | Hook behavior plus its interaction with the base | Preserve hook ordering and inherited state assumptions |
| Final object with a closure | One declared calculation | Define inputs, errors, ownership, and reentrancy |

The third option does not remove every obligation. It concentrates them in a smaller interface. A closure can be entirely sufficient for a single transformation; a protocol becomes useful when the collaborator needs several related operations, named semantic requirements, or its own lifecycle.

### Removing final is an API change

If a later requirement genuinely needs inheritance, describe the supported subclass first. Which behavior must vary? Which methods must it call through `super`? Can overrides fail, call back, or retain arguments? A runnable example subclass should demonstrate the intended contract.

That exercise often reveals that the requirement is dependency substitution or configuration instead. When inheritance is appropriate, opening it deliberately is defensible. The mistake is allowing arbitrary overrides to become an accidental extension mechanism for a workflow whose correctness depends on controlling its sequence.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
