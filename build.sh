echo "-------- removing cache"
rm -rf .jekyll-cache
rm -rf docs
echo "swiftbydeya.com" > docs/CNAME

echo "-------- building"
bundle exec jekyll build --verbose
