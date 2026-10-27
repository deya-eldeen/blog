---
layout: post
hidden: true
title: "Front Controller in Swift: Validate and Dispatch Incoming Requests in One Place"
date: "2025-05-13"
last_modified_at: "2025-05-13"
permalink: /swift-front-controller/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Design Patterns, Architecture]
thumbnail: assets/img/article-placeholder.svg
---
A front controller is a common entry point for incoming requests. It validates routing input, applies shared access policy, dispatches one use case, and maps outcomes into a consistent response model.

In an app, the request might come from a deep-link adapter, a command surface, or an internal navigation request. Central entry does not mean one object should contain every feature's business logic.

<!--more-->

These Swift 5.7 examples accept a small decoded request model with exact paths and parameters. A real URL or network adapter must handle decoding and duplicate query parameters before constructing this model.

## Normalize input into a typed route before effects

```swift
enum UserRole { case reader, administrator }
struct RequestContext { let userID: Int?; let role: UserRole? }
struct IncomingRequest {
    let path: String
    let parameters: [String: String]
    let context: RequestContext
}
enum AppRoute {
    case book(Int)
    case search(String)
    case settings
    case administration
}
enum RouteFailure: Error { case unknown, malformed }

func parseRoute(_ request: IncomingRequest) throws -> AppRoute {
    switch request.path {
    case "/book":
        guard Set(request.parameters.keys) == ["id"],
              let text = request.parameters["id"], let id = Int(text), id > 0 else {
            throw RouteFailure.malformed
        }
        return .book(id)
    case "/search":
        guard Set(request.parameters.keys) == ["q"],
              let query = request.parameters["q"], (1...100).contains(query.count) else {
            throw RouteFailure.malformed
        }
        return .search(query)
    case "/settings":
        guard request.parameters.isEmpty else { throw RouteFailure.malformed }
        return .settings
    case "/admin":
        guard request.parameters.isEmpty else { throw RouteFailure.malformed }
        return .administration
    default:
        throw RouteFailure.unknown
    }
}
```

Typed routing prevents each downstream handler from independently parsing strings and inventing different defaults. Unsupported parameters are rejected rather than silently ignored.

This parser deliberately uses exact path matching. Case folding, percent decoding, trailing slashes, and canonicalization belong to the documented boundary adapter. Inconsistent normalization between routing and access checks can select different meanings for the same input.

## Apply shared policy before dispatch

```swift
enum BookLookupFailure: Error { case missing, unavailable }
enum AppResponse: Equatable {
    case book(String)
    case results([String])
    case settings(String)
    case administration(String)
    case badRequest
    case notFound
    case signInRequired
    case forbidden
    case unavailable
}

struct FrontController {
    let loadBook: (Int) throws -> String
    let search: (String) throws -> [String]
    let settings: (Int) throws -> String
    let administration: () throws -> String

    func handle(_ request: IncomingRequest) -> AppResponse {
        let route: AppRoute
        do { route = try parseRoute(request) }
        catch RouteFailure.unknown { return .notFound }
        catch { return .badRequest }
        do {
            switch route {
            case let .book(id): return .book(try loadBook(id))
            case let .search(query): return .results(try search(query))
            case .settings:
                guard let userID = request.context.userID else { return .signInRequired }
                return .settings(try settings(userID))
            case .administration:
                guard request.context.userID != nil else { return .signInRequired }
                guard request.context.role == .administrator else { return .forbidden }
                return .administration(try administration())
            }
        } catch BookLookupFailure.missing {
            return .notFound
        } catch {
            return .unavailable
        }
    }
}
```

The context is a trusted application snapshot, not a role accepted from arbitrary query parameters. In a server deployment, backend authorization still needs to enforce access independently of client navigation.

Book pages and search are public under this example policy, while settings and administration have different access requirements. A product can choose another policy, but it should be visible in one coherent place.

## Test that denied requests do not reach effects

```swift
var administrationCalls = 0
let controller = FrontController(
    loadBook: { id in
        guard id == 7 else { throw BookLookupFailure.missing }
        return "Swift"
    },
    search: { [$0] },
    settings: { "Settings for \($0)" },
    administration: { administrationCalls += 1; return "Administration" }
)
let anonymous = RequestContext(userID: nil, role: nil)
let reader = RequestContext(userID: 1, role: .reader)
let administrator = RequestContext(userID: 2, role: .administrator)
assert(controller.handle(IncomingRequest(path: "/book", parameters: ["id": "7"], context: anonymous)) == .book("Swift"))
assert(controller.handle(IncomingRequest(path: "/book", parameters: ["id": "bad"], context: anonymous)) == .badRequest)
assert(controller.handle(IncomingRequest(path: "/admin", parameters: [:], context: reader)) == .forbidden)
assert(administrationCalls == 0)
assert(controller.handle(IncomingRequest(path: "/admin", parameters: [:], context: administrator)) == .administration("Administration"))
assert(administrationCalls == 1)
```

An invalid ID is rejected before lookup. A forbidden administration request cannot invoke the administration capability. A missing book and unavailable storage remain distinct responses.

The effect closures keep the example testable. A network-backed capability should expose asynchronous behavior instead of blocking this synchronous interface.

```mermaid
flowchart LR
    accTitle: A front controller validates and authorizes before selecting a use case
    Input[Decoded request] --> Parse[Typed route parsing]
    Parse --> Policy[Shared access policy]
    Policy --> Dispatch[Dispatch one use case]
    Dispatch --> Outcome[Map domain outcome]
    Outcome --> Response[Application response]
```

## Keep request scope coherent

Read account and role facts once for the request rather than consulting a mutable global session between validation and dispatch. If authorization can change during long asynchronous work, the effect boundary needs an appropriate revalidation or server-enforced policy.

Request identity also helps diagnostics and idempotency. A common entry point can attach a correlation ID, but an ID alone does not deduplicate external writes.

The dictionary parameter model cannot represent duplicate keys. A real decoder must reject duplicates or apply a documented policy before using it. Converting to a dictionary too early can discard input distinctions that validation needed.

## Front Controller is not every coordinator

A coordinator owns navigation and child-flow lifetime. A front controller owns incoming-request admission and dispatch. It can delegate a validated route to a coordinator rather than manipulating all screen objects itself.

A mediator coordinates ongoing colleague interactions. A chain of responsibility can implement extensible dispatch stages inside a front controller, but its ordering and terminal rejection semantics remain important.

A facade exposes a coherent use case. Several route handlers can call the same facade while the front controller remains responsible only for entry policy and result mapping.

## Avoid the central switch becoming the whole application

A closed route enum and switch are clear for a small domain. A large plugin host may need a registry of typed handlers with explicit conflict and access policies.

Do not replace a readable switch with runtime discovery solely to avoid editing one file. Conversely, do not keep adding business rules and infrastructure adapters into one controller until every feature depends on it.

Keep shared admission logic central and feature-specific work behind narrow capabilities. That gives new routes an obvious assembly home without turning the entry point into a service locator.

## Canonicalize once at the transport boundary

The example deliberately receives an already decoded request. A real URL entry point must first define percent-decoding, path normalization, repeated query parameters, and maximum input size. Decoding twice can turn an apparently literal value into a separator or another reserved character.

Use one transport adapter to produce the `IncomingRequest` representation, then parse routes from that representation. Do not let each handler apply its own decoding rules. Exact route matching is useful only when every handler agrees on what the path and parameter values mean.

Repeated parameters also need a policy. If the URL contains two book IDs, choosing the first in one layer and the last in another can lead to a decision about one entity followed by an effect on another. Reject ambiguity or normalize it consistently before authorization and dispatch.

## Authentication context must come from a trusted source

A user-controlled query parameter saying `role=admin` is not authorization context. The request context supplied here represents a result already established by the trusted entry adapter or session system.

The front controller checks access before dispatching a protected handler, but the domain service must still enforce permissions relevant to the specific operation. A route-level role check cannot establish ownership of every requested book or protect an operation invoked through another entry point.

Keep malformed input distinct from denied access and missing resources according to the application's disclosure policy. Some services intentionally conceal whether a protected resource exists. That policy should be consistent across entry points, rather than an accidental consequence of handler order.

## One entry point need not become one enormous switch

A front controller centralizes the common request lifecycle: decode, parse, apply shared policy, dispatch, and map outcomes. It can delegate route-specific work to small handlers. A growing switch containing database queries, UI creation, billing logic, and retries no longer provides a useful boundary.

Keep parsing pure where possible. A parser test can then enumerate paths and parameter cases without constructing every downstream dependency. Handler tests focus on domain outcomes, while front-controller tests verify that denied requests produce no effects and errors map to the promised response.

For asynchronous handlers, preserve cancellation and distinguish a timed-out response from a known failed effect. A request may have committed remotely before the caller stopped waiting. Retrying a mutating route needs an idempotency policy or reconciliation mechanism; centralized dispatch does not supply one.

Finally, tracing should record the normalized route and outcome while redacting credentials and sensitive parameters. A convenient central logging point can otherwise become a convenient central data leak.

## Exercise: add an asynchronous publish route

Parse a request ID and draft identity, enforce its required account policy, and call a publishing facade. Map complete, pending-index, invalid input, and unavailable outcomes distinctly. Test duplicate requests and cancellation without assuming that a cancelled client call means no remote commit occurred.

Return to the [Design Patterns roadmap](/swift-design-patterns/).
