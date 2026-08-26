# Contributing

Thanks for contributing to QKTestAnalytics.

## Development

Requires Node.js 20+.

```bash
npm ci
npm test
npm run check
```

Keep framework-specific APIs outside `src/core`. New adapters should translate runner concepts into the canonical model rather than extending core with runner globals.

## Pull requests

- Keep changes focused and include tests for behavior changes.
- Update docs/CHANGELOG for user-visible changes.
- Do not add install-time scripts that invoke other package managers.
- Avoid mandatory dependencies when a Node standard-library implementation is reasonable.
- Treat the canonical schema and exported API as compatibility surfaces.

Use Conventional Commit-style subjects where practical (`feat:`, `fix:`, `docs:`, `chore:`).
