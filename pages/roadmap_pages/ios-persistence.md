---
layout: page
title: "Persistence in iOS"
subtitle: "Choose the right store and define what a successful save guarantees"
permalink: /ios-persistence/
hide: true
excluded: true
---

Choose storage by the data's shape, lifetime, consistency needs, and recovery requirements. This outline covers preferences, files, Core Data, SwiftData, and the boundaries shared by them. The titles are planned articles, not links to unfinished content.

{% include roadmap/legend.liquid %}

## 1. Storage Decisions

- Choosing Between Preferences, Files, and Databases
- Documents, Caches, and Temporary Data Lifetimes
- Separating Domain Models from Stored Representations
- Defining Save, Failure, and Recovery Semantics
- Keeping Credentials Out of Ordinary App Storage
{: .roadmap-topics}

## 2. Preferences and Files

- `UserDefaults`: Preferences, Defaults, and Test Isolation
- Encoding Versioned Files with `Codable`
- App Containers, Directories, and File Coordination
- Atomic File Replacement and Its Limits
- File Protection, Backups, and Recovering Corrupt Data
{: .roadmap-topics}

## 3. Core Data

- Persistent Containers, Contexts, and Object Lifetimes
- Modeling Entities, Relationships, and Delete Rules
- Fetch Requests, Predicates, and Sorting
- Context Isolation and Background Work
- Merge Policies and Conflicting Changes
- Batch Operations and Persistent History
- Lightweight and Custom Store Migrations
{: .roadmap-topics}

## 4. SwiftData

- Models, Containers, and Contexts in SwiftData
- Queries, Predicates, and Observable Results
- Relationships, Uniqueness, and Deletion Behavior
- Saving Changes and Handling Failures Explicitly
- Schema Versions and Migration Plans
- Isolating SwiftData Work with Model Actors
{: .roadmap-topics}

## 5. Reliability and Testing

- Conditional Writes and Optimistic Concurrency
- Transactions, Idempotency, and Retry-Safe Operations
- Offline Changes, Synchronization, and Conflict Resolution
- Testing Real Stores with Isolated Fixtures
- Measuring Fetch Cost, Memory Use, and Store Growth
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/core-graphics/" next_title="Core Graphics" %}
