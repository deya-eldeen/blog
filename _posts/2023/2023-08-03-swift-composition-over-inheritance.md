---
layout: post
hidden: true
title: "Composition Over Inheritance in Swift"
date: "2023-08-03"
last_modified_at: "2023-08-03"
permalink: /swift-composition-over-inheritance/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: ["Swift", "OOP", "Composition", "Design"]
thumbnail: "images/covers/swift_composition_over_inheritance_thumbnail.webp"
thumbnail_ready: true
---
A class hierarchy is tempting when two features share behavior. But “uses the same behavior” is weaker than “is a valid kind of this parent.” Composition lets an object receive the behavior it needs as a collaborator, without making all variation fit one family tree.

A search service with interchangeable matching rules is a good example.

<!--more-->

{%
 include centered-image.html
 image_path="../images/covers/swift_composition_over_inheritance_thumbnail.webp"
 alt_text="A service assembled from separate matching, caching, and measurement collaborators"
 caption="Composition Over Inheritance in Swift"
 width="640"
 height="400"
%}

## Separate the stable workflow from the varying policy

```swift
protocol NameMatching {
    func matches(_ candidate: String, query: String) -> Bool
}

struct ExactMatch: NameMatching {
    func matches(_ candidate: String, query: String) -> Bool {
        candidate == query
    }
}

struct CaseInsensitiveMatch: NameMatching {
    func matches(_ candidate: String, query: String) -> Bool {
        candidate.lowercased() == query.lowercased()
    }
}

final class NameSearch {
    private let matcher: any NameMatching

    init(matcher: any NameMatching) {
        self.matcher = matcher
    }

    func results(in names: [String], query: String) -> [String] {
        names.filter { matcher.matches($0, query: query) }
    }
}

let search = NameSearch(matcher: CaseInsensitiveMatch())
assert(search.results(in: ["Maya", "Omar"], query: "maya") == ["Maya"])
```

`NameSearch` owns the iteration workflow and delegates the comparison rule. It can use an exact matcher without becoming a different subclass. The comparison here is intentionally simple; a production human-name search may need locale-aware rules and normalization.

The protocol is a behavior contract. Its implementations are values because they do not need shared identity or mutable state. Swift allows this combination through [protocol conformance](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/).

## Avoid a multiplying hierarchy

Imagine adding caching, logging, and exact or fuzzy matching to the same feature. Subclasses such as `CachedLoggedFuzzySearch` quickly mix independent choices into class names and override chains.

Collaborators let those decisions vary separately. A matcher chooses comparison policy. A cache owns cached results. A logger receives events. You can test and replace each policy without creating a subclass for every combination.

This is especially useful when one feature needs two behaviors from unrelated domains. Inheriting from a base class merely to obtain a helper method gives the subclass a broader relationship than it needs.

## Inheritance still has legitimate uses

Frameworks sometimes intentionally provide a superclass as an extension point. A subclass can also be appropriate when all instances share meaningful state, lifecycle rules, and a stable behavioral contract.

Composition does not automatically improve such a design. Replacing one clear superclass with six forwarding wrappers may obscure the relationship. Ask whether subclass substitution is part of the model and whether its invariants remain understandable.

The practical preference is to favor a collaborator when the relationship is “uses this policy,” and to evaluate inheritance when it is genuinely “is this kind of thing.”

## Composition makes ownership visible

A stored collaborator needs a lifetime decision. A value policy can be copied; a class service can be shared or separately constructed. A closure can capture an owner and form a cycle just as a stored object can.

Constructor injection, as shown here, makes the dependency required and stable. A mutable strategy property permits runtime changes but introduces another state transition to coordinate. Offer replacement only when the feature needs it.

## Test the boundary

An always-matching test policy can verify that the workflow includes all candidates; an always-rejecting policy can verify the empty result. Separate tests should exercise the real matching rules.

That separation avoids making every search test depend on every detail of matching. For more on constructing these collaborators, continue with [Dependency Injection](/swift-dependency-injection/).

## Wrap an existing capability without changing its implementation

Composition supports behavior around a collaborator as well as behavior delegated directly to it. A wrapper can count calls, record results, or add policy while presenting the same contract to the consumer.

```swift
final class CountingMatcher: NameMatching {
    let wrapped: any NameMatching
    private(set) var comparisonCount = 0

    init(wrapped: any NameMatching) {
        self.wrapped = wrapped
    }

    func matches(_ candidate: String, query: String) -> Bool {
        comparisonCount += 1
        return wrapped.matches(candidate, query: query)
    }
}

let countedMatcher = CountingMatcher(wrapped: ExactMatch())
let countedSearch = NameSearch(matcher: countedMatcher)
assert(countedSearch.results(in: ["Maya", "Omar", "Maya"], query: "Maya") == ["Maya", "Maya"])
assert(countedMatcher.comparisonCount == 3)
```

The search workflow is unchanged. The wrapper is a class because we deliberately want the caller and search service to observe one evolving count. A struct wrapper with a shared counter object could express the same sharing, but would hide it behind another layer.

This resembles the Decorator pattern: an object implements the same capability while forwarding to another implementation. The pattern name is useful vocabulary; the important design property is that the consumer does not need to know how many layers surround the matcher.

## Ordering wrappers changes behavior

A logging wrapper outside a cache can record every request. The same wrapper inside a cache records only requests that reach the underlying service. Both designs can be valid, but they answer different questions.

Likewise, validation before normalization can reject input that normalization would have repaired. Retrying outside a transaction can repeat the entire transaction, while retrying inside it may repeat only a lower-level operation. Composition makes ordering explicit, but does not make ordering irrelevant.

When assembling a chain, describe the path in one sentence: “validate the request, consult the cache, call the remote source, then record the accepted result.” If the constructor nesting is difficult to read, put assembly in a named factory and test representative paths through the final composition.

## A closure can be the smallest useful policy

One operation with no associated state may not need its own protocol and concrete type family. A function value can express the variation directly.

```swift
struct PredicateSearch {
    let matches: (String, String) -> Bool

    func results(in names: [String], query: String) -> [String] {
        names.filter { matches($0, query) }
    }
}

let prefixSearch = PredicateSearch { candidate, query in
    candidate.hasPrefix(query)
}
assert(prefixSearch.results(in: ["Maya", "Mariam", "Omar"], query: "Ma") == ["Maya", "Mariam"])
```

The closure version is concise and easy to construct. A protocol becomes more useful when the capability has several related operations, meaningful implementation identity, associated types, or documentation that deserves a named contract.

Closures also capture state. A closure assigned to an owner can create a retain cycle just as an injected object can. Choosing function syntax changes the shape of the API, not the ownership rules of everything it captures.

## Use a behavioral test before replacing inheritance

Suppose a subclass overrides `results` to normalize the query before calling `super`. Moving that normalization into an injected matcher may subtly change behavior because the workflow now invokes normalization once per candidate instead of once per search.

If normalization is pure, the results may remain the same but the work can multiply. If it depends on changing state, the results can change too. A refactor should preserve both the intended output and the important effect boundaries.

A careful migration starts with characterization cases through the old public API. Identify which behavior varies, extract that behavior into a collaborator, and compare results on empty inputs, ordinary inputs, and error paths. Remove the inheritance layer only after the new composition supplies the actual contract callers use.

## Keep assembly distinct from use

A feature that constructs its matcher, logger, and cache internally still uses composition structurally, but consumers cannot easily replace those dependencies. Constructor injection makes the choices explicit at assembly time.

Do not turn that into a universal requirement to inject every helper. A private pure helper with no meaningful variation can remain an implementation detail. Inject collaborators whose policy, effects, or lifetime matter to the consumer or application configuration.

Also avoid asking the feature to fetch its own dependencies from a generic container. That hides the same choices again. A feature constructor should communicate what the feature needs; the application's assembly code can decide how those needs are satisfied.

## Identify the cost of forwarding

Composition can introduce wrappers, forwarding methods, and another level of navigation. That cost is justified when it contains independent variation or effects. It is harder to justify when five layers all pass the same arguments unchanged and add no policy.

A good review asks what would change if one collaborator were replaced. If the answer is “nothing meaningful; there is only one trivial implementation,” a direct concrete dependency or function may be simpler. If the answer is “we can replace disk access without changing ranking,” the boundary has a clear purpose.

## Exercise: add caching without lying about freshness

Extend a search workflow so results can come from a cache. Decide whether a cache key includes the query, the candidate dataset, and the matching policy. Caching only by query would return stale results when the dataset changes.

Then decide whether the API returns a snapshot, exposes freshness, or automatically invalidates entries. These questions reveal the real work of the feature. Merely wrapping an existing service in a class named `CachedSearch` does not establish a correct cache contract.

Composition helps localize that contract. It does not remove the responsibility to define it.

## Case study: compose a cache whose key describes the whole request

The search exercise has a specific trap: the same query against a different dataset must not reuse the old results. Solve it with a cache around a search capability, while keeping the matching policy fixed inside the wrapped implementation.

```swift
protocol NameSearching {
    func results(in names: [String], query: String) -> [String]
}

extension NameSearch: NameSearching {}

private struct NameSearchKey: Hashable {
    let names: [String]
    let query: String
}

final class CachedNameSearch: NameSearching {
    private let wrapped: any NameSearching
    private var entries: [NameSearchKey: [String]] = [:]

    init(wrapped: any NameSearching) { self.wrapped = wrapped }

    func results(in names: [String], query: String) -> [String] {
        let key = NameSearchKey(names: names, query: query)
        if let cached = entries[key] { return cached }
        let result = wrapped.results(in: names, query: query)
        entries[key] = result
        return result
    }

    func removeAll() { entries.removeAll() }
}

final class SearchCallCounter: NameSearching {
    private let wrapped: any NameSearching
    private(set) var calls = 0

    init(wrapped: any NameSearching) { self.wrapped = wrapped }

    func results(in names: [String], query: String) -> [String] {
        calls += 1
        return wrapped.results(in: names, query: query)
    }
}

let underlyingSearch = SearchCallCounter(wrapped: NameSearch(matcher: ExactMatch()))
let cachedNameSearch = CachedNameSearch(wrapped: underlyingSearch)
assert(cachedNameSearch.results(in: ["Maya", "Omar"], query: "Maya") == ["Maya"])
assert(cachedNameSearch.results(in: ["Maya", "Omar"], query: "Maya") == ["Maya"])
assert(underlyingSearch.calls == 1)
assert(cachedNameSearch.results(in: ["Omar"], query: "Maya").isEmpty)
assert(underlyingSearch.calls == 2)
assert(cachedNameSearch.results(in: ["Omar"], query: "Maya").isEmpty)
assert(underlyingSearch.calls == 2)
```

An empty result is cached successfully: an optional dictionary lookup distinguishes a stored empty array from an absent entry. The dataset is part of the key, so removing Maya changes the request and causes a new underlying search.

Array order is also part of equality here. That is appropriate because the search preserves input order. If two differently ordered datasets were treated as the same key, the cache could return the right names in the wrong order. Duplicates matter for the same reason.

### Fix the policy or include it in the key

The wrapped `NameSearch` receives a matcher during construction and does not replace it. The cache is therefore scoped to that particular configured search. A separate cache around a case-insensitive search has independent entries.

That is a semantic assumption, not something the protocol can prove. A stateful matcher that changes its result over time would invalidate this memoization. So would a search implementation that reads permissions or a remote index not represented in the request.

If policy can change, either reconstruct the cache, invalidate it when policy changes, or add a stable policy revision to the key. Avoid using a human-readable class name as a policy fingerprint: two instances of the same class can have different configuration.

### Wrapper order answers a measurable question

A counter outside the cache counts requests from the consumer. The existing counter inside the cache counts actual underlying searches:

```swift
let incomingSearchCalls = SearchCallCounter(wrapped: cachedNameSearch)
_ = incomingSearchCalls.results(in: ["Maya", "Omar"], query: "Maya")
_ = incomingSearchCalls.results(in: ["Maya", "Omar"], query: "Maya")
assert(incomingSearchCalls.calls == 2)
assert(underlyingSearch.calls == 2)

cachedNameSearch.removeAll()
_ = incomingSearchCalls.results(in: ["Maya", "Omar"], query: "Maya")
assert(incomingSearchCalls.calls == 3)
assert(underlyingSearch.calls == 3)
```

The first two requests hit a previously populated entry. Clearing the cache causes the next request to reach the underlying service. Neither counter is wrong; each measures a different boundary. Name production metrics accordingly, such as incoming requests and cache misses, rather than calling both “search count.”

### Account for the cost of the cache itself

This example retains complete dataset keys and results indefinitely. Hashing and comparing a key also requires work proportional to the dataset content in relevant cases. For a cheap in-memory exact search, the cache can cost more than recomputation.

For a large immutable dataset, a stable dataset identifier plus revision can be a better key. That design transfers responsibility to whoever maintains the revision: every relevant dataset change must advance it. A count of rows is insufficient because content can change while the count stays constant.

A production cache may also need an eviction policy, bounded memory, and access isolation. Those are requirements of the cache collaborator; they should not force unrelated matching implementations into a subclass hierarchy.

### Cache values according to the result's semantics

The results here are arrays of strings, so callers receive values. Caching arrays of mutable objects would share those objects with every caller unless the API defines another policy. A caller editing a cached entity could then change what a later lookup observes without changing the key.

Choose snapshots when independent results are required, or document live shared entities when that is intentional. Composition creates a place to express this policy. It does not decide the policy for you.

The final assembly has three independent responsibilities: matching, memoization, and measurement. Each has a concrete reason to vary, and their interactions are established by observable tests rather than by the names of subclasses.

Continue through the [Object-Oriented Programming roadmap](/swift-object-oriented-programming/).
