---
layout: post
title: "Why my 0.3 MB image occupies around 10 MB on RAM?"
date: "2022-02-22"
permalink: /why-my-0-3-mb-image-takes-14-mb-on-ram
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/imagesize.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

You are writing an application that has a long list of entries, with each entry containing an image, the total download size of all images is about 10 MB, but the images take around 200 ~ 300 MB on RAM, you wonder why 🧐?  
<!--more-->
{%
 include centered-image.html 
 image_path="images/covers/imagesize_full.jpg"
 alt_text="" 
 caption=""
%}

RAM normally does not understand images that are compressed, they are stored as raw bitmaps, even if the image is compressed, it gets inflated into memory as a raw image.  
  
Image Size on RAM = (pixels height × pixels width × color depth bytes)  
  
The following image takes around 300 KB on disk and has an sRGB color profile, which is 24 bits (8 bits per channel).`   `

<figure>

![](images/photo-1629820684221-d36e61748dc9-819x1024.jpeg)

<figcaption>

Unsplash (CC0)

</figcaption>

</figure>

The size of the image on the RAM would be:

`Image Size on RAM = (1665  ×  2081 × 3) bytes = 9.8MB`

In Swift, [Kingfisher](https://github.com/onevcat/Kingfisher "Kingfisher") comes with an option to downsize images according to the screen scale, so you can have images in a reasonable size even if they come largely from the server.

```
import UIKit
import Kingfisher

extension UIImageView {
    
    func setImageAsThumb(url:String) {
        let formattedURL = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let scale = UIScreen.main.scale
        let resizingProcessor = ResizingImageProcessor(referenceSize: CGSize(width: 50.0 * scale, height: 50.0 * scale))
        self.kf.setImage(with: URL(string: formattedURL), placeholder: nil, options: [.processor(resizingProcessor)])
    }

}
```
