#!/bin/bash

# Script to push the project to GitHub

echo "Initializing git repository..."
git init

echo "Adding all files..."
git add .

echo "Committing..."
git commit -m "Initial commit"

# Check if remote origin already exists
if git remote | grep -q "^origin$"; then
  echo "Remote 'origin' already exists."
else
  echo "Please create a repository on GitHub and provide the URL (e.g., https://github.com/username/repo.git)"
  read -p "Enter the GitHub repository URL: " repo_url
  git remote add origin "$repo_url"
fi

echo "Pushing to GitHub..."
git push -u origin master

echo "Done!"