---
layout: post
hidden: true
title: "Splay Trees in Swift: Move Accessed Keys to the Root"
date: "2024-04-25"
last_modified_at: "2024-04-25"
permalink: /swift-splay-trees/
excerpt_separator: <!--more-->
author: deyaeldeen
categories: [Development, iOS, Programming, Swift]
tags: [Swift, Data Structures, Algorithms]
thumbnail: assets/img/article-placeholder.svg
katex: true
---
A splay tree reorganizes itself around accessed keys. After a successful search, the found node becomes the root. After a miss, a nearby boundary node becomes the root. There is no stored balance factor, yet a sequence of operations has a logarithmic amortized cost.

That guarantee is different from AVL's worst-case height bound. One splay operation can take linear time, and even a read-like lookup changes the structure.

<!--more-->

This Swift 5.7 implementation is a mutable reference tree with set semantics. It supports insertion and access, and deliberately makes the structural effect of `contains` visible through `rootKey`.

## Rotations bring the accessed region upward

A zig rotates a node above its parent. A zig-zig rotates twice along the same direction. A zig-zag rotates the child in one direction and the parent in the other.

Repeated single rotations that merely move the target upward do not automatically provide the same amortized argument. The paired restructuring is part of the splay algorithm.

```swift
final class SplayTree<Key: Comparable> {
    private final class Node {
        let key: Key
        var left: Node?
        var right: Node?
        init(_ key: Key) { self.key = key }
    }
    private var root: Node?
    var rootKey: Key? { root?.key }

    private func right(_ node: Node) -> Node {
        let child = node.left!
        node.left = child.right; child.right = node
        return child
    }
    private func left(_ node: Node) -> Node {
        let child = node.right!
        node.right = child.left; child.left = node
        return child
    }
    private func splay(_ node: Node?, key: Key) -> Node? {
        guard var node = node else { return nil }
        if key < node.key {
            guard let child = node.left else { return node }
            if key < child.key {
                child.left = splay(child.left, key: key)
                node = right(node)
            } else if key > child.key {
                child.right = splay(child.right, key: key)
                if child.right != nil { node.left = left(child) }
            }
            return node.left == nil ? node : right(node)
        }
        if key > node.key {
            guard let child = node.right else { return node }
            if key > child.key {
                child.right = splay(child.right, key: key)
                node = left(node)
            } else if key < child.key {
                child.left = splay(child.left, key: key)
                if child.left != nil { node.right = right(child) }
            }
            return node.right == nil ? node : left(node)
        }
        return node
    }
    func contains(_ key: Key) -> Bool {
        root = splay(root, key: key)
        return root?.key == key
    }
    func insert(_ key: Key) {
        root = splay(root, key: key)
        guard let old = root else { root = Node(key); return }
        guard old.key != key else { return }
        let added = Node(key)
        if key < old.key {
            added.left = old.left; added.right = old; old.left = nil
        } else {
            added.right = old.right; added.left = old; old.right = nil
        }
        root = added
    }
    func sortedKeys() -> [Key] {
        var output: [Key] = []
        var stack: [Node] = []
        var cursor = root
        while cursor != nil || !stack.isEmpty {
            while let node = cursor { stack.append(node); cursor = node.left }
            let node = stack.removeLast()
            output.append(node.key); cursor = node.right
        }
        return output
    }
}

let tree = SplayTree<Int>()
for key in [5, 2, 8, 1, 3, 7, 9] { tree.insert(key) }
assert(tree.contains(3) && tree.rootKey == 3)
assert(tree.contains(8) && tree.rootKey == 8)
assert(!tree.contains(6))
assert(tree.sortedKeys() == [1, 2, 3, 5, 7, 8, 9])
tree.insert(3)
assert(tree.sortedKeys().count == 7)
```

A miss still splays the search boundary. Do not assume `contains(false)` leaves a snapshot or iterator valid. The inorder sequence remains unchanged, while links and root can change.

## Why insertion can split around the splayed root

After splaying the search for a missing key, the root is at the boundary where that key belongs. If the new key is smaller, its left subtree comes from the old root's left side, and its right child is the old root. The old root's left link is cleared.

The symmetric construction handles larger keys. Clearing the transferred link prevents duplicate reachability and preserves the search invariant. Equal keys return early because this is a set, not a multiset.

## Amortized balance is not a height invariant

Splay trees can temporarily form long chains. The amortized proof uses a potential based on subtree sizes, often written schematically as:

$$
\Phi(T)=\sum_{v\in T}\log s(v).
$$

An expensive operation can reduce stored potential, paying for its cost across a sequence. The resulting amortized access bound is logarithmic under the standard splay analysis; it does not say each operation is fast.

The original treatment is Sleator and Tarjan's [Self-Adjusting Binary Search Trees](https://www.cs.cmu.edu/~sleator/papers/self-adjusting.pdf). Its stronger locality results explain why repeated access patterns can benefit from self-adjustment, but they should not be paraphrased as a worst-case balanced height guarantee.

## Access locality is the intended opportunity

Repeatedly accessing the same key becomes cheap after it reaches the root. Nearby or frequently accessed regions tend to move toward the top without an explicit frequency counter.

Whether this improves an app depends on its access distribution, comparison cost, and pointer locality. A balanced tree gives more predictable per-operation latency. A hash table may be better for unordered exact lookup.

Do not select splaying only because it avoids cached heights. It adds writes to lookups and can complicate concurrent readers, snapshots, and stable iterators.

## Recursion remains a practical limitation

The recursive splay helper can descend a linear-height tree. An iterative top-down implementation can avoid that call-stack risk, but needs careful temporary-chain assembly and final reattachment.

The iterative inorder traversal above avoids recursion for inspection only. It does not change the recursive helper's worst-case stack requirement. Resource guarantees should describe every relevant operation separately.

Keys must remain comparison-stable while stored. Mutable reference keys can invalidate the search ordering just as they can in an AVL or ordinary search tree.

## Test operations against a set model

Insert keys in ascending, descending, and mixed order. After every access, compare inorder output with the model and check that successful access places the requested key at the root.

Include misses below the minimum, above the maximum, and between existing keys. Repeatedly alternate between extremes to exercise restructuring paths. Duplicate insertion must preserve cardinality.

## Observe locality without claiming a universal speedup

```swift
let localityTree = SplayTree<Int>()
for key in 0..<80 { localityTree.insert(key) }
let unchangedKeys = localityTree.sortedKeys()
for _ in 0..<20 {
    assert(localityTree.contains(17))
    assert(localityTree.rootKey == 17)
}
assert(localityTree.sortedKeys() == unchangedKeys)
```

After the first successful access, the hot key is already at the root. This establishes the intended structural response, not a benchmark against AVL or dictionary lookup.

A performance comparison should include uniform, hot-set, sequential, and alternating-extreme accesses. Count comparisons and rotations separately. The splay structure may spend more writes to make later reads cheaper, and that tradeoff interacts with caching and concurrency.

## Iterators need a mutation policy

An inorder iterator retaining node references can become invalid when another lookup splays the tree. Membership has not changed, but the links defining traversal have.

A simple API can forbid mutation during iteration or return an independent key snapshot. A fail-fast iterator can track a structural generation and reject use after any splaying operation. Calling only insert and delete “mutations” would miss read-triggered restructuring.

The same issue affects concurrent readers. A method named `contains` is not observationally read-only for this class. An isolation boundary must protect its structural writes even when every caller believes it is merely asking a question.

## Exercise: implement deletion by joining subtrees

Splay the requested key. If present, detach its left and right subtrees, then join them by splaying the maximum of the left subtree before attaching the right subtree. Handle an empty left side separately. Test root removal, absent keys, and repeated deletion while comparing with a reference set.

Return to the [Data Structures and Algorithms roadmap](/swift-data-structures-and-algorithms/).
