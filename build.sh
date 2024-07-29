echo "-------- removing cache"
rm -rf .jekyll-cache

echo "-------- building"
bundle exec jekyll build --verbose

echo "-------- copying to root"
cp -r _site/* . 

