#!/bin/bash
# Run this in Terminal to push your project to GitHub
# You'll be prompted for your GitHub username and a Personal Access Token (as password)

cd "$(dirname "$0")"

echo "Pushing to https://github.com/IsaacChen89/aceL---AI-learning-platform.git"
echo ""
echo "When prompted:"
echo "  Username: IsaacChen89"
echo "  Password: Use a Personal Access Token (not your GitHub password)"
echo "  Create one at: https://github.com/settings/tokens (select 'repo' scope)"
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "Success! Your code is now at: https://github.com/IsaacChen89/aceL---AI-learning-platform"
else
  echo ""
  echo "Push failed. Make sure you have a Personal Access Token and enter it when prompted."
fi
