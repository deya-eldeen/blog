---
layout: post
title: "This is why I don't use GIT GUI tools."
date: "2023-01-30"
permalink: /this-is-why-i-dont-use-git-gui-tools
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/git_cli.jpg"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

Any seasoned iOS engineer who uses Xcode can see that it lacks a lot of git features, which is OK as it's not mainly a source control application.  
<!--more-->
{%
 include centered-image.html 
 image_path="images/covers/git_cli_full.jpg"
 alt_text="" 
 caption=""
%}

We can see only primitive features there, which may suffice for personal or small projects, but if you are working on a larger team, you will find it very difficult and sometimes impossible to use source control using the IDE only.

{%
 include centered-image.html 
 image_path="images/image-3.png"
 alt_text="" 
 caption="Xcode's Source Control
"
%}
  
Some Engineers may also notice that markers near files like "A", "M" and "C" etc.. are stuck most of the time too, so you wont be able to directly tell about file statuses if they are added, modified, conflicting, etc..  
  
Convincing backend engineers to use the terminal will be easier, because GUI will not automatically update repo's trunk on a server daily at 1:30 AM, but a cronjob that deals with the CLI can easily do this, on the other hand, convincing a mobile developer about this can be a bit more more difficult, because the need for this is not easily demonstrated.  
  
I will start directly with discussing few real life examples.. I'm sure I can think of dozens of cases, but let's keep this post small.. I will list the commands I use, so you can have an idea about the more power we can have in terminal.  
  
**1- PR Reverts:** a feature introduced by Github, PR reverts, say you have an already merged pull request, and you want to revert it before a tight-deadline like a branch cut, using Github's revert feature will not ask about details of commits to be removed, it most probably will remove commits that were merged in the PR, so you may easily end up removing extra stuff that is irrelevant by accident.  
  
But using such command, you will have fine-grained control about what commit to remove or keep.  
  
`git revert --no-commit someHash   `  
**2- Submodules:** if you have nested git repos (submodules), such feature maybe not be existent in most GUI tools.  
  
I normally have terminal open all day, and I can't live without it 🧐, I hate to push buttons without knowing exactly what each button does, tools can come and go, the CLI will be always what GUI tools are built on.  
  
It's convenient to set up install scripts, build scripts, deploy scripts, etc.. when working on a large team, one will have no idea what **_exactly_** happens in the GUI based app, and in the old times I've seen colleagues do bad things impossible to restore without the CLI 🤦🏻.  
  
I feel several times faster using the command line than clicking through with a mouse.  
  
GIT GUI tools were meant to mitigate complexity, but to me, they seem to add more complexity if the project is large, I once seen non-git standard terminology, which normally makes things harder in general.  
  
PS: the only real use of source control in Xcode is the diffing tools, it visualizes diffs perfectly. 🤓

Here is the table in Markdown format:

| Command                                                                                                                     |
|---------------------------------------------------------------------------------------------------------------------------|
| git add                                                                                                                 |
| git annotate                                                                                                            |
| git bisect                                                                                                              |
| git blame                                                                                                               |
| git checkout                                                                                                            |
| git checkout -b                                                                                                        |
| git cherry-pick                                                                                                        |
| git clean -fdx                                                                                                         |
| git clone                                                                                                               |
| git clone --single-branch                                                                                              |
| git commit                                                                                                              |
| git commit --amend -m "New commit message."                                                                            |
| git config                                                                                                              |
| git diff                                                                                                                |
| git diff --check                                                                                                       |
| git fetch                                                                                                               |
| git gc                                                                                                                  |
| git init                                                                                                                |
| git log                                                                                                                 |
| git log --all                                                                                                          |
| git log --oneline                                                                                                      |
| git log --summary                                                                                                      |
| git log -p                                                                                                              |
| git merge                                                                                                               |
| git pull --rebase                                                                                                      |
| git push                                                                                                                |
| git push --set-upstream origin                                                                                         |
| git push -u origin feature_branch_name                                                                                 |
| git rebase                                                                                                              |
| git remote -av                                                                                                         |
| git remote add                                                                                                         |
| git reset --hard                                                                                                       |
| git restore                                                                                                             |
| git revert                                                                                                              |
| git rm                                                                                                                  |
| git shortlog                                                                                                            |
| git show                                                                                                                |
| git stash                                                                                                               |
| git stash list                                                                                                         |
| git stash pop                                                                                                          |
| git status                                                                                                              |
| git tag                                                                                                                 |
| git worktree                                                                                                            |

common git commands that I use (sorted alphabetically)

