# Contributing

Thanks for wanting to contribute to Twilio Bedrock Bridge. We welcome bug reports, feature requests, tests, and documentation improvements.

## Basic workflow

1. Fork the repository.
2. Create a feature branch from `main`:
   git checkout -b feat/your-feature
3. Make your changes and include tests where applicable.
4. Run the full test suite and linters locally before opening a PR.
5. Push your branch to your fork and open a Pull Request against `main`.

## Code style

- This project uses TypeScript with strict settings. Prefer explicit types and avoid `any`.
- Follow existing patterns in the codebase. Keep functions small and well-documented.
- Use the existing ESLint and Prettier configuration (see `backend/twilio-bedrock-bridge/.eslintrc.js` and `.prettierrc`).
- Write JSDoc/comments for public interfaces where helpful.

## Testing

- Run tests from the backend package:
  cd backend/twilio-bedrock-bridge
  npm ci
  npm run test
  npm run test:coverage
- Add unit tests for new logic and integration tests for end-to-end behaviors when possible.
- Tests should be deterministic and not rely on live AWS/Twilio resources (use mocks).

## Documentation

- Update README files and inline docs when you change behavior or add features.
- Major changes should include short examples showing how to use the feature.

## Reporting security issues

If you discover a security vulnerability, please do NOT open a public issue. Instead, see [`SECURITY.md`](SECURITY.md:1) for confidential reporting instructions.

## Pull Request checklist

Before requesting a review, make sure:

- [ ] The test suite passes locally
- [ ] New tests cover the change (unit/integration as applicable)
- [ ] Code follows the repository's style and lint rules
- [ ] Documentation/README updated if necessary
- [ ] CI passes on your PR

## Issues

When filing an issue, include:

- A clear, descriptive title
- The environment and steps to reproduce
- Expected vs actual behavior
- Relevant logs, stack traces or test case
- A minimal reproduction if possible

## Thanks

Thanks for contributing — we appreciate improvements of every size. See the main project README: [`README.md`](README.md:1) and the backend README: [`backend/twilio-bedrock-bridge/README.md`](backend/twilio-bedrock-bridge/README.md:1).