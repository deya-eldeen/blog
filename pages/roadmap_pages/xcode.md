---
layout: page
title: "Xcode"
subtitle: "Understand your project, shorten feedback loops, and diagnose real failures"
permalink: /xcode/
hide: true
excluded: true
---

Learn the tools behind building, debugging, testing, and distributing an iOS app. Start with project structure, then work toward repeatable builds and useful diagnostics. This page contains topic outlines; articles will be linked as they are written.

{% include roadmap/legend.liquid %}

## 1. Projects and Build Structure

- Projects, Workspaces, Targets, and Schemes
- Build Configurations and Configuration Files
- Understanding Build Settings and Inheritance
- Adding Swift Packages and Reviewing Resolved Versions
- Resources, Target Membership, and Bundle Boundaries
{: .roadmap-topics}

## 2. Everyday Workflows

- Navigating Symbols, Call Sites, and Related Files
- Refactoring Names Without Breaking References
- Using Previews with Deterministic Sample Data
- Managing Simulators, Devices, and Runtime Versions
- Source Control, Diffs, and Conflict Resolution in Xcode
{: .roadmap-topics}

## 3. Debugging

- Breakpoints, Conditions, and Debugger Actions
- Inspecting Values and Stack Frames with LLDB
- Debugging View Hierarchies and Layout Constraints
- Reading Crash Reports and Symbolicating Stacks
- Diagnosing Memory Leaks with the Memory Graph
- Using Address, Thread, and Undefined Behavior Sanitizers
{: .roadmap-topics}

## 4. Tests and Performance

- Test Targets, Test Plans, and Selected Runs
- Reading Test Results, Attachments, and Coverage
- Profiling CPU Work with Time Profiler
- Tracking Allocations and Retained Memory
- Diagnosing Slow Builds and Incremental Build Failures
{: .roadmap-topics}

## 5. Signing and Distribution

- Bundle Identifiers, Capabilities, and Entitlements
- Certificates, Provisioning Profiles, and Code Signing
- Archive Builds and Distribution Configurations
- TestFlight Builds, Version Numbers, and Release Checks
- Reproducible Command-Line Builds with `xcodebuild`
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/uikit/" next_title="UIKit" %}
