---
layout: post
title: "Algorithms & Data structures, Problem #001."
date: "2022-09-06"
categories: 
  - "algorithms"
---

After reading the very popular book, grokking algorithms,  
Will be blogging about algorithms and data structures... the book is very informative and easy to digest.

<figure>

![](images/grokking.jpeg)

<figcaption>

Grokking Algorithms book

</figcaption>

</figure>

It's advised you get yourself familiar with data structures before starting to solve problems...  
  
**Problem statement:** return a pair of 2 distinct values (if any) that sum up to a target number, from a non empty array that has distinct integers.  
  
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

I'm not going to explain each code, will leave analysis to you, doing a simple benchmark on 100,000 values array, we can see these results  
  
solution1: 31.88 s.  
solution2: 18.41 s.  
solution3: 0.38 s.  
solution4: 0.20 s. 🥇

<figure>

![](images/prob_001_graph-1024x687.png)

<figcaption>

Graphs depicting the complexity

</figcaption>

</figure>

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
```
