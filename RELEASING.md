# Releasing

## Prerequisites

- Use Node 20.19+ for local release/build steps.
  - `nvm use`
- Ensure the GitHub repository has an `NPM_TOKEN` secret.
- Ensure the npm package name `@withremyinc/stream` is available to publish from your account/org.

## Pre-release checklist

- Review `README.md`.
- Update `CHANGELOG.md`.
- Run:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

- Confirm the package tarball contains only the expected files.

## Publish

1. Bump the version:

```bash
pnpm version patch
```

Use `minor` or `major` when appropriate.

2. Push the commit and tag:

```bash
git push --follow-tags
```

3. Watch the GitHub Actions `Publish to npm` workflow.

## Post-release smoke check

- Confirm the package is visible on npm.
- Confirm the published version matches the Git tag.
- Optionally test install in a clean temp project:

```bash
mkdir -p /tmp/stream-smoke && cd /tmp/stream-smoke
npm init -y
npm install @withremyinc/stream
```

## Notes

- Published package runtime target: Node 18+
- Local build toolchain target: Node 20.19+
- Publishing is tag-driven and uses npm provenance
