---
layout: post
title: "Algorithms & Data structures, Problem #002"
date: "2022-09-08"
categories: 
  - "algorithms"
---

<figure>

![](images/subsequence_algorithm.jpg)

<figcaption>

photo from unsplash

</figcaption>

</figure>

Problem statement: Given 2 non empty arrays, write a function that determines if the second array is a subsequence of array 1. 
  
⚠️: Keep in mind, subsequence is not the same as subarray.

```
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
```

test results for these arrays

**let** myArray1 = Array(stride(from: -900005, through: 900005, by: 1))  
**let** myArray2 = Array(stride(from: -900000, through: 900000, by: 1))  
  
Time elapsed for solution1: 28.102 s.  
Time elapsed for solution2: 14.446 s. 🥇  
  
can you guess why Solution 2 is better, even though they have same time complexity? 🤓
