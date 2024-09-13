---
layout: post
title: "Using unicode markers (LTR: 0x200E, RTL:200F) to align \"hybrid RTL/LTR strings\" correctly."
date: "2022-03-03"
last_modified_at: "2024-09-08"
permalink: /invisible-markers-ltr-0x200e-rtl200f-to-align-text-correctly/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/arrows.webp"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Interface-Builder"
  - "Xcode"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Interface-Builder"
  - "Xcode"
redirect_from:
  - /using-invisible-markers-ltr-0x200e-rtl200f-to-align-hybrid-rtl-ltr-strings-correctly/
---

When dealing with text that contains both Arabic and English languages, aligning it correctly can be quite challenging. This is especially true when the text may start with English at times and Arabic at others, leading to potential misalignment issues. 

The use of specific Unicode characters, such as the Left-to-Right Mark (0x200E) and the Right-to-Left Mark (0x200F), can help manage the directionality of the text and ensure proper alignment. By strategically implementing these markers, developers can achieve a more coherent and visually appealing presentation of bilingual text, enhancing readability and user experience.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/arrows_full.webp"
 alt_text="" 
 caption=""
 width="960" 
 height="1568"
%}

## Working With Multiple Languages
It's common to encounter text that combines multiple languages, such as Arabic and English. However, this can lead to alignment issues, especially when the text direction changes unexpectedly. In this post, we'll explore how these challenges arise, examine a couple of solutions, and ultimately reveal the most effective method for ensuring proper text alignment using Unicode markers. Let's dive in! This introduction sets the stage for the discussion by highlighting the relevance of the topic and outlining what the reader can expect to learn.


### The following example illustrates
- This problem 🐛  
- A hacky way to solve it 👺  
- The correct way to solve it 🧐

{%
 include centered-image.html 
 image_path="/images/posts/rtl_ltr.webp"
 alt_text="" 
 caption=""
%}

#### Top line
Shows a line rendered incorrectly because the first word is Arabic, and it does not align as expected on the left 🤦🏻.

#### Middle line
One hacky solution is to always start your text with a left-to-right (LTR) word, like `text`, but this is not the best approach 👺.

#### Bottom line
This line displays correctly because it uses Unicode markers. The Unicode character set offers two markers: LTR (`0x200E`) and RTL (`0x200F`). These characters are invisible but control text direction. You can add `\u{200E}` to force the wrapping direction. ✅

## Playground example

```swift
import UIKit
import PlaygroundSupport

extension String {
    func withHighlighted(word: String) -> NSMutableAttributedString {
        let attributes = [
            [NSAttributedString.Key.foregroundColor:UIColor.blue],
            [NSAttributedString.Key.font: UIFont.boldSystemFont(ofSize: 14)]
        ]
        let range = (self as NSString).range(of: word)
        let result = NSMutableAttributedString(string: self)
        for attribute in attributes {
            result.addAttributes(attribute, range: range)
        }
        return result
    }
}

class MyViewController : UIViewController {
    
    override func loadView() {
        let view = UIView()
        let topLabel = UILabel()
        let middleLabel = UILabel()
        let bottomLabel = UILabel()
        topLabel.frame = CGRect(x: 40, y: 40, width: 300, height: 20)
        middleLabel.frame = CGRect(x: 40, y: 80, width: 300, height: 20)
        bottomLabel.frame = CGRect(x: 40, y: 120, width: 300, height: 20)
        let word1 = "عبد الله"
        let word2 = "added a new comment"
        let adjustor = "\u{200E}"
        topLabel.attributedText = "\(word1) \(word2)".withHighlighted(word: word1)
        middleLabel.attributedText = "note: \(word1) \(word2)".withHighlighted(word: word1)
        bottomLabel.attributedText = "\(adjustor) \(word1) \(word2)".withHighlighted(word: word1)
        view.addSubview(topLabel)
        view.addSubview(middleLabel)
        view.addSubview(bottomLabel)
        self.view = view
    }
    
}

PlaygroundPage.current.liveView = MyViewController()
```
