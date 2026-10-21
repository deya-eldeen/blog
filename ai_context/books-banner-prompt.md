# Books banner

Created October 20, 2026 with the built-in imagegen tool, editing `assets/img/hero/deya-studio.webp` as the character and scene reference.

Final asset: `assets/img/hero/deya-books.webp` (1536 × 1024, WebP). The Books page already selects this asset through its shared hero include.

## Initial prompt

```text
Use case: identity-preserve.
Asset type: Books page hero banner, landscape 1536x1024.
Input image 1: edit target and definitive character identity reference, the existing home banner.
Primary request: Edit this exact image so the SAME character is reading an open hardcover book at his desk instead of using a laptop. This is the same person, 100% same character design, not a reinterpretation. Preserve exact facial geometry, short dark buzz-cut hairstyle, hairline, skin tone, thick eyebrows, large brown eyes, black rectangular glasses and frame shape, ears, nose, shaped short dark beard and mustache, black knitted sweater, body proportions, and polished soft 3D clay animation rendering. Keep his face visible in the same three-quarter view with a gentle smile, subtly direct his eyes downward at the pages. His two hands naturally hold the open book in front of his torso. Replace the laptop entirely with the open book; no laptop remains.
Preserve the warm softly lit studio, wooden desktop, white mug, plant on the right atop the stacked books, floating Swift and Xcode icons, background, colors, camera angle and overall placement. Keep the subject at the same location and scale and generous light negative space on the left for webpage copy. Book is cream with a muted warm brown cover and realistic page block, no legible text or lettering. Keep the character's likeness faithful above all else. No extra people, no new labels or text, no watermark. Opaque background.
```

## Book cover refinement

Edited with the built-in imagegen tool using the approved reading banner and `images/books/ios_security_through_defensive_techniques.jpg`. Removed both floating logos, applied the supplied front cover, then turned the book to hide its back cover. Replaced the source and checked-in site assets.

### Cover edit prompt

```text
Use case: identity-preserve / precise-object-edit.
Asset type: Books webpage hero banner, preserve 1536x1024 landscape.
Input image 1 is the edit target: the approved character reading a brown book in the studio. Input image 2 is the exact front-cover artwork to place on the physical book.
Make only these changes:
1. Completely remove the floating orange Swift logo tile and the blue Xcode logo tile including the hammer. Restore softly blurred warm studio/window background in their places; no floating objects remain.
2. Replace the plain brown book with a physical copy of the supplied iOS Security Through Defensive Techniques book. Faithfully apply input image 2 as the FRONT cover, keeping its white upper portion, exact black and orange title, author names, navy illustrated security pattern on the lower portion, and white bottom strip with orange Packt mark. Title: "iOS Security Through Defensive Techniques"; authors "Deya Elkhawaldeh" and "Dave Poirier". Keep the artwork's proportions.
3. Adjust ONLY the book angle and the necessary hand positions so he still reads naturally, but the viewer sees the FRONT cover at a three-quarter angle on the viewer's right side of the book. The book is open only a modest amount, with the back cover turned away and fully occluded behind the front cover / pages. Do NOT show a second decorated panel, do NOT duplicate or invent the back-cover design. Only one front-cover panel is visible; natural cream page edges can be visible on the viewer's left side. The spine can be plain dark navy and very narrow. Keep the book below his face.
Preserve the exact approved character identity, face shape, skin tone, short dark buzz cut, hairline, beard, mustache, glasses, eyebrows, brown eyes looking down at the book, smile, black knitted sweater, build, and high-quality 3D clay rendering. Keep the character at the same scale and position. Preserve warm studio lighting, soft background, wooden desktop, white mug, plant and stack of books on the right, and large light empty area on the left for webpage text. No laptop, no additional props, no watermark, no text outside the cover. Do not redesign or change the face.
```

### Final angle correction prompt

```text
Edit input image 1 with ONE targeted correction: hide the blank back cover of the book. It is the large cream panel on the viewer's left of the navy spine; that panel must disappear from view. Rotate the entire physical book about its vertical axis so the front cover faces more toward the viewer and the back cover is behind it and fully occluded. The book can be held almost closed, slightly open toward the character at the top, with a small natural wedge of cream paper pages at the upper edge. Show ONLY ONE front cover face: the supplied iOS Security Through Defensive Techniques artwork from input image 2. No second panel next to it, no blank cover panel, no duplicate cover artwork. His left hand can support the lower left front edge of the book and his right hand the lower right front edge; he looks down and reads the slightly open book. Keep the book at the same location and size. Preserve all front cover details and title, authors and orange Packt mark from reference image 2 in the same clean proportions.
Keep absolutely everything else in image 1 unchanged: the exact approved character face, haircut, skin, expression, glasses, beard, black sweater, warm studio, desk, mug, plant and stack of books. Preserve the empty background with NO Swift or Xcode logos. Maintain exact 1536x1024 composition and character scale, no other edits.
```
