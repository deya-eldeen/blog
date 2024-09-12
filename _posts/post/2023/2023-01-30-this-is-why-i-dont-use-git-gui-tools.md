---
layout: post
title: "This is Why I Don't Use Git GUI Tools"
date: "2023-01-30"
last_modified_at: "2024-09-08"
permalink: /this-is-why-i-dont-use-git-gui-tools/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/git_cli.webp"
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
image_path="../images/covers/git_cli_full.webp"
alt_text=""
caption=""
 width="960" 
 height="1568"
%}

The features available in Xcode may suffice for personal or small projects, but when working within a larger team, relying solely on the IDE can lead to significant challenges in managing source control effectively.

{%
include centered-image.html
image_path="/images/posts/image-3.webp"
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

Here is a table of common Git commands that I frequently use, sorted alphabetically, along with their descriptions:

| Command                                                                                                                     | Description                                                                                                  |
|-----------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `git add`                                                                                                                 | Stages changes in your working directory for the next commit.                                               |
| `git annotate`                                                                                                            | Displays the last modification of each line in a file, showing who made the change and when.                |
| `git bisect`                                                                                                              | Uses binary search to find the commit that introduced a bug.                                               |
| `git blame`                                                                                                               | Shows what revision and author last modified each line of a file.                                          |
| `git checkout`                                                                                                            | Switches branches or restores working tree files.                                                           |
| `git checkout -b`                                                                                                        | Creates a new branch and switches to it.                                                                    |
| `git cherry-pick`                                                                                                        | Applies the changes introduced by an existing commit to your current branch.                                |
| `git clean -fdx`                                                                                                         | Removes untracked files from your working directory, including ignored files.                               |
| `git clone`                                                                                                               | Creates a copy of a remote repository on your local machine.                                               |
| `git clone --single-branch`                                                                                              | Clones only the specified branch from a remote repository.                                                  |
| `git commit`                                                                                                              | Records changes to the repository with a descriptive message.                                              |
| `git commit --amend -m "New commit message."`                                                                            | Modifies the most recent commit with a new commit message.                                                 |
| `git config`                                                                                                              | Configures Git settings, such as user information and repository-specific options.                          |
| `git diff`                                                                                                                | Shows changes between commits, commit and working tree, etc.                                               |
| `git diff --check`                                                                                                       | Checks for whitespace errors in the changes.                                                                |
| `git fetch`                                                                                                               | Downloads objects and refs from another repository without merging.                                         |
| `git gc`                                                                                                                  | Cleans up unnecessary files and optimizes the local repository.                                            |
| `git init`                                                                                                                | Initializes a new Git repository in the current directory.                                                 |
| `git log`                                                                                                                 | Displays the commit history for the current branch.                                                         |
| `git log --all`                                                                                                          | Shows the commit history for all branches.                                                                  |
| `git log --oneline`                                                                                                      | Displays a simplified view of the commit history, showing one line per commit.                             |
| `git log --summary`                                                                                                      | Provides a summary of changes made in each commit, including file additions and deletions.                  |
| `git log -p`                                                                                                              | Shows the patch (diff) introduced in each commit.                                                          |
| `git merge`                                                                                                               | Combines changes from different branches into the current branch.                                           |
| `git pull --rebase`                                                                                                      | Fetches changes from a remote repository and rebases your current branch on top of them.                   |
| `git push`                                                                                                                | Uploads local repository content to a remote repository.                                                   |
| `git push --set-upstream origin`                                                                                         | Sets the default remote branch for the current local branch.                                               |
| `git push -u origin feature_branch_name`                                                                                 | Pushes the local branch to the remote repository and sets it to track the remote branch.                   |
| `git rebase`                                                                                                              | Reapplies commits on top of another base tip, allowing for a cleaner project history.                       |
| `git remote -av`                                                                                                         | Displays the remote repositories associated with the local repository.                                      |
| `git remote add`                                                                                                         | Adds a new remote repository to your local Git configuration.                                               |
| `git reset --hard`                                                                                                       | Resets the current branch to the specified state, discarding all changes in the working directory.          |
| `git restore`                                                                                                             | Restores files in the working directory to their last committed state.                                      |
| `git revert`                                                                                                              | Creates a new commit that undoes the changes made by a previous commit.                                    |
| `git rm`                                                                                                                  | Removes files from the working directory and stages the removal for the next commit.                       |
| `git shortlog`                                                                                                            | Summarizes the commit history, grouped by author.                                                          |
| `git show`                                                                                                                | Displays information about a specific commit, including changes and commit message.                        |
| `git stash`                                                                                                               | Temporarily saves changes in your working directory that are not ready to be committed.                    |
| `git stash list`                                                                                                         | Lists all stashed changes.                                                                                    |
| `git stash pop`                                                                                                          | Restores the most recently stashed changes and removes them from the stash list.                           |
| `git status`                                                                                                              | Displays the state of the working directory and the staging area, showing which files are staged, modified, or untracked. |
| `git tag`                                                                                                                 | Creates a tag reference for a specific commit, often used for marking release points.                      |
| `git worktree`                                                                                                            | Manages multiple working trees attached to the same repository, allowing you to work on different branches simultaneously. |
