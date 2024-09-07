---
layout: post
title: "Swift Sets: Basics and Practical Examples"
date: "2022-03-08"
last_modified_at: "2024-09-08"
permalink: /swift-set-data-structure-with-practical-example-pizza-cooking
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/venn.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Data-Structures"
  - "Math"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Data-Structures"
  - "Math"
---
Swift provides three main collection types: **Arrays**, **Sets**, and **Dictionaries**. In this post, we'll explore the basics of the `Set` data structure, understand its advantages, and walk through a practical example of using a set to manage ingredients for making pizza.

<!--more-->

{% 
include centered-image.html
image_path="images/covers/venn_full.jpg"
alt_text=""
caption="John Venn" 
%}

## What is a Set?

A `Set` in Swift is a collection of unique, unordered elements. Unlike arrays, sets do not maintain any particular order, and each value in a set is guaranteed to be unique.

> "You use a set instead of an array when you need to test efficiently for membership and you aren't concerned with the order of the elements in the collection, or when you need to ensure that each element appears only once in a collection."  
> — Swift Documentation

Sets are fundamental in many areas of mathematics and computer science, particularly in set theory, which forms the basis of many mathematical concepts.

{% 
include centered-image.html
image_path="images/220px-Venn_A_intersect_B.svg.png"
alt_text="Venn Diagram"
caption="A Venn diagram showing the intersection of two sets (Source: Wikipedia)" 
%}

## Basic Set Operations

Swift provides a rich set of methods and properties to work with sets, allowing you to perform operations such as union, intersection, difference, and more. These operations are similar to those in mathematics.

### Common Set Operations

- **Union**: Combines all elements from two sets.
- **Intersection**: Returns only elements that exist in both sets.
- **Difference**: Returns elements in one set but not in the other.
- **Subset**: Checks if all elements of one set are contained in another.
- **Superset**: Checks if a set contains all elements of another set.

In addition to these basic operations, Swift's `Set` type supports many higher-order functions like `map`, `filter`, and more.

```swift
func filter
func isSubset
func isSuperset
func isDisjoint
func subtracting
func isStrictSuperset
func isStrictSubset
func intersection
func map<T>
func dropFirst
func dropLast
func drop
func prefix
func suffix
func split
func firstIndex
func shuffled<T>
func shuffled
func flatMap<ElementOfResult>
func forEach
func first
func withContiguousStorageIfAvailable<R>
func enumerated
func min
func max
func starts<PossiblePrefix>
func elementsEqual<OtherSequence>
func lexicographicallyPrecedes<OtherSequence>
func contains
func allSatisfy
func reduce<Result>
func reversed
func flatMap<SegmentOfResult>
func compactMap<ElementOfResult>
func sorted
func index
func formIndex
func distance
func randomElement<T>
func randomElement
func makeIterator
func isSubset<S>
func isStrictSubset<S>
func isSuperset<S>
func isStrictSuperset<S>
func isDisjoint<S>
func union<S>
func subtracting<S>
func intersection<S>
func symmetricDifference<S>
func hash
func joined
func joined<Separator>
func encode
func mapValues<T>
func compactMapValues<T>
func merging<S>
func merging
```

## Practical Example: Pizza Cooking with Sets

Let's dive into a practical example to illustrate how sets can be used in a real-world scenario: 

### managing ingredients for making pizza

This Swift code helps manage kitchen inventory and shopping lists for making pizza. It defines three sets: 
- items currently in the kitchen
- items to be purchased
- necessary pizza ingredients. 

The code performs a union operation to combine the kitchen and shopping list items, identifies missing ingredients by subtracting the kitchen items from the shopping list, and updates the kitchen inventory accordingly. 

Finally, it checks if all required pizza ingredients are available, determining whether pizza can be made. Overall, the code efficiently ensures that you have everything needed to prepare a delicious pizza.

```swift
// Data
var myKitchenItemsSet: Set = ["Mozzarella","Mushrooms","Pineapples","Tomatoes","Mushrooms","Garlic"]
let shoppingListItemsSet: Set = ["Olives", "Tomatoes","Sourdough"]
let pizzaIngredientsSet: Set = ["Sourdough","Mozzarella","Mushrooms","Tomatoes","Olives"]

// Perform union operation to combine kitchen items and shopping list
let union1 = myKitchenItemsSet.union(shoppingListItemsSet)
let union2 = shoppingListItemsSet.union(myKitchenItemsSet)

// Although union1 and union2 may appear different when printed, they are equal in content
print("union1:", union1)
print("union2:", union2)
print("Are the unions equal?", (union1 == union2))

// Find out what items are needed to complete the pizza ingredients
let itemsNeeded = shoppingListItemsSet.subtracting(myKitchenItemsSet)
print("What I need to buy:", itemsNeeded)

// Add the needed items to the kitchen items
myKitchenItemsSet.formUnion(itemsNeeded)

// Check if all pizza ingredients are available in the kitchen
let canMakePizza = pizzaIngredientsSet.isSubset(of: myKitchenItemsSet)
print("Can make pizza:", canMakePizza)
```

### Explanation of the Code

- **Defining Sets**: We start by defining sets for kitchen items, shopping list items, and pizza ingredients. Notice that duplicates in the set are automatically removed.
- **Union Operation**: We perform a union operation to combine items from the kitchen and the shopping list. Even though the order of union operations might differ, the sets remain equal.
- **Subtraction**: We subtract the kitchen items from the shopping list to find out what needs to be purchased.
- **Forming Union**: We then update the kitchen items set by adding the items we need to buy.
- **Subset Check**: Finally, we check if we have all the ingredients necessary to make the pizza.

## A More Advanced Example: Cooking for a Special Guest

Let's say you're cooking a special pizza for Justin Bieber, who has some unusual ingredient preferences:

```swift
var pizzaIngredientsForJustinSet: Set = ["Sourdough","Mozzarella","Tomatoes","Olives","Amanita phalloides"]

print("Can I make pizza for Justin?", pizzaIngredientsForJustinSet.isSubset(of: myKitchenItemsSet))

// Adding special ingredients to the kitchen
myKitchenItemsSet.insert("Rotten Mushrooms")
myKitchenItemsSet.insert("Amanita phalloides")

print("Can I make pizza for Justin now?", pizzaIngredientsForJustinSet.isSubset(of: myKitchenItemsSet))
```

Here, we check if we can make a pizza with Justin's preferred ingredients. Initially, it won’t work until we add the special ingredient "Amanita phalloides" to our kitchen items.

## Bridging Between Set and NSSet

Swift allows you to bridge between `Set` and `NSSet` using the `as` operator. However, for bridging to be possible, the `Element` type of a set must be a class or a type that bridges to a Foundation type.

## Performance Considerations

Sets are generally faster to process compared to arrays because of their unique, unordered nature. However, this comes at the cost of not being able to store duplicate values or maintain element order.

## Conclusion

Swift's `Set` data structure is a powerful tool for managing collections of unique items. Whether you're working with ingredients in a kitchen or handling more complex data sets, understanding and leveraging sets can lead to more efficient and cleaner code.
