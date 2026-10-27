---
layout: post
hidden: true
title: "Linear Programming in Swift: Model Constraints and Solve Small Two-Variable Problems"
date: "2025-09-25"
last_modified_at: "2025-09-25"
permalink: /swift-linear-programming/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
Linear programming chooses real-valued decision variables to optimize a linear objective while satisfying linear constraints. A model can allocate resources, plan production, or choose a mixture, but its answer is meaningful only when units, bounds, and integrality assumptions match the problem.

A small two-variable solver makes the geometry visible. It also provides a clear boundary: enumerating vertices is useful for teaching, not a scalable replacement for a mature general-purpose optimizer.

<!--more-->

The Swift 5.7 example maximizes an objective inside a supplied finite nonnegative box. It enumerates boundary intersections and checks feasibility with floating-point tolerances. It does not classify arbitrary unbounded programs or provide exact-arithmetic infeasibility certificates.

## Model the problem before solving it

Suppose products `x` and `y` earn three and two units of value. Shared capacity is four units, and `x` has an additional limit of two:

$$
\max\ 3x+2y\quad\text{subject to}\quad
x+y\le4,\quad x\le2,\quad y\le3,\quad x,y\ge0.
$$

Units must agree within each constraint. Hours cannot be added to kilograms, and a daily limit must not be compared with a weekly production quantity without conversion.

The feasible region is convex. For a nonempty bounded polytope, a linear objective attains an optimum at a vertex, though an entire edge can tie. This allows pairwise boundary intersections in two dimensions.

## Enumerate candidate vertices within an explicit box

```swift
import Foundation

struct LPConstraint { let x: Double; let y: Double; let limit: Double }
struct LPPoint: Equatable { let x: Double; let y: Double }
struct LPCandidate { let point: LPPoint; let value: Double }
enum LPFailure: Error { case invalidInput, numericFailure }

func maximize2D(
    objective: LPPoint, constraints: [LPConstraint], upper: LPPoint,
    tolerance: Double = 1e-9
) throws -> LPCandidate? {
    guard objective.x.isFinite, objective.y.isFinite,
          upper.x.isFinite, upper.y.isFinite, upper.x >= 0, upper.y >= 0,
          tolerance.isFinite, tolerance > 0,
          constraints.allSatisfy({ $0.x.isFinite && $0.y.isFinite && $0.limit.isFinite }) else {
        throw LPFailure.invalidInput
    }
    let boundaries = constraints + [
        LPConstraint(x: -1, y: 0, limit: 0), LPConstraint(x: 0, y: -1, limit: 0),
        LPConstraint(x: 1, y: 0, limit: upper.x), LPConstraint(x: 0, y: 1, limit: upper.y)
    ]
    var best: LPCandidate?
    for i in boundaries.indices {
        for j in (i + 1)..<boundaries.count {
            let a = boundaries[i], b = boundaries[j]
            let determinant = a.x * b.y - b.x * a.y
            guard determinant.isFinite else { throw LPFailure.numericFailure }
            let scale = max(1, abs(a.x * b.y) + abs(b.x * a.y))
            guard scale.isFinite else { throw LPFailure.numericFailure }
            if abs(determinant) <= tolerance * scale { continue }
            let x = (a.limit * b.y - b.limit * a.y) / determinant
            let y = (a.x * b.limit - b.x * a.limit) / determinant
            guard x.isFinite, y.isFinite else { throw LPFailure.numericFailure }
            let feasible = try boundaries.allSatisfy { constraint in
                let lhs = constraint.x * x + constraint.y * y
                let allowance = tolerance * max(1, max(abs(lhs), abs(constraint.limit)))
                let bound = constraint.limit + allowance
                guard lhs.isFinite, bound.isFinite else { throw LPFailure.numericFailure }
                return lhs <= bound
            }
            guard feasible else { continue }
            let value = objective.x * x + objective.y * y
            guard value.isFinite else { throw LPFailure.numericFailure }
            if best == nil || value > best!.value {
                best = LPCandidate(point: LPPoint(x: x, y: y), value: value)
            }
        }
    }
    return best
}

let constraints = [LPConstraint(x: 1, y: 1, limit: 4),
                   LPConstraint(x: 1, y: 0, limit: 2),
                   LPConstraint(x: 0, y: 1, limit: 3)]
let result = try maximize2D(objective: LPPoint(x: 3, y: 2), constraints: constraints,
                            upper: LPPoint(x: 10, y: 10))
assert(abs(result!.point.x - 2) < 1e-8)
assert(abs(result!.point.y - 2) < 1e-8)
assert(abs(result!.value - 10) < 1e-8)
```

The box is part of the mathematical model. Adding an arbitrary cap merely to make an unbounded problem return a number changes the problem. Here it is explicit and does not bind the worked optimum.

## Separate infeasible, unbounded, and numerically uncertain

An infeasible program has no point satisfying all constraints. An unbounded maximization can increase its objective indefinitely. A feasible program may have one optimum or many tied optima.

The supplied box prevents mathematical unboundedness for this solver's finite objective. A nil result means no feasible candidate was found under its numerical rules. On well-conditioned inputs that corresponds to an empty feasible region; on ill-conditioned inputs it is not a rigorous certificate.

Nearly parallel boundaries can be skipped by the determinant tolerance, and feasibility tolerance can accept a small violation. A production optimizer should report numerical status and residuals rather than presenting every floating-point candidate as an exact proof.

## Verify the example with a dual bound

Multiply `x + y ≤ 4` by two and `x ≤ 2` by one, then add:

$$
3x+2y\le 2\cdot4+1\cdot2=10.
$$

The candidate `(2, 2)` is feasible and reaches ten, so it is optimal independently of the enumeration code. This is a small dual certificate: nonnegative combinations of constraints bound the objective.

General primal-dual reasoning supplies powerful validation and sensitivity information. A solver returning a number without a feasible point or status gives the caller much less evidence.

## Complexity grows rapidly with dimension

For `m` constraints, two-dimensional enumeration examines `O(m²)` pairs and checks `O(m)` constraints per candidate, giving `O(m³)` work and linear model storage.

In higher dimensions, enumerating combinations of active constraints becomes combinatorial. Simplex and interior-point methods exploit structure rather than scanning every possible vertex. Simplex is highly effective in practice but does not have a general polynomial worst-case guarantee under ordinary pivot rules.

The educational solver also repeats feasibility checks for duplicate intersection points. Deduplicating candidates can reduce repeated work but introduces another tolerance policy.

## Linear does not mean integer

LP variables are real-valued. A production plan can return fractional quantities even when the application needs whole devices, people, or vehicles. Rounding the optimum can violate constraints or discard the true integer optimum.

Use an integer or mixed-integer formulation when integrality is required. A scheduling problem with indivisible jobs is not solved correctly by renaming floating-point variables “job counts.”

Likewise, nonlinear costs, products of decision variables, and conditional logic require another formulation or justified linearization.

## Test geometry and numerical boundaries

Include a unique optimum, an objective tied along an edge, redundant constraints, inconsistent constraints, a single feasible point, and a zero-width box. For each returned candidate, recompute every residual and the objective independently.

Scale one constraint by a positive constant and check the intended feasible region remains the same within an appropriate numerical interpretation. Large changes in answers can expose conditioning or tolerance problems.

Reject nonfinite coefficients and report arithmetic overflow rather than silently treating infinity as a valid optimum.

## Inspect the worked feasible vertices

| Candidate | Objective `3x + 2y` | Interpretation |
| --- | --- | --- |
| `(0, 0)` | `0` | Produce nothing |
| `(2, 0)` | `6` | Only x reaches its limit |
| `(2, 2)` | `10` | Shared capacity and x limit bind |
| `(1, 3)` | `9` | Shared capacity and y limit bind |
| `(0, 3)` | `6` | Only y reaches its limit |

The table makes the optimum inspectable without trusting the code. The dual bound then proves no unlisted feasible interior point can exceed ten.

## Distinguish a redundant bound from a changed model

Increasing the explicit upper box from ten to twenty leaves this example unchanged because the tighter application constraints already bind. Reducing the box to one changes the feasible region and therefore the optimum.

A solver wrapper should retain the exact model supplied by the caller, including generated bounds. Otherwise an unexpected answer can be impossible to reproduce from the application's displayed constraints.

## Test a contradiction directly

```swift
let contradiction = try maximize2D(
    objective: LPPoint(x: 1, y: 1),
    constraints: [LPConstraint(x: 1, y: 0, limit: -1)],
    upper: LPPoint(x: 10, y: 10)
)
assert(contradiction == nil)
let origin = try maximize2D(objective: LPPoint(x: -1, y: -1), constraints: [],
                            upper: LPPoint(x: 10, y: 10))
assert(abs(origin!.value) < 1e-8)
```

The first constraint contradicts nonnegative x. The second objective demonstrates that maximizing can prefer the lower boundary even when all upper bounds are large. Keep such fixtures alongside the positive-coefficient production example.

## Sensitivity is local to the active constraint pattern

At the worked optimum, the shared-capacity constraint and x limit are active. Their dual multipliers describe the local value of relaxing those limits while the same optimal basis remains valid.

Increasing capacity indefinitely does not preserve the same marginal benefit because another constraint, such as the y limit, eventually becomes active. A shadow price is not a universal forecast outside its valid range.

The model also assumes the objective and constraints are known numbers. If demand or processing time is uncertain, deterministic LP output does not automatically include a confidence interval. Scenario analysis or robust/stochastic formulations address different questions.

Report the supplied assumptions, feasible solution, residuals, and objective together. A precise-looking decimal optimum is not more reliable than the measurements and modeling choices that produced its coefficients.

## Exercise: return an optimality explanation

For the worked example, return the active constraints and the dual multipliers that certify the value ten. Add a second objective and identify when the optimum moves to another vertex. Then show a fractional LP optimum whose rounded point violates a constraint, motivating an integer model.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
