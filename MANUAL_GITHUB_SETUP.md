# Manual GitHub Repository Setup for AssisT

The automated scripts had some issues. Here's a simple manual process:

## Option 1: Using GitHub CLI (Recommended)

Open a new Command Prompt or PowerShell window and run:

```bash
cd c:\Users\jones\AIprojects\AssitT

# Authenticate with GitHub (if not already)
"C:\Program Files\GitHub CLI\gh.exe" auth login

# Create the private repository
"C:\Program Files\GitHub CLI\gh.exe" repo create AssisT-EdTech --private --description "Neuro-Adaptive EdTech Extension for Canvas VLE"

# Add the remote and push
git remote add origin https://github.com/MarJone/AssisT-EdTech.git
git branch -M main
git push -u origin main

# Get the repository URL
"C:\Program Files\GitHub CLI\gh.exe" repo view --web
```

## Option 2: Using GitHub Web Interface (Easiest)

1. **Go to GitHub**: https://github.com/new

2. **Repository Settings**:
   - Repository name: `AssisT-EdTech`
   - Description: `Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students`
   - Visibility: **Private** ✓
   - **DO NOT** initialize with README, .gitignore, or license

3. **Click "Create repository"**

4. **Connect your local repository**:

   Open Git Bash, Command Prompt, or PowerShell in the AssitT directory and run:

   ```bash
   git remote add origin https://github.com/MarJone/AssisT-EdTech.git
   git branch -M main
   git push -u origin main
   ```

5. **Verify**: Go to https://github.com/MarJone/AssisT-EdTech

## What's Already Done

✅ Git repository initialized
✅ All 29 files committed (4,788 lines of code)
✅ Commit message follows Conventional Commits
✅ Local repository is clean and ready

## What You Need to Do

Just run the commands in **Option 1** or follow the steps in **Option 2** above.

## Repository URL (After Creation)

Your private repository will be at:
**https://github.com/MarJone/AssisT-EdTech**

## Next Steps After Repository Creation

1. Install dependencies: `npm install`
2. Create extension icons in `public/icons/`
3. Load extension in Chrome for testing
4. Begin Phase 1.2 development (Basic TTS Implementation)

---

**Note**: Replace "MarJone" with your actual GitHub username if different.
