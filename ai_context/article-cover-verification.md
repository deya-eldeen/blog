# Article cover verification

Verified October 20, 2026.

- Generated and attached all 44 previously missing article covers sequentially using built-in imagegen.
- Each cover is a unique, opaque RGB WebP measuring 640 × 400 pixels. Source assets and their generated-site copies match byte for byte.
- Each article uses its own new cover as both its ready thumbnail and opening illustration. Removing those additions reproduces each article from the starting revision `f14cac3` exactly.
- All 78 published posts have valid ready cover images. The two unpublished drafts already contain older body cover artwork and were outside the 44 uncovered articles.
- The full Jekyll build passed. Pagination contains 77 unique article cards plus the featured article, distributed as nine pages of eight cards and a final page of five. No article cards use placeholders.
- All 44 new images are served successfully by the live preview.
- Browser checks at 1440 and 390 pixels verified the first and last newly covered articles and the rewritten SwiftUI article: images decode at 640 × 400, preserve the 8:5 display ratio, and fit within the viewport.
- The SwiftUI article was rewritten using Apple and Swift documentation. Its five complete examples passed `swiftc -typecheck -swift-version 6` with Apple Swift 6.4. Its original permalink and cover were preserved.
- Ripwire quality delta reported zero regressions.

Final assets and generation prompts are listed in `sequential-article-covers.md`.
