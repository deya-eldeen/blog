# OOP roadmap article covers

Completed October 21, 2026 using the built-in imagegen tool.

The Object-Oriented Programming roadmap contains 31 articles. Seven already had finished covers. The remaining 24 now have individually generated covers, each inspected and attached to its article before starting the next generation.

## Assets and generation records

Final images are opaque RGB WebPs, 640 × 400 pixels, under `images/covers/`. The generated-site copies are under `docs/images/covers/`. The 24 new assets total 432,692 bytes.

[manifest.json](manifest.json) records all 31 roadmap entries, article paths, final asset paths, and existing/new status. For each new cover it also records the exact final generation prompt, descriptive alternative text, and original generated PNG path. The original PNGs remain in the imagegen output directory.

Each new article attachment includes:

- `thumbnail` pointing to the article's unique cover.
- `thumbnail_ready: true` so cards display the cover.
- An opening `centered-image.html` illustration with descriptive alternative text and explicit dimensions.

The existing centered-image include and thumbnail rendering are reused. Dates, `hidden: true`, permalinks, article text, code examples, tables, and Mermaid blocks are preserved.

## Verification

- Matched the manifest against all 31 article links in the current roadmap source.
- Confirmed 31 unique cover files, valid WebP decoding, RGB output, and 640 × 400 dimensions.
- Confirmed source assets and built copies match byte for byte.
- Confirmed every roadmap card, article illustration, and social-preview image references the correct cover.
- Confirmed removing the 24 cover attachments reproduces the original article files, and all seven existing articles remain unchanged.
- Confirmed the hidden articles remain absent from all home feed pages.
- Ran a clean `bundle exec jekyll build`.
- Checked all 31 roadmap images in Chrome at 1440px and 390px, including lazy loading and viewport fit.
- Checked all 31 article covers decode in Chrome, preserve their aspect ratios, and fit the mobile viewport. No JavaScript errors occurred.
- Inspected desktop and mobile screenshots of the roadmap and an article cover.
- Ripwire quality delta reported zero regressions.
