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
  - "Performance"
  - "Graphics"
  - "Optimization"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Performance"
  - "Graphics"
  - "Optimization"
---

When developing applications, especially those that handle a large number of images, you may notice a significant difference between the disk size of an image and the amount of RAM it consumes. For example, 
<!--more-->
you might have an image file that is only 0.3 MB on disk, yet it occupies around 10 MB of RAM when loaded. This post explores why this happens and what you can do to manage memory usage more effectively.

{%
 include centered-image.html 
 image_path="images/covers/imagesize_full.jpg"
 alt_text="" 
 caption=""
%}

## Root Of Discrepancy?
The primary reason for this discrepancy lies in how images are stored on disk versus how they are represented in memory. Images on disk are often compressed using formats like `JPEG` or `PNG`, which reduce file size by storing data more efficiently. However, when an image is loaded into RAM, it must be decompressed and converted into a raw bitmap format that the system can render on the screen. This raw format requires significantly more memory.

### The Formula for Memory Usage
To understand how much memory an image will consume, you can use the following formula:

$$
\scriptsize{\text{Image Size on RAM} = (\text{pixels height} \times \text{pixels width} \times \text{color depth bytes})}
$$

### Example: sRGB Image

Consider an image with dimensions 1568x960 pixels and an `sRGB` color profile, which uses 24 bits per pixel (or 3 bytes per pixel):

The following image takes around 131 KB on disk and has an `sRGB` color profile, which is 24 bits (8 bits per channel).

{%
 include centered-image.html 
 image_path="images/roman.jpg"
 alt_text="" 
 caption=""
%}

The size of the image on the RAM would be:

$$
\scriptsize{\text{Image Size on RAM} = (\text{1568} \times \text{960} \times \text{3}) \text{ bytes} = 4,515,840 \text{ bytes} = 4.3 MB}
$$

## Managing Image Memory Usage
High memory usage from images can lead to performance issues, especially in memory-constrained environments like mobile devices. To mitigate this, you can employ several strategies:

### Downsampling Images
One effective way to reduce memory usage is to downsample images before loading them into memory. Downsampling reduces the image dimensions to match the display size, thus reducing the number of pixels and the overall memory required.

### Example in Swift with Kingfisher
In Swift, [Kingfisher](https://github.com/onevcat/Kingfisher "Kingfisher") comes with an option to downsize images according to the screen scale, so you can have images in a reasonable size even if they come largely from the server.

```swift
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

> As the two images in this post are the same size and color profile, they will occupy the same amount of RAM!

### Understanding Image Compression Formats

While `JPEG` and `PNG` are common image formats, they handle compression differently:

- **`JPEG`**: Lossy compression, which reduces file size by discarding some image data. It's efficient for photos but less so for images with sharp edges or text.
- **`PNG`**: Lossless compression, which retains all image data. It’s better for images that need to preserve exact details but usually results in larger file sizes than `JPEG`.

Both formats, when decompressed, will expand into a full bitmap that occupies significantly more memory.

## Conclusion

Understanding how images are represented in memory versus on disk is crucial for optimizing your applications. While a compressed image file might be small, its memory footprint can be substantial due to the need to store it as a raw bitmap in RAM. By employing strategies like downsampling, you can better manage memory usage and improve your application's performance.