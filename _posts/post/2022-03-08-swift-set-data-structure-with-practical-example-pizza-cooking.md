---
layout: post
title: "Swift (Set Data-Structure) Basics, With Practical Example : Pizza Cooking"
date: "2022-03-08"
categories: 
  - "data-structures"
  - "development"
  - "math"
  - "programming"
  - "swift"
tags: 
  - "data-structures"
  - "development"
  - "math"
  - "programming"
  - "swift"
permalink: /swift-set-data-structure-with-practical-example-pizza-cooking
excerpt_separator: <!--more-->
thumbnail: "images/covers/pizza.jpg"

---
Swift provides three main collection types, **Arrays**, **Sets**, and **Dictionaries**..  
<!--more-->
![](images/covers/pizza_full.jpg)

A set is a collection of unique and unordered data, simply, the data elements has no order. and it's guaranteed to have non-duplicate values.

> You use a set instead of an array when you need to test efficiently for membership and you aren't concerned with the order of the elements in the collection, or when you need to ensure that each element appears only once in a collection.
> 
> Swift Source Code.

Asking about the importance of sets is like asking about the importance of the alphabet, [set theory](https://en.wikipedia.org/wiki/Set_theory "set theory") is the basic to so much math, any practical application of anything in math is normally an application of set theory.

<figure>

![](images/220px-Venn_A_intersect_B.svg.png)

<figcaption>

a Venn diagram, showing the intersection of two sets (Wikipedia)

</figcaption>

</figure>

The basic operations on sets are Union, Intersection, Difference, isSubset, isSuperset.. but swift provide a lot of functions, you can perform set operations with another set, an array, or any other sequence type 🧐, you can use higher order functions like map and filter... etc.

```
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

let's start with a simple example

```
// Data
var myKitchenItemsSet: Set = ["Mozzarella","Mushrooms","Pineapples","Tomatoes","Mushrooms","Garlic"]
let shoppingListItemsSet: Set = ["Olives", "Tomatoes","Sourdough"]
let pizzaIngredientsSet: Set = ["Sourdough","Mozzarella","Mushrooms","Tomatoes","Olives"]

// the order of union operator is not important, even union1 and union2 show up differnlt when printing!
let union1 = myKitchenItemsSet.union(shoppingListItemsSet)
let union2 = shoppingListItemsSet.union(myKitchenItemsSet)

// union1 and union2 show up differently when printed, but keep in mind that they are equal

print("union1",union1)
print("union2",union2)
print("areUnionsEqual",(union1 == union2))

let itemsNeeded = shoppingListItemsSet.subtracting(myKitchenItemsSet)
print("What I need to buy:",itemsNeeded)

// Buy the needed elements
myKitchenItemsSet.formUnion(itemsNeeded)

let canMakePizza = pizzaIngredientsSet.isSubset(of: myKitchenItemsSet)
print("canMakePizza",canMakePizza)
```

Defining a set is straightforward, you can explicitly define the type to be a Set, notice how you can't have multiple types directly, you can't mix integers with strings for example, in the example the type was inferred though.  
  
Next we created two unions to proof that the order of the union has no value, it's like addition, even though the union sets get printed with random order in the terminal.  
  
Then we used Subtraction to look up the items that we need to have on the shopping list, in other words, remove items already in the kitchen even if they are in the pizza recipe.  
  
We can add the items needed into my kitchen items, notice that how duplicate items are ignored, lastly we check if the kitchen items "has" all the items in the pizza recipe.  
  
Say you want to make a pizza for Justin Bieber?

```

var pizzaIngredientsForJustinSet: Set = ["Sourdough","Mozzarella","Tomatoes","Olives","Amanita phalloides"]

print("can I make Pizza for the Justin?",pizzaIngredientsForJustinSet.isSubset(of: myKitchenItemsSet))

myKitchenItemsSet.insert("Rotten Mushrooms")
myKitchenItemsSet.insert("Amanita phalloides")

print("can I make Pizza for the Justin Bieber?",pizzaIngredientsForJustinSet.isSubset(of: myKitchenItemsSet))
```

Yes, this will not work until you add "[Amanita phalloides](https://en.wikipedia.org/wiki/Amanita_phalloides "Amanita phalloides")" 👍  
  
**Bridging between Set and NSSet**

> You can bridge between `Set` and `NSSet` using the `as` operator, For bridging to be possible, the `Element` type of a set must be a class, or a type that bridges to a Foundation type.
> 
> Swift Source Code.

**Performance**  
  
Sets are in general **faster** to process, but due to their restriction of non-repeated values, and having no order, they are not often used.
