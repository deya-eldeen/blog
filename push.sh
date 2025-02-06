./build
git add .
git commit -m "auto-build"
GIT_SSH_COMMAND='ssh -i ~/.ssh/deya' git push origin theme2
