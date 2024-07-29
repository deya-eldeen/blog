echo "-------- removing cache"
rm -rf .jekyll-cache

echo "-------- building"
bundle exec jekyll build --verbose

echo "-------- copying to root"
cp -rf _site/* .

rm -rf _site
