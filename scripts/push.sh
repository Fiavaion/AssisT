#!/bin/bash

# --- Automated Conventional Commit & Push Script ---
echo "--- Starting Automated Commit & Push Process ---"

# 1. Stage all changes (equivalent to git add .)
git add .
echo "Staged all changes for commit."

# 2. Prompt for the Conventional Commit message
# Format required: <type>[optional scope]: <description> (e.g., feat(ui): add new settings toggle)
read -p "Enter Conventional Commit message: " commit_message

# Check if commit message is empty
if [ -z "$commit_message" ]; then
  echo "Commit message cannot be empty. Aborting commit."
  exit 1
fi

# 3. Commit the staged changes
git commit -m "$commit_message"

# Check if the commit was successful
if [ $? -ne 0 ]; then
  echo "Commit failed or no changes to commit. Aborting push."
  exit 1
fi

# 4. Determine the current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 5. Pull (Rebase) to maintain linear history for safer rollbacks
echo "Pulling latest changes from origin/$BRANCH with rebase..."
git pull --rebase origin "$BRANCH"

if [ $? -ne 0 ]; then
  echo "Rebase/Pull failed. Please resolve conflicts manually before re-running."
  echo "Use 'git rebase --abort' or 'git rebase --continue' as appropriate."
  exit 1
fi

# 6. Push the committed changes
echo "Pushing changes to origin/$BRANCH..."
git push origin "$BRANCH"

if [ $? -eq 0 ]; then
  echo "SUCCESS: Commit '$commit_message' pushed to $BRANCH."
else
  echo "ERROR: Push failed. Check connectivity or remote repository status."
fi
