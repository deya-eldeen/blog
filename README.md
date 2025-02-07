Run using docker
docker build -t jekyll-ubuntu . 
docker run --rm -it -p 4000:4000 -v "$(pwd)":/srv/jekyll jekyll-ubuntu

