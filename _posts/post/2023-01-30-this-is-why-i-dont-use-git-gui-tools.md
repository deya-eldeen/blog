---
layout: post
title: "This is Why I Don't Use Git GUI Tools"
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

Almost anyone who uses Xcode can quickly notice that it lacks many essential Git features, which is acceptable in some way since it's primarily a development environment rather than a dedicated source control application. 
<!--more-->
{%
include centered-image.html
image_path="images/covers/git_cli_full.jpg"
alt_text=""
caption=""
%}

The features available in Xcode may suffice for personal or small projects, but when working within a larger team, relying solely on the IDE can lead to significant challenges in managing source control effectively.

{%
include centered-image.html
image_path="images/image-3.png"
alt_text=""
caption="Xcode's Source Control"
%}

Many engineers have also observed that file status markers like "A" (added), "M" (modified), and "C" (conflicted) often remain stuck, making it difficult to determine the current state of files at a glance.

Convincing backend engineers to use the terminal is relatively straightforward, as GUI tools do not automatically update the repository's trunk on a server daily at 1:30 AM. However, a cron job that utilizes the CLI can easily perform this task. On the other hand, persuading mobile developers may be more challenging since the need for terminal usage is not always immediately apparent.

## Real-Life Examples of Using the Git CLI

Let’s explore a few real-life examples that highlight the advantages of using the Git CLI over GUI tools. While I could list numerous cases, I will keep this post concise by focusing on a couple of key commands that illustrate the power of the terminal.

### 1. PR Reverts

GitHub introduced a feature for reverting pull requests (PRs). If you have an already merged PR and need to revert it before a tight deadline, using GitHub's built-in revert feature does not provide details about which commits will be removed. This can lead to accidentally removing unrelated commits. 

By contrast, using the command:

```bash
git revert --no-commit someHash
```

gives you fine-grained control over which commits to remove or retain, allowing for a more precise and safe rollback.

### 2. Submodules

When dealing with nested Git repositories (submodules), many GUI tools lack robust support for managing these structures. The Git CLI, however, provides comprehensive commands to add, update, and manage submodules effectively.

I typically keep the terminal open throughout the day; I can't imagine working without it. I prefer understanding exactly what each command does rather than relying on button clicks in a GUI. While tools may come and go, the CLI remains the foundation upon which GUI tools are built.

## The Benefits of Using the Git CLI

Using the command line allows for the convenient setup of install scripts, build scripts, deployment scripts, and more. In a large team setting, it is often unclear what exactly happens within a GUI-based application. I've witnessed colleagues make irreversible mistakes that could only be rectified using the CLI.

I find that I am several times more productive using the command line compared to navigating through menus with a mouse. While Git GUI tools aim to simplify the process, they can inadvertently add complexity, especially in larger projects. I've encountered non-standard terminology in some GUI tools that can make understanding Git more difficult.

Xcode comes with a diffing tool, which visualize differences effectively. However, for serious Git users, mastering the command line is crucial. It provides the flexibility, control, and efficiency needed to manage complex projects and collaborate effectively with team members.

## Common Git Commands

Here is a table of common Git commands that I frequently use, sorted alphabetically:

| Command                                                                                                                     |
|-----------------------------------------------------------------------------------------------------------------------------|
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
