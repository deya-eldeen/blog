echo "-------- removing cache"
rm -rf .jekyll-cache
rm -rf docs
echo "swiftbydeya.com" > docs/CNAME

cp sitemap.xml docs/sitemap.xml
cp robots.txt docs/robots.txt

echo "-------- building "
bundle exec jekyll build --verbose
