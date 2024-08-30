---
layout: post
title: "Refresher: Problem Solving (1-4)"
date: "2022-11-16"
permalink: /problem_solving_swift_1_4
excerpt_separator: <!--more-->
thumbnail: "images/covers/algo.jpg"

---

After reading the very popular book, grokking algorithms,  
Will be blogging about algorithms and data structures… the book is very informative and easy to digest.
<!--more-->
![](images/covers/algo_full.jpg)

![](images/grokking.jpeg)

Grokking Algorithms book  

It’s advised you get yourself familiar with data structures before starting to solve problems… I will not go into details, my advice is to try to solve the problems without looking at the solutions  

**Problem: 1  
**return a pair of 2 distinct values (if any) that sum up to a target number, from a nonempty array that has distinct integers.  

Different Solutions with different time complexities

```
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

I’m not going to explain each code, you comment here if you have a question, will leave the analysis to you, doing a simple benchmark on a 100,000 values array, we can see these results  
  
solution1: 31.88 s.  
solution2: 18.41 s.  
solution3: 0.38 s.  
solution4: 0.20 s. 🏆

![](images/prob_001_graph-1024x687.png)

  
functions used for benchmarking

```
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

Problem: 2

Given 2 non empty arrays, write a function that determines if the second array is a subsequence of array 1.

⚠️: Keep in mind, subsequence is not the same as subarray.

// Time: O(n)
func isValidSubsequence_solution1(_ array: [Int], _ sequence: [Int]) -> Bool {
    
    // sequence is empty
    if (sequence.count == 0) {
      return false
    }
    
    // if arrays are equal, directly return true.
    if (array == sequence) {
        return true
    }
    
    // the sequence is larger than the array, return false.
    if (sequence.count > array.count) {
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
    
    // sequence is empty
    if (sequence.count == 0) {
      return false
    }
    
    // if arrays are equal, directly return true.
    if (array == sequence) {
        return true
    }
    
    // the sequence is larger than the array, return false.
    if (sequence.count > array.count) {
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

test results for these arrays

let myArray1 = Array(stride(from: -900005, through: 900005, by: 1))
let myArray2 = Array(stride(from: -900000, through: 900000, by: 1))

Time elapsed for solution1: 28.102 s.
Time elapsed for solution2: 14.446 s. 🏆

can you guess why Solution 2 is better, even though they have same time complexity? 🤓

Problem 3:

Write a function that takes in a non-empty array of integers that are sorted in ascending order and returns a new array with the squares of the original integers also sorted in ascending order.

let me add 4 solutions along with explanation.

// Bad solution, appending is expensive, it's better to init an array with the length
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

// same as before, but higher order functions is tuned for high performance
func sortedSquaredArray_solution3(_ array: [Int]) -> [Int] {
    return array.map { $0 * $0 }.sorted()
}

// Time: O(n) | Space O(n)
func sortedSquaredArray_solution4(_ array: [Int]) -> [Int] {
    var sortedSquares = Array(repeating: 0, count: array.count)
    
    var smallerValueIdx : Int = 0
    var largerValueIdx : Int = array.count - 1
    
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

for the following input

let myArraySortedSquares = Array(stride(from: -5000000, through: 5000000, by: 1))

Time elapsed for solution1: 6.786 s.
Time elapsed for solution2: 6.275 s.
Time elapsed for solution3: 5.106 s.
Time elapsed for solution4: 1.637 s. 🥇

Problem 4:

2 chess teams, competed for 1,000,000 times 🧐

given a 2D array of matches [host, guest]

Example
[[“Nepomniachtchi”, “Grischuk”], [“Karjakin”, “Grischuk”], [“Nepomniachtchi”, “Keymer”], [“Ding Liren”, “Grischuk”], [“Karjakin”, “Andreikin”], [“Carlsen”, “Gukesh D”], [“Aronian”, “Gukesh D”], [“Carlsen”, “Andreikin”], [“Nepomniachtchi”, “Gukesh D”], [“Aronian”, “Gukesh D”]]

and an array of results, where 1 means host team won
Example
[1, 1, 0, 0, 0, 0, 0, 1, 1, 1]

find the winning player, 

** for sake of simplicity, assume there is no draw in total points between players.

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
