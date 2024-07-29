echo "-------- removing cache"
rm -rf .jekyll-cache
rm -rf _site

echo "-------- building"
bundle exec jekyll build --verbose

echo "-------- copying to root"
cp -rf _site/* .

