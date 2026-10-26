---
layout: post
hidden: true
title: "Persistent Binary Search Trees and Tries in Swift"
date: "2023-12-21"
last_modified_at: "2023-12-21"
permalink: /swift-functional-trees-tries/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Functional Programming, Trees, Tries]
thumbnail: assets/img/article-placeholder.svg
---
An immutable tree update reconstructs the path to a changed node while reusing untouched branches. That gives the program a new root and leaves the old version available for undo, branching, or comparison.

A binary search tree and a trie organize paths differently. The search tree follows comparisons between keys; the trie follows symbols within a key. Implementing both makes the sharing pattern concrete and exposes the assumptions behind their complexity claims.

<!--more-->

The examples use Swift 5.7. The search tree has set semantics and is deliberately unbalanced. The trie stores words as sequences of Swift `Character` values.

## State the binary search invariant

Every key in a node's left subtree must compare less than the node's key; every key in its right subtree must compare greater. Equal keys are already present and do not create another node.

```swift
indirect enum SearchTree<Element: Comparable> {
    case empty
    case node(left: SearchTree, value: Element, right: SearchTree)

    func contains(_ target: Element) -> Bool {
        var cursor = self
        while case let .node(left, value, right) = cursor {
            if target == value { return true }
            cursor = target < value ? left : right
        }
        return false
    }

    func inserting(_ newValue: Element) -> SearchTree {
        switch self {
        case .empty:
            return .node(left: .empty, value: newValue, right: .empty)
        case let .node(left, value, right):
            if newValue < value {
                return .node(left: left.inserting(newValue), value: value, right: right)
            }
            if newValue > value {
                return .node(left: left, value: value, right: right.inserting(newValue))
            }
            return self
        }
    }

    func sortedElements() -> [Element] {
        var result: [Element] = []
        func visit(_ tree: SearchTree<Element>) {
            guard case let .node(left, value, right) = tree else { return }
            visit(left)
            result.append(value)
            visit(right)
        }
        visit(self)
        return result
    }
}

let base = [5, 2, 8, 1, 3].reduce(SearchTree<Int>.empty) { $0.inserting($1) }
let edited = base.inserting(7)
assert(base.sortedElements() == [1, 2, 3, 5, 8])
assert(edited.sortedElements() == [1, 2, 3, 5, 7, 8])
assert(!base.contains(7) && edited.contains(7))
assert(base.inserting(3).sortedElements() == base.sortedElements())
```

An insertion into the right branch reuses the left branch. An insertion into the left branch reuses the right. The path is reconstructed because the nodes themselves are immutable.

In-order traversal builds an array through a local accumulator. Repeatedly concatenating `leftArray + [value] + rightArray` would add avoidable copying, especially in an unbalanced tree.

## Height controls both lookup and update cost

Search and insertion follow a path of height `h`, so their structural work is `O(h)`. An update constructs up to `O(h)` new nodes. In a balanced tree, `h` is logarithmic in the number of keys.

This implementation does not maintain balance. Inserting sorted input can produce a chain with linear height. Recursion can also exhaust the call stack on a sufficiently deep chain. Do not label this implementation “logarithmic” without the missing balance invariant.

A red-black or AVL tree can preserve balance through local reconstruction and rotations. That is a larger algorithm with additional invariants and tests. For ordinary unordered membership, the standard-library `Set` is usually a better choice than this teaching tree.

`Comparable` also needs coherent ordering. Values whose equality and ordering disagree, or keys whose comparison-relevant state changes after insertion, can violate the search invariant. Prefer stable value keys.

## A trie follows the components of a word

Each trie node stores whether the current prefix is a complete word and a dictionary of next-character children:

```swift
struct WordTrie {
    private var terminal = false
    private var children: [Character: WordTrie] = [:]

    func contains(_ word: String) -> Bool {
        var node = self
        for character in word {
            guard let child = node.children[character] else { return false }
            node = child
        }
        return node.terminal
    }

    func inserting(_ word: String) -> WordTrie {
        inserting(Array(word)[...])
    }

    private func inserting(_ suffix: ArraySlice<Character>) -> WordTrie {
        var next = self
        guard let first = suffix.first else {
            next.terminal = true
            return next
        }
        let child = children[first] ?? WordTrie()
        next.children[first] = child.inserting(suffix.dropFirst())
        return next
    }

    func completions(for prefix: String) -> [String] {
        var node = self
        for character in prefix {
            guard let child = node.children[character] else { return [] }
            node = child
        }
        var result: [String] = []
        func collect(_ current: WordTrie, text: String) {
            if current.terminal { result.append(text) }
            for key in current.children.keys.sorted() {
                collect(current.children[key]!, text: text + String(key))
            }
        }
        collect(node, text: prefix)
        return result
    }
}

let words = ["car", "cart", "cat"].reduce(WordTrie()) { $0.inserting($1) }
let moreWords = words.inserting("care")
assert(words.contains("car"))
assert(!words.contains("ca"))
assert(words.completions(for: "car") == ["car", "cart"])
assert(moreWords.completions(for: "car") == ["car", "care", "cart"])
assert(!words.contains("care"))
```

The terminal flag distinguishes a prefix from a stored word. Both `car` and `cart` can exist because the node after `r` is terminal and also has a child.

The empty string is supported: inserting it marks the root terminal. Decide whether the domain permits it before exposing the operation to users.

## Value dictionaries change the update cost

The trie copies a node value, then updates one child dictionary. Swift's dictionary copy-on-write preserves the old version, but a mutation can copy that node's child storage.

The path length is the word's character count, yet total update cost also depends on child-map sizes and string handling. It is too strong to claim this exact representation always performs `O(length)` total work independent of branching.

A more sophisticated persistent map can reduce copying of large child dictionaries. A fixed alphabet array can offer another tradeoff when the alphabet is small and known. For natural-language input, those assumptions need scrutiny.

The conversion to an array of characters occurs once at the public insertion boundary. Recursing on `ArraySlice` avoids rebuilding the entire remaining character array at every step, though the slices retain the original character buffer during the call.

## Unicode and matching policy are part of the index

Swift `Character` represents extended grapheme clusters, not bytes. A trie over characters is convenient for user-facing strings, but its notion of a path must match the search policy.

Case folding, diacritic handling, locale rules, and normalization affect matching. Applying a different normalization during lookup than insertion creates missing results. Keep the normalization policy consistent and retain original display text separately when needed.

The sorted child traversal gives a deterministic order under Swift's comparison. It is not a locale-aware dictionary order or a relevance ranking. A search UI often wants popular completions first, which requires stored metadata and a separate ranking policy.

## Completion output can dominate the work

Locating a prefix is only the first part of completion. Enumerating every matching suffix can visit a large subtree and allocate many output strings. A common prefix may return almost the entire dictionary.

For an interactive UI, accept an output limit or expose an iterator that stops after enough results. If ranking requires global popularity, a simple traversal limit is insufficient: the first lexicographic words may not be the highest-ranked words.

The recursive collector also has depth proportional to the longest suffix. Input limits or an explicit traversal stack can bound call-stack risk. Persistent structure does not mean untrusted input can consume unlimited resources safely.

## Test against independent models

For the search tree, compare `sortedElements()` with `Array(Set(input)).sorted()` over small generated integer arrays. Verify membership for keys inside and outside the generated range, and retain older versions across updates.

For the trie, use a `Set<String>` as a reference. A completion result should contain exactly the stored words that have the chosen prefix under the same matching policy, in the documented order.

Include an empty word, a word that is another word's prefix, duplicate insertion, a missing prefix, and non-ASCII characters. These cases expose mistakes that a dictionary of unrelated ASCII words can miss.

## Compare both structures with independent membership models

Small exhaustive key domains make a strong check for the tree's observable set behavior:

```swift
let insertedKeys = [4, 1, 4, 7, -2, 0]
let testedTree = insertedKeys.reduce(SearchTree<Int>.empty) { $0.inserting($1) }
let keyModel = Set(insertedKeys)
assert(testedTree.sortedElements() == keyModel.sorted())
for key in -3...8 {
    assert(testedTree.contains(key) == keyModel.contains(key))
}

let wordInput = ["", "car", "cart", "café", "猫", "car"]
let testedTrie = wordInput.reduce(WordTrie()) { $0.inserting($1) }
let wordModel = Set(wordInput)
for prefix in ["", "ca", "car", "café", "猫", "missing"] {
    let expectedWords = wordModel.filter { $0.hasPrefix(prefix) }.sorted()
    assert(testedTrie.completions(for: prefix) == expectedWords)
}
assert(testedTrie.contains(""))
```

The model deliberately uses a different representation. It checks duplicate insertion, empty input keys, absent prefixes, and non-ASCII words without relying on the same recursive traversal as the implementation.

These fixtures do not establish every Unicode matching policy. If normalization is introduced, apply the same documented policy to the reference model and add explicit cases that distinguish canonical representation, case, and locale-sensitive behavior.

## Observe the unbalanced tree's shape directly

```swift
func height<Element>(_ tree: SearchTree<Element>) -> Int {
    switch tree {
    case .empty: return 0
    case let .node(left, _, right): return 1 + max(height(left), height(right))
    }
}

let ascendingTree = (1...8).reduce(SearchTree<Int>.empty) { $0.inserting($1) }
assert(height(ascendingTree) == 8)
assert(ascendingTree.sortedElements() == Array(1...8))
```

The tree remains semantically correct while its shape becomes poor. Correctness tests alone would not detect the missing performance guarantee, which is why complexity claims must be tied to maintained invariants.

For a balanced implementation, test balance metadata and search behavior independently. A tree can preserve sorted traversal while a broken rotation loses its promised height bound or duplicates a key.

## Deletion is a representation decision, not one extra branch

Removing a search-tree node with two children requires a replacement strategy, commonly the successor from the right subtree or predecessor from the left. The replacement and the path from which it was removed must be reconstructed without altering old versions.

A balanced tree must also restore its balance invariant. A removal method copied from an unbalanced teaching tree is not enough for a production AVL or red-black representation.

For a trie, clearing terminal status removes a word but may leave descendants. Pruning is allowed only when a node represents no word and has no children. The exercise below focuses on that distinction because prefix-related words make it observable immediately.

## Store metadata only with an update invariant

Completion counts, subtree sizes, or popularity totals can make queries faster. Every insertion and deletion must then keep metadata consistent with the subtree it summarizes.

Persistence can help because an updated path is already being rebuilt, giving each new node a place to calculate its metadata from its children. Untouched nodes can retain their existing summaries.

But a cached count copied unchanged at one modified node can make rank or limit queries wrong even while ordinary membership still works. Add tests that compare stored summaries with an independent traversal over small generated trees.

The same principle applies to a reverse index or a normalization cache: storing a derived fact improves one operation while creating a new consistency obligation for updates.

## Exercise: remove a word without removing its descendants

Implement trie removal by clearing the terminal flag at the word's node. Prune a child only when it is nonterminal and has no children. Removing `car` must preserve `cart`; removing `cart` must preserve `car`.

Retain the original trie and verify it still contains both words. Then add a completion limit and test zero, one, and a limit larger than the result set.

Swift's [Collections chapter](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/collectiontypes/) covers the arrays and dictionaries used as local building blocks. Return to the [Functional Programming roadmap](/swift-functional-programming/).
