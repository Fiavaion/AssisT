# 🚀 Create Your Private GitHub Repository - Quick Guide

## **Option 1: Automated (Recommended) - 3 Commands**

Open a **NEW terminal window** (to reload PATH) and run:

```bash
# 1. Authenticate with GitHub (one-time setup)
gh auth login

# Follow the prompts:
# - Choose: GitHub.com
# - Choose: HTTPS
# - Authenticate: Yes
# - How: Login with web browser (easiest)

# 2. Navigate to AssisT directory
cd c:/Users/jones/AIprojects/AssitT

# 3. Create private repository and push
gh repo create AssisT-EdTech \
  --private \
  --source=. \
  --description="Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students" \
  --push
```

**That's it!** Your repository will be created and code pushed automatically.

---

## **Option 2: Manual Setup**

If automated doesn't work, follow these steps:

### Step 1: Create Repository on GitHub
1. Go to: https://github.com/new
2. Fill in:
   - **Name**: `AssisT-EdTech`
   - **Description**: `Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility`
   - **Visibility**: ✅ **Private**
   - **Do NOT** check any initialization options
3. Click **"Create repository"**

### Step 2: Push Your Code
After creating, run these commands (replace `YOUR_USERNAME`):

```bash
cd c:/Users/jones/AIprojects/AssitT

# Remove old remote
git remote remove origin 2>/dev/null

# Add new remote (REPLACE YOUR_USERNAME!)
git remote add origin https://github.com/YOUR_USERNAME/AssisT-EdTech.git

# Rename branch to main
git branch -M main

# Push code
git push -u origin main
```

### Step 3: Get Your Repository Link
```bash
# Option A: With GitHub CLI
gh repo view --web

# Option B: Manually construct
# https://github.com/YOUR_USERNAME/AssisT-EdTech
```

---

## **After Creating Repository**

Your repository link will be:
```
https://github.com/YOUR_USERNAME/AssisT-EdTech
```

**Next steps:**
1. ✅ Repository created (private)
2. Run: `npm install`
3. Create extension icons (see SETUP_COMPLETE.md)
4. Load extension in Chrome
5. Begin Phase 1.2 development

---

## **Verification**

After setup, verify with:
```bash
git remote -v
# Should show: origin  https://github.com/YOUR_USERNAME/AssisT-EdTech.git

gh repo view
# Should show your repository details
```

---

## **Troubleshooting**

### "gh: command not found"
**Solution**: Close and reopen your terminal to reload PATH

### Authentication fails
**Solution**: Use web browser authentication (easiest method)

### Repository already exists
**Solution**: Choose a different name or delete the existing repository

---

**Quick Start**: Run `gh auth login` now in a NEW terminal window!
