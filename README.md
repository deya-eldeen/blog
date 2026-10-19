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

Set this to any published article's URL, including the leading and trailing slashes. Leave it empty to automatically feature the newest published article. An unmatched URL also falls back to the newest published article. The featured article is omitted from the latest-article cards on the first page to avoid duplication.

Restart `jekyll serve` after changing `_config.yml`, or rebuild the site with `bundle exec jekyll build`.

## Design and artwork

The shared responsive theme lives in `_sass/_reskin.scss`. It includes light and dark appearances, mobile navigation, article cards, and the styles for all content pages.

The generated header illustration is `assets/img/hero/deya-studio.webp`. Its generation prompt is recorded in `ai_context/header-image-prompt.md` alongside the original design references. Reference files are excluded from the built site.

Article thumbnails currently use `assets/img/article-placeholder.svg`. Once replacement artwork is ready, clear `article_placeholder` in `_config.yml` to show each article's existing `thumbnail` front matter again. Article body images are preserved.

The follow card links to the working RSS feed at `/feed.xml`.
