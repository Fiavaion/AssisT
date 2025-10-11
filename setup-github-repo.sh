#!/bin/bash

# AssisT GitHub Repository Setup Script
# This script helps you create and configure a private GitHub repository

echo "=================================="
echo "AssisT GitHub Repository Setup"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "manifest.json" ] || [ ! -f "README.md" ]; then
    echo "❌ ERROR: Please run this script from the AssitT directory"
    echo "Current directory: $(pwd)"
    exit 1
fi

echo "✅ Confirmed: Running from AssisT directory"
echo ""

# Check git status
echo "📊 Current Git Status:"
git log --oneline -3 2>/dev/null || echo "No commits found"
echo ""

# Prompt for GitHub username
echo "================================================"
echo "Step 1: GitHub Account Information"
echo "================================================"
read -p "Enter your GitHub username: " GITHUB_USERNAME

if [ -z "$GITHUB_USERNAME" ]; then
    echo "❌ ERROR: GitHub username cannot be empty"
    exit 1
fi

REPO_NAME="AssisT-EdTech"
REPO_URL="https://github.com/$GITHUB_USERNAME/$REPO_NAME"

echo ""
echo "📝 Repository Details:"
echo "   Name: $REPO_NAME"
echo "   URL: $REPO_URL"
echo "   Visibility: Private"
echo ""

# Check if GitHub CLI is installed
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI (gh) is installed"
    echo ""
    echo "================================================"
    echo "Step 2: Authenticate with GitHub"
    echo "================================================"

    # Check if already authenticated
    if gh auth status &> /dev/null; then
        echo "✅ Already authenticated with GitHub"
    else
        echo "🔐 You need to authenticate with GitHub"
        echo "Running: gh auth login"
        gh auth login
    fi

    echo ""
    echo "================================================"
    echo "Step 3: Create Private Repository"
    echo "================================================"

    read -p "Create private repository '$REPO_NAME'? (y/n): " CONFIRM

    if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
        # Initialize git if needed
        if [ ! -d ".git" ]; then
            echo "📦 Initializing git repository..."
            git init
            git add .
            git commit -m "feat(foundation): initialize AssisT extension with complete architecture

- Complete Chrome Extension Manifest V3 setup
- Modular TTS/STT/WAI-Adapt architecture
- FERPA-compliant storage and security
- 6-phase development roadmap
- Decision log with 7 entries

Phase 1.1 Foundation: COMPLETE ✅"
        fi

        echo "🚀 Creating private repository on GitHub..."
        gh repo create "$REPO_NAME" \
            --private \
            --source=. \
            --description="Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students" \
            --push

        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ SUCCESS! Repository created and code pushed!"
            echo ""
            echo "🔗 Repository URL: $REPO_URL"
            echo ""
            echo "Next steps:"
            echo "  1. Visit: $REPO_URL"
            echo "  2. Run: npm install"
            echo "  3. Create extension icons (see SETUP_COMPLETE.md)"
            echo "  4. Begin Phase 1.2 development"
        else
            echo "❌ ERROR: Failed to create repository"
            exit 1
        fi
    else
        echo "⏭️  Skipped repository creation"
    fi

else
    echo "⚠️  GitHub CLI (gh) is not installed"
    echo ""
    echo "================================================"
    echo "Manual Setup Instructions"
    echo "================================================"
    echo ""
    echo "1. Install GitHub CLI (optional but recommended):"
    echo "   Windows: winget install --id GitHub.cli"
    echo "   Or visit: https://cli.github.com/"
    echo ""
    echo "2. OR create repository manually:"
    echo "   a. Go to: https://github.com/new"
    echo "   b. Repository name: $REPO_NAME"
    echo "   c. Description: Neuro-Adaptive EdTech Extension for Canvas VLE"
    echo "   d. Visibility: ✅ Private"
    echo "   e. Do NOT initialize with README"
    echo "   f. Click 'Create repository'"
    echo ""
    echo "3. Then run these commands:"
    echo ""
    echo "   git remote remove origin 2>/dev/null"
    echo "   git remote add origin $REPO_URL.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
    echo "4. Your repository will be at: $REPO_URL"
    echo ""
fi

echo ""
echo "================================================"
echo "Setup Complete!"
echo "================================================"
