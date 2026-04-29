# 🐛 LIGA: Pro Journey - Debug Fork

This is a **debug fork** of the LIGA: Pro Journey mod, used for development, testing, and debugging purposes only.

---

## 📋 Overview

This is an isolated development environment for the LIGA: Pro Journey Counter-Strike mod. It is **not intended for end-user gameplay** and contains development-focused tooling and instrumentation.

---

## 🛠️ Quick Start for Development

### Prerequisites
- Node.js (see `.nvmrc` for version)
- npm or yarn
- Counter-Strike game (CS2, CS:GO, CS:S, or CS 1.6)
- Git

### Setup
```bash
npm install
npm run build
```

### Development
```bash
npm run dev      # Start development server
npm run lint     # Run ESLint
npm run typecheck # Type check
```

---

## 📂 Project Structure

```
├── src/                    # Source code
│   ├── components/         # UI components
│   ├── pages/             # Page layouts
│   ├── systems/           # Game systems (contracts, ELO, etc.)
│   ├── database/          # Database models and migrations
│   └── resources/         # Assets and markdown files
├── cli/                   # Command-line tools
├── tests/                 # Test suites
└── package.json          # Dependencies and scripts
```

---

## 🧪 Testing & Debugging

- Check `/docs` (if available) for technical documentation
- Review GitHub issues for known problems
- Use `console` output for debugging game state
- Database logs are available in the save directory

---

## 📝 Notes for Developers

- This fork is actively modified for debugging and testing
- Expect frequent changes to internal systems
- Use a separate save game for testing to avoid corrupting data
- Report issues to the original LIGA team: https://github.com/playliga/prototype

---

## ⚖️ License

See LICENSE file for licensing information.
