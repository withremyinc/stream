# Releasing

## Prerequisites

- Use Node 20.19+ for local release/build steps.
  - `nvm use`
- Configure npm publish auth for the GitHub Actions `Publish to npm` workflow.
  One of the following is required (the workflow auto-detects which):
  - **Trusted publishing (recommended, no secrets):** on
    [npmjs.com](https://www.npmjs.com/package/@withremyinc/stream/access), add a
    Trusted Publisher → GitHub Actions for repo `withremyinc/stream`, workflow
    `.github/workflows/publish.yml`. The workflow already requests `id-token:
    write` and upgrades npm to a version that supports OIDC.
  - **Token (fallback):** add an `NPM_TOKEN` repository secret (an automation or
    granular-access token with publish rights). The workflow uses it as
    `NODE_AUTH_TOKEN` when present.
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
- If the `Publish to npm` job fails with `ENEEDAUTH`, neither a trusted publisher
  nor an `NPM_TOKEN` secret is configured — see Prerequisites above, then re-run
  the job or re-push the tag.
