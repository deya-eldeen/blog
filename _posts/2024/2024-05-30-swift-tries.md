---
layout: post
hidden: true
title: "Tries in Swift: Prefix Search, Deletion, and Unicode Policy"
date: "2024-05-30"
last_modified_at: "2024-05-30"
permalink: /swift-tries/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A trie indexes a key by its components rather than comparing the whole key at every search step. For words, each edge can represent a character. Prefix search then finds the node representing the prefix before enumerating its descendants.

That makes tries useful for autocomplete, but not automatically efficient for every string workload. Child storage, Unicode policy, result limits, and update behavior determine the actual cost.

<!--more-->

These Swift 5.7 examples build a mutable word trie with insertion, membership, prefix completion, and deletion. For an immutable alternative with version preservation, see [Persistent Trees and Tries](/swift-functional-trees-tries/).

## A prefix node is not necessarily a stored word

```swift
final class Trie {
    private final class Node {
        var terminal = false
        var children: [Character: Node] = [:]
    }
    private let root = Node()

    func insert(_ word: String) {
        var node = root
        for character in word {
            if node.children[character] == nil { node.children[character] = Node() }
            node = node.children[character]!
        }
        node.terminal = true
    }

    func contains(_ word: String) -> Bool {
        guard let node = node(for: word) else { return false }
        return node.terminal
    }

    private func node(for prefix: String) -> Node? {
        var node = root
        for character in prefix {
            guard let child = node.children[character] else { return nil }
            node = child
        }
        return node
    }

    func completions(for prefix: String, limit: Int) -> [String] {
        guard limit > 0, let start = node(for: prefix) else { return [] }
        var pending: [(Node, String)] = [(start, prefix)]
        var output: [String] = []
        while let (node, text) = pending.popLast() {
            if node.terminal {
                output.append(text)
                if output.count == limit { break }
            }
            for character in node.children.keys.sorted(by: >) {
                pending.append((node.children[character]!, text + String(character)))
            }
        }
        return output
    }

    @discardableResult
    func remove(_ word: String) -> Bool {
        let characters = Array(word)
        func remove(at node: Node, offset: Int) -> Bool {
            if offset == characters.count {
                let existed = node.terminal
                node.terminal = false
                return existed
            }
            let character = characters[offset]
            guard let child = node.children[character] else { return false }
            let removed = remove(at: child, offset: offset + 1)
            if !child.terminal && child.children.isEmpty {
                node.children.removeValue(forKey: character)
            }
            return removed
        }
        return remove(at: root, offset: 0)
    }
}

let trie = Trie()
for word in ["car", "cart", "care", "cat", ""] { trie.insert(word) }
assert(trie.contains("car") && !trie.contains("ca"))
assert(trie.completions(for: "car", limit: 2) == ["car", "care"])
assert(trie.remove("car"))
assert(!trie.contains("car") && trie.contains("cart"))
assert(trie.remove("cart") && trie.contains("care"))
assert(trie.contains(""))
assert(!trie.remove("missing"))
```

The terminal flag distinguishes `car` from the prefix `ca`, while allowing `car` to coexist with `cart`. The empty word is represented by the root's terminal flag. If a product forbids it, reject it at the input boundary.

## Deletion must preserve longer words

Removing a word first clears its terminal status. It prunes a node only if that node is nonterminal and childless. Removing `car` must not erase `cart`, and removing `cart` must not erase `car`.

Pruning proceeds back toward the root through the recursion. The root itself remains allocated. The recursive removal helper has depth proportional to word length; untrusted extraordinarily long keys need limits or an iterative parent-path implementation.

Because nodes are private and have no parent references, the representation avoids a strong parent-child ownership cycle. Exposing nodes would create additional mutation and lifetime obligations.

## State complexity with the key representation included

For a key of `L` characters, lookup follows `L` child edges. With expected constant-time child-map access and bounded component cost, this is expected `O(L)` traversal work.

Character hashing and comparison are not universally one-byte operations. Swift `Character` represents extended grapheme clusters, and Unicode processing can depend on contents. Include encoding and normalization costs when modeling real strings.

Completion costs prefix lookup plus visited subtree work and output construction. Returning one hundred words of length one hundred requires writing those output characters regardless of how quickly the prefix node was found.

$$
T_{\mathrm{completion}}\ \ge\ \Omega(\text{total output length}).
$$

Sorting child keys adds work at visited nodes. This implementation creates new strings while extending prefixes, which is simple but can add copying. A reusable mutable character path can reduce that overhead in a tuned implementation.

## A result limit is not a total work limit

The stack stops after enough terminal nodes are emitted. It may still examine many nonterminal nodes or enqueue many children first. A sparse deep subtree can require substantial work before the first result.

For user-controlled indexes, add a visited-node or time budget as well as an output limit. If results need popularity ranking, lexicographic DFS order is insufficient; store ranking metadata or use a priority frontier with a defined upper-bound policy.

The reverse child ordering in the code is intentional: a LIFO stack then visits the smallest character first. Reversing that detail changes output order without changing membership.

## Normalize consistently at insertion and query time

Case-insensitive or diacritic-insensitive search needs a shared normalization policy. Apply it before both insertion and lookup. Preserve original display strings separately when normalization loses information or several originals map to one key.

Locale-aware alphabetical order is another policy. Swift's comparison provides deterministic language-level ordering, not every locale's dictionary order. Do not use output order as a relevance ranking without defining it.

## Test against a simple word set

Build a `Set<String>` reference model. After each insertion or removal, compare membership and prefix results under the same normalization policy. Include duplicate insertion, empty words, words that prefix other words, missing prefixes, and non-ASCII keys.

Check limits zero, one, and larger than the result count. Verify deletion returns false for absent words and leaves existing completions unchanged.

## Compare updates against a set model

```swift
let checkedTrie = Trie()
var wordSet: Set<String> = []
for word in ["", "a", "an", "ant", "and", "猫", "ant"] {
    checkedTrie.insert(word)
    wordSet.insert(word)
}
for word in ["an", "missing", "ant", ""] {
    assert(checkedTrie.remove(word) == (wordSet.remove(word) != nil))
    for prefix in ["", "a", "an", "猫", "z"] {
        let expected = wordSet.filter { $0.hasPrefix(prefix) }.sorted()
        assert(checkedTrie.completions(for: prefix, limit: 100) == expected)
    }
}
```

The fixture removes an internal terminal word, a missing word, a longer word, and the empty word. It checks that pruning does not destroy another word's path.

## A radix trie compresses a different unit

A character trie can spend one node on each character of a long single-child path. A radix trie stores a string segment on that edge and splits it only where keys diverge.

Compression reduces node overhead but complicates insertion, deletion, and prefix queries ending inside a segment. The query prefix can match without landing exactly on an existing node, so reusing the current node-lookup helper unchanged would be wrong.

For a small autocomplete dictionary, the simpler character structure may be easier to maintain. Measure node count and query workload before introducing compressed edges, and keep a reference implementation for semantic comparison.

## Exercise: add frequency-ranked suggestions

Store a count for each terminal word and return the highest-frequency matches with a deterministic tie-breaker. Define whether reinserting a word increments its frequency or is idempotent. Compare a full subtree scan with a metadata-assisted approach and identify which updates must maintain that metadata.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
