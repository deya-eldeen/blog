---
layout: post
title: "Algorithms & Data structures, Problem #003"
date: "2022-09-08"
categories: 
  - "algorithms"
---

![](images/benjamin-bousquet-bli6Z7xsPGE-unsplash.jpg)

Write a function that takes in a non-empty array of integers that are sorted in ascending order and returns a new array with the squares of the original integers also sorted in ascending order.  
  
let me add 4 solutions along with explanation.  

```
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
```

for the following input  
  
let myArraySortedSquares = Array(stride(from: -5000000, through: 5000000, by: 1))

**Time elapsed for solution1: 6.786 s.**  
**Time elapsed for solution2: 6.275 s.**  
**Time elapsed for solution3: 5.106 s.**  
**Time elapsed for solution4: 1.637 s.** 🥇  
  
First solution, used appending, which is expensive, second one, have a fixed size array with only writing, next, we reduce the time by using higher order functions that have performance tuned implementations out of the box like parallelism etc.  
  
solution 4 can be optimized even more, you have an idea how?
