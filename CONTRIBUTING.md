# Contributing to Argus

Thank you for your interest in contributing to Argus! This document provides guidelines for contributing.

## Code of Conduct

Be respectful, inclusive, and constructive. We're building tools for truth—let's start with honest, kind collaboration.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include reproduction steps, expected behavior, and actual behavior
4. Add screenshots or logs if relevant

### Suggesting Features

1. Open a discussion or issue
2. Describe the use case and problem it solves
3. Consider how it fits with existing features

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with clear commit messages
4. Add tests if applicable
5. Update documentation if needed
6. Submit a PR with a clear description

## Development Setup

```bash
# Install dependencies
npm install

# Start dev servers (API + Web)
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Code Style

- TypeScript for all new code
- Use Prettier for formatting
- Follow existing patterns in the codebase
- Write meaningful commit messages

## Architecture Notes

- **apps/api**: Hono-based REST API
- **apps/web**: Next.js 14 frontend
- **docs**: Docusaurus documentation site

## Questions?

Open a discussion or reach out on Twitter [@ArgusIntel](https://twitter.com/ArgusIntel).

---

Thank you for helping make intelligence more accessible and trustworthy!
