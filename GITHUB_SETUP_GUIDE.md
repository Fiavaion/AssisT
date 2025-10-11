# GitHub Repository Setup Guide for AssisT

## Option 1: Using GitHub CLI (Recommended)

If you have GitHub CLI installed (`gh`):

```bash
# 1. Navigate to AssitT directory
cd c:\Users\jones\AIprojects\AssitT

# 2. Initialize as new Git repository (if not already done)
git init

# 3. Create new private GitHub repository and push
gh repo create AssisT-EdTech --private --source=. --push --description "Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students"
```

The repository will be created at: `https://github.com/YOUR_USERNAME/AssisT-EdTech`

---

## Option 2: Manual GitHub Setup

### Step 1: Create New Repository on GitHub

1. Go to: https://github.com/new
2. Fill in:
   - **Repository name**: `AssisT-EdTech`
   - **Description**: `Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students`
   - **Visibility**: ✅ **Private**
   - **Do NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"

### Step 2: Connect Local Repository

GitHub will show you commands. Use these instead (from the AssitT directory):

```bash
# Navigate to AssitT directory
cd c:\Users\jones\AIprojects\AssitT

# Initialize new git repository (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "feat(foundation): initialize AssisT extension with complete architecture"

# Rename branch to main (GitHub default)
git branch -M main

# Add GitHub as remote origin (REPLACE YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/AssisT-EdTech.git

# Push to GitHub
git push -u origin main
```

**IMPORTANT**: Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Verify

After pushing, your repository will be available at:
```
https://github.com/YOUR_USERNAME/AssisT-EdTech
```

---

## Quick Reference

### Repository Details
- **Name**: AssisT-EdTech
- **Visibility**: Private
- **Primary Branch**: main
- **Description**: Neuro-Adaptive EdTech Extension for Canvas VLE

### After Setup
Once your repo is created, you can get the link:
```bash
# Get repository URL
git remote get-url origin

# Or open in browser (with gh CLI)
gh repo view --web
```

---

## Troubleshooting

### If you get "repository already exists" error:
```bash
# Remove old remote
git remote remove origin

# Add new remote with correct URL
git remote add origin https://github.com/YOUR_USERNAME/AssisT-EdTech.git
```

### If you're in the wrong directory:
```bash
# Check current directory
pwd

# Should show: /c/Users/jones/AIprojects/AssitT
# If not, navigate there:
cd c:\Users\jones\AIprojects\AssitT
```

### To verify your commits:
```bash
git log --oneline
# Should show:
# a14956a docs(summary): add comprehensive final summary document
# 2a5510e feat(foundation): initialize AssisT extension with complete architecture
```

---

## Next Steps After GitHub Setup

1. **Clone link**: Copy from GitHub repo page or run `git remote get-url origin`
2. **Add to README**: Update README.md with repository link
3. **Enable GitHub Pages** (optional): For documentation hosting
4. **Set up branch protection** (optional): Protect main branch
5. **Continue development**: Begin Phase 1.2 - Basic TTS Implementation

---

**Created**: 2025-10-11
**Status**: Ready for GitHub setup
