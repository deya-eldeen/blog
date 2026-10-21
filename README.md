# Swift By Deya

Personal Swift and iOS development blog, built with Jekyll.

## Local preview

```sh
bundle install
bundle exec jekyll serve
```

Open http://localhost:4000. To build the checked-in static site in `docs/`, run `bundle exec jekyll build`.

Docker is also supported with `./build_docker.sh` and `./run_docker.sh`.

## Featured article

Choose the home page's featured article by its permalink in `_config.yml`:

```yaml
featured_article: /lldb-survival-guide/
```

Set this to any published article's URL, including the leading and trailing slashes. Leave it empty to automatically feature the newest published article. An unmatched URL also falls back to the newest published article. The featured article is excluded before pagination, so each full page shows eight article cards in addition to the featured article on the first page.

Restart `jekyll serve` after changing `_config.yml`, or rebuild the site with `bundle exec jekyll build`.

## Hide articles from the home feed

Add `hidden: true` to an article's YAML front matter to exclude it from the home page's article cards and all subsequent pagination pages:

```yaml
layout: post
hidden: true
```

The article remains published at its URL and available in the archive, search, and roadmap. Remove the flag or set `hidden: false` to show it in the home feed again.

## Diagrams and tables in articles

Use a fenced `mermaid` block for a diagram. Pages containing these blocks automatically load the local Mermaid renderer; no front matter flag is required.

````markdown
```mermaid
classDiagram
    accTitle: A document and its paragraphs
    accDescr: A document owns zero or more paragraphs.
    Document "1" *-- "0..*" Paragraph : owns
```
````

Diagrams follow the site's light or dark appearance, scroll horizontally when needed, and include expandable source. Include `accTitle` and `accDescr` to describe the diagram for assistive technology. If rendering fails or JavaScript is disabled, the source remains available. For diagrams supplied by an include or raw `.mermaid` markup, `mermaid: true` in the page's front matter explicitly enables the renderer.

Standard Markdown tables render automatically:

```markdown
| Relationship | Swift example |
| --- | --- |
| Inheritance | A class subclasses another class |
| Conformance | A type adopts a protocol |
```

Tables have styled headers and alternating rows and can scroll horizontally on narrow screens. See `/swift-uml-class-diagrams/` for class diagrams, a sequence diagram, and comparison tables.

## Design and artwork

The shared responsive theme lives in `_sass/_reskin.scss`. It includes light and dark appearances, mobile navigation, article cards, and the styles for all content pages.

The generated header illustration is `assets/img/hero/deya-studio.webp`. Its generation prompt is recorded in `ai_context/header-image-prompt.md` alongside the original design references. Reference files are excluded from the built site.

Article thumbnails currently use `assets/img/article-placeholder.svg`. Once replacement artwork is ready, clear `article_placeholder` in `_config.yml` to show each article's existing `thumbnail` front matter again. Article body images are preserved.

To replace thumbnails one article at a time, set that article's `thumbnail` path and add `thumbnail_ready: true` in its front matter. It will show the new image while other articles keep their gray placeholders. LLDB uses `images/covers/lldb_thumbnail.webp` (1280 × 800); its original portrait cover remains in the article body.

The follow card links to the working RSS feed at `/feed.xml`.
