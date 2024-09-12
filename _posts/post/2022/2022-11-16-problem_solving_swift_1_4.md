---
layout: post
title: "Refresher: Solving Few Problems"
date: "2022-11-16"
last_modified_at: "2024-09-08"
permalink: /problem_solving_swift_1_4/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/algo.webp"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Math"
  - "Algorithms"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Math"
  - "Algorithms"
---

After reading the very popular book, Grokking Algorithms, I decided to blog about algorithms and data structures. I find the book is very informative and easy to digest.

<!--more-->
{%
 include centered-image.html 
 image_path="../images/covers/algo_full.webp"
 alt_text="" 
 caption=""
%}

{%
 include centered-image.html 
 image_path="/images/grokking.webp"
 alt_text="" 
 caption="Grokking Algorithms book"
%}

Understanding data structures is essential before diving into problem-solving. While I won't go into detailed explanations here, I recommend attempting to solve the problems on your own without immediately referring to the solutions.

## Problem 1  
**Return a pair of two distinct values (if any) that sum up to a target number, from a nonempty array that contains distinct integers.**

Here are different solutions with varying time complexities:

```swift
// Time: O(n^2)
func solution1(_ array: [Int], _ targetSum: Int) -> [Int] {
    for i in 0 ..< array.count-1 {
        for j in i+1 ..< array.count {
            if array[i] + array[j] == targetSum {
                return [array[i],array[j]]
            }
        }
    }
    return []
}
// Time: O(n^2)
func solution2(_ array: [Int], _ targetSum: Int) -> [Int] {
    for i in array {
        for j in array {
            if (i != j) && targetSum == (i + j) {
                return [i,j]
            }
        }
    }
    return []
}
// Time: O(n*log(n))
func solution3(_ array: [Int], _ targetSum: Int) -> [Int] {
    let sorted = array.sorted()
    var leftPointer = 0
    var rightPointer = sorted.count - 1
    while leftPointer < rightPointer {
        let leftMost = sorted[leftPointer]
        let rightMost = sorted[rightPointer]
        let currentSum = leftMost + rightMost
        if currentSum == targetSum {
            return [leftMost, rightMost]
        } else if currentSum < targetSum {
            leftPointer = leftPointer + 1
        } else if currentSum > targetSum {
            rightPointer = rightPointer - 1
        }
    }
    return []
}
// Time: O(n)
func solution4(_ array: [Int], _ targetSum: Int) -> [Int] {
    var numberDictionary = [Int: Bool]()
    for number in array {
        let mayMatch = targetSum - number
        if let exists = numberDictionary[mayMatch], exists {
            return [mayMatch, number]
        } else {
            numberDictionary[number] = true
        }
    }
    return []
}
```

### Analysis:

Each solution has its trade-offs in terms of time complexity. Running a simple benchmark on an array with 100,000 values yields the following results:

- solution1: 31.88 s.
- solution2: 18.41 s.
- solution3: 0.38 s.
- solution4: 0.20 s. 🏆

As you can see, solution 4 is the most efficient in this case, with a time complexity of O(n).

{%
 include centered-image.html 
 image_path="/images/prob_001_graph-1024x687.webp"
 alt_text="" 
 caption=""
%}
  
The functions used for benchmarking are:

```swift
func printTimeElapsedWhenRunningCode(title:String, operation:()->()) {
    let startTime = CFAbsoluteTimeGetCurrent()
    operation()
    let timeElapsed = CFAbsoluteTimeGetCurrent() - startTime
    print("Time elapsed for \(title): \(timeElapsed) s.")
}
func timeElapsedInSecondsWhenRunningCode(operation: ()->()) -> Double {
    let startTime = CFAbsoluteTimeGetCurrent()
    operation()
    let timeElapsed = CFAbsoluteTimeGetCurrent() - startTime
    return Double(timeElapsed)
}
```

## Problem 2
Given two non-empty arrays, write a function that determines if the second array is a subsequence of the first array.

> Keep in mind that a subsequence is not the same as a subarray.

```swift
// Time: O(n)
func isValidSubsequence_solution1(_ array: [Int], _ sequence: [Int]) -> Bool {
    if sequence.isEmpty {
        return false
    }
    if array == sequence {
        return true
    }
    if sequence.count > array.count {
        return false
    }
    var arrIdx = 0
    var seqIdx = 0
    while arrIdx < array.count, seqIdx < sequence.count {
        if array[arrIdx] == sequence[seqIdx] {
            seqIdx += 1
        }
        arrIdx += 1
    }
    return seqIdx == sequence.count
}

// Time: O(n)
func isValidSubsequence_solution2(_ array: [Int], _ sequence: [Int]) -> Bool {
    if sequence.isEmpty {
        return false
    }
    if array == sequence {
        return true
    }
    if sequence.count > array.count {
        return false
    }
    var seqIdx = 0
    for value in array {
        if seqIdx == sequence.count {
            break
        }
        if value == sequence[seqIdx] {
            seqIdx += 1
        }
    }
    return seqIdx == sequence.count
}
```

### Test Results:

Using these arrays:

```swift
let myArray1 = Array(stride(from: -900005, through: 900005, by: 1))
let myArray2 = Array(stride(from: -900000, through: 900000, by: 1))
```

The results were:
- Time elapsed for solution1: 28.102 s.
- Time elapsed for solution2: 14.446 s. 🏆

Solution 2 is more efficient, even though both solutions have the same time complexity. Can you guess why? 🤓

## Problem 3
Write a function that takes in a non-empty array of integers sorted in ascending order and returns a new array with the squares of the original integers, also sorted in ascending order.

Here are four solutions along with explanations:

```swift
// Bad solution, appending is expensive; it's better to initialize an array with the required length.
func sortedSquaredArray_solution1(_ array: [Int]) -> [Int] {
    var sortedSquares = [Int]()
    for value in array {
        sortedSquares.append(value * value)
    }
    return sortedSquares.sorted()
}
// Time: O(nlog(n)) | Space O(n)
func sortedSquaredArray_solution2(_ array: [Int]) -> [Int] {
    var sortedSquares = Array(repeating: 0, count: array.count)
    for (idx, value) in array.enumerated() {
        sortedSquares[idx] = value * value
    }
    return sortedSquares.sorted()
}
// Using higher-order functions for high performance.
func sortedSquaredArray_solution3(_ array: [Int]) -> [Int] {
    return array.map { $0 * $0 }.sorted()
}
// Time: O(n) | Space O(n)
func sortedSquaredArray_solution4(_ array: [Int]) -> [Int] {
    var sortedSquares = Array(repeating: 0, count: array.count)
    var smallerValueIdx = 0
    var largerValueIdx = array.count - 1
    for idx in stride(from: array.count - 1, through: 0, by: -1) {
        let smallerValue = array[smallerValueIdx]
        let largerValue = array[largerValueIdx]
        if abs(smallerValue) > abs(largerValue) {
            sortedSquares[idx] = smallerValue * smallerValue
            smallerValueIdx += 1
        } else {
            sortedSquares[idx] = largerValue * largerValue
            largerValueIdx -= 1
        }
    }
    return sortedSquares
}
```

### Benchmarking:

For the input:

```swift
let myArraySortedSquares = Array(stride(from: -5000000, through: 5000000, by: 1))
```

- Time elapsed for solution1: 6.786 s.
- Time elapsed for solution2: 6.275 s.
- Time elapsed for solution3: 5.106 s.
- Time elapsed for solution4: 1.637 s. 🥇

## Problem 4

Given a 2D array of matches `[host, guest]` and an array of results where 1 means the host team won, determine the player with the most wins.

Example:

```swift
let matches = [
    ["Nepomniachtchi", "Grischuk"],
    ["Karjakin", "Grischuk"],
    ["Nepomniachtchi", "Keymer"],
    ["Ding Liren", "Grischuk"],
    ["Karjakin", "Andreikin"],
    ["Carlsen", "Gukesh D"],
    ["Aronian", "Gukesh D"],
    ["Carlsen", "Andreikin"],
    ["Nepomniachtchi", "Gukesh D"],
    ["Aronian", "Gukesh D"]
]
let results = [1, 1, 0, 0, 0, 0, 0, 1, 1, 1]
```

```swift
import Foundation
let HOST_TEAM_WON = 1
let WIN_POINTS = 1
// O(n) time | O(k) space , where n: are matches and k is the number of teams
func chessWinner(_ matches: [[String]], _ results: [Int]) -> String {
    var bestPlayer = ""
    var scores = [String: Int]()
    scores[bestPlayer] = 0
    for (idx, match) in matches.enumerated() {
        let (host, guest) = (match[0], match[1])
        let winning = (results[idx] == HOST_TEAM_WON) ? (host) : (guest)
        if scores[winning] == nil { scores[winning] = 0}
        scores[winning] = scores[winning]! + WIN_POINTS
        if scores[winning]! > scores[bestPlayer]! {
            bestPlayer = winning
        }
    }
    return bestPlayer
}
```

```swift
func generateData() -> ([[String]] , [Int]) {
    let players1 = ["Carlsen", "Ding Liren", "Nepomniachtchi", "Karjakin", "Aronian"]
    let players2 = ["Keymer", "Vitiugov", "Gukesh D", "Andreikin", "Grischuk"]
    var matches = [[String]] ()
    var results = [Int]()
    let possibleResults = [0,1]
    for _ in 0 ..< 10 {
        matches.append([players1.randomElement() ?? "", players2.randomElement() ?? ""])
        results.append(possibleResults.randomElement() ?? 0)
    }
    print(matches)
    print(results)
    return (matches, results)
}
func problem_04_solutions() {
    let data = generateData()
    printTimeElapsedWhenRunningCode(title:"solution1") {
        let winner = chessWinner(data.0, data.1)
        print(winner)
    }
}
```
