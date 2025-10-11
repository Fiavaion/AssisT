# 🚀 Getting Started with AssisT

**Quick Start Guide** | Last Updated: 2025-10-11

---

## ✅ Current Status

**Repository**: https://github.com/MarJone/AssisT
**Branch**: main
**Commits**: 3
**Files**: 30
**Status**: ✅ Foundation Complete

---

## 🎯 Next Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Extension Icons
Create PNG icons in `public/icons/`:
- icon16.png, icon32.png, icon48.png, icon128.png

### 3. Load Extension in Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → Select AssitT directory
4. Test on any Canvas course (*.instructure.com)

### 4. Begin Phase 1.2 Development
```bash
# Create first test file
mkdir -p tests/unit
touch tests/unit/tts-controller.test.js

# Follow TDD: Write test → Run → Implement → Commit
npm test
./push.sh
```

---

## 📚 Key Documents

| File | Purpose |
|------|---------|
| [README.md](README.md) | Project overview |
| [ROADMAP.md](ROADMAP.md) | 24-week plan |
| [claude.md](claude.md) | Standards |
| [projectmemory.md](projectmemory.md) | Decisions |

---

## 🔧 Development Commands

```bash
npm test              # Run tests
npm run lint          # Check code
npm run format        # Format code
./push.sh             # Commit & push
```

---

## 📊 Success Metrics

**MVP** (Phase 2): 80% coverage, <200ms load, 70+ usability score
**Production** (Phase 6): 1000+ users, 90% TSR, 100% WCAG AA

---

**Need Help?** See [README.md](README.md) for full details.
