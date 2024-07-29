echo "-------- removing cache"
rm -rf .jekyll-cache
rm -rf docs

echo "-------- building"
bundle exec jekyll build --verbose

echo "-------- copying to root"
rm -rf _site
