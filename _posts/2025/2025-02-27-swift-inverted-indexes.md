---
layout: post
hidden: true
title: "Inverted Indexes in Swift: Tokenization, Posting Lists, and Boolean Search"
date: "2025-02-27"
last_modified_at: "2025-02-27"
permalink: /swift-inverted-indexes/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
An inverted index maps a term to the documents containing it. A positional index also records where each occurrence appears, allowing phrase queries rather than only document membership.

The algorithmic challenge is not just creating a dictionary. Tokenization must be consistent, document replacement must remove stale postings, and query semantics must distinguish an empty query from a query with no matches.

<!--more-->

These Swift 5.7 examples build a small in-memory positional index with AND and exact-token-phrase queries. Document IDs are stable integers, and results are sorted by ID rather than ranked by relevance.

## Tokenization is part of the index format

```swift
func tokens(in text: String) -> [String] {
    text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
}

struct InvertedIndex {
    private var postings: [String: [Int: [Int]]] = [:]
    private var documentTokens: [Int: [String]] = [:]

    mutating func remove(document id: Int) {
        guard let old = documentTokens.removeValue(forKey: id) else { return }
        for term in Set(old) {
            postings[term]?.removeValue(forKey: id)
            if postings[term]?.isEmpty == true { postings.removeValue(forKey: term) }
        }
    }

    mutating func index(document id: Int, text: String) {
        remove(document: id)
        let parsed = tokens(in: text)
        documentTokens[id] = parsed
        for (position, term) in parsed.enumerated() {
            postings[term, default: [:]][id, default: []].append(position)
        }
    }

    func matchingAll(_ query: String) -> [Int] {
        let terms = Set(tokens(in: query))
        guard !terms.isEmpty else { return [] }
        var lists: [Set<Int>] = []
        for term in terms {
            guard let documents = postings[term] else { return [] }
            lists.append(Set(documents.keys))
        }
        lists.sort { $0.count < $1.count }
        var matches = lists[0]
        for list in lists.dropFirst() { matches.formIntersection(list) }
        return matches.sorted()
    }

    func matchingPhrase(_ query: String) -> [Int] {
        let terms = tokens(in: query)
        guard let first = terms.first else { return [] }
        return matchingAll(query).filter { document in
            (postings[first]?[document] ?? []).contains { start in
                terms.enumerated().allSatisfy { offset, term in
                    postings[term]?[document]?.contains(start + offset) == true
                }
            }
        }
    }
}

var index = InvertedIndex()
index.index(document: 1, text: "Swift values and functions")
index.index(document: 2, text: "Swift functions are values")
index.index(document: 3, text: "Values first")
assert(index.matchingAll("SWIFT functions") == [1, 2])
assert(index.matchingPhrase("swift functions") == [2])
assert(index.matchingAll("").isEmpty)
index.index(document: 2, text: "Protocols")
assert(index.matchingAll("swift functions") == [1])
index.remove(document: 1)
assert(index.matchingAll("swift").isEmpty)
```

Positions count normalized tokens, not source character offsets. Highlighting original text requires preserving source spans or another mapping during tokenization.

## Replacing a document is not another append

Before indexing a new version of an existing document, remove that document's postings from its old terms. Otherwise a word deleted from the source remains searchable.

`documentTokens` provides the reverse relationship needed for removal. This representation retains all tokens for clarity; a larger engine can retain only the unique old terms for deletion while storing source text elsewhere.

The update is synchronous and contains no external effects. A concurrent service should publish a coherent index generation so queries cannot see half of a replacement. File-backed indexes also need a durability protocol beyond value assignment.

## AND queries intersect candidate documents

For query terms `t₁ … tₖ`, the answer is:

$$
D(t_1)\cap D(t_2)\cap\cdots\cap D(t_k).
$$

Repeated terms do not change AND membership, so a set removes duplicates. Starting with the smallest posting set can reduce intermediate candidate size.

This implementation materializes sets of document IDs and uses hashing. A compressed sorted posting-list representation can intersect with a two-pointer merge and skip pointers. State the representation before claiming a particular query bound.

An empty query returns no documents by policy. Returning every document would also be definable, but must not happen accidentally because intersection starts from an undefined universal set.

## Phrase queries need positions, including repeated terms

A document containing both “swift” and “functions” need not contain the phrase “swift functions.” For a candidate start position `p`, each term at query offset `i` must occur at `p + i`.

The phrase query retains repeated query terms because their positions matter. Removing duplicates here would turn “very very good” into a different phrase.

The demonstration uses linear membership scans of position arrays. Frequent terms can make this expensive. Sorted-position merging, binary search, and positional skip techniques can improve it; the code does not claim the cost of those unimplemented strategies.

## Normalization must match the product

Lowercasing and splitting on non-letter/non-number characters is a deliberately simple policy. It is not a complete tokenizer for every language, and punctuation-sensitive identifiers such as `C++` or `foo_bar` may require different rules.

Case folding, stemming, diacritic handling, stop words, and locale affect what counts as a term. Query and indexing pipelines must use the same versioned policy. Changing tokenization without rebuilding old postings produces inconsistent results.

Retain original display data separately. Normalized tokens are search keys, not necessarily suitable user-facing snippets.

## Storage follows occurrences as well as vocabulary

For total token occurrences `T` and vocabulary size `W`, positional postings store information proportional to occurrences plus dictionary overhead. Repeating one term a million times creates one vocabulary entry but a million positions.

Production indexes often compress increasing document IDs and positions with gaps. Compression saves bytes but adds decoding and update tradeoffs. Immutable segments with merge-based maintenance are another design, while an in-memory dictionary is a reasonable baseline for small datasets.

## Ranking is a separate stage

AND membership and phrase matching do not rank relevance. Sorting by document ID provides deterministic output only. Frequency-based scoring needs document lengths, term statistics, and an explicit scoring formula.

If updates change global statistics, cached rankings need invalidation. A search result count also should not be confused with a relevance score or probability of correctness.

## Query planning can start from selective terms

A query containing one rare term and several common terms should usually begin with the rare posting list. Its small candidate set can reduce subsequent membership checks dramatically.

The implementation sorts posting sets by size, but it still materializes every set first. A tuned index can expose posting counts separately, choose a plan, and decode only the lists it needs. That trades a more involved storage API for less temporary work.

Phrase search can similarly choose a selective anchor term and translate its positions relative to the query offset, rather than always starting from the first term. Preserve repeated-term semantics when changing that plan.

## Deletions can be logical before physical

Segment-based indexes often mark a document version deleted and reclaim postings during later segment merges. Queries must filter those tombstones so stale terms do not become visible again.

A stable document ID plus version helps distinguish a replacement from an unrelated new document. The merge process must retain the newest live version and drop obsolete postings according to one coherent generation policy.

This is a storage architecture beyond the dictionary example, but the semantic requirement is the same: a query should reflect the intended document snapshot, not an accidental mixture of old and new postings.

## Highlighting needs original text positions

Normalized token positions cannot directly slice the user's original string. Lowercasing and tokenization can change representation, and Swift string indices are not arbitrary integer byte offsets.

Retain source spans during tokenization or rerun the exact same tokenizer with span capture against the corresponding document version. Returning a highlight from a newer document while using positions from an older index can point to the wrong content even if the matched terms look familiar.

## Exercise: add source highlighting

Extend tokenization to retain original source ranges. Return phrase matches with document IDs and spans, preserving Unicode index correctness. Test punctuation, repeated terms, document replacement, and two visually similar strings with different tokenization behavior.

Then compare set intersection with sorted posting-list intersection on sparse and common-term queries, including index construction and update costs.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
