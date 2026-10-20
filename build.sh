#!/bin/bash
set -e

echo "-------- removing cache"
rm -rf .jekyll-cache
rm -rf docs

# CNAME, robots.txt, and sitemap.xml are written into docs by Jekyll itself:
# CNAME and robots.txt are copied from the project root, and jekyll-sitemap generates sitemap.xml.
echo "-------- building "
bundle exec jekyll build --verbose
