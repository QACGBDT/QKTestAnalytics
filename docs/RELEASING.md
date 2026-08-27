# Releasing `@qacg/qk-test-analytics`

QKTestAnalytics is published as the public npm organization package `@qacg/qk-test-analytics`.

## Branch and tag policy

- `develop` is the integration branch for feature work.
- Release candidates are promoted from `develop` to `main` through a pull request.
- A GitHub Release is created from a tag named exactly `v<package.version>` on `main`.
- `.github/workflows/publish.yml` rejects a mismatched tag or a release commit that is not contained in `main`.

The public package has been bootstrapped. The current patch line is `0.4.1`; future releases use tags that match the version in `package.json`.

## Quality before publish

The publish job runs the same repository quality gate used in CI:

```bash
npm ci
npm run quality
```

It then publishes the scoped package with public visibility.

## First-publish bootstrap

npm Trusted Publishing can only be configured after the package exists. The first publication therefore needs a one-time authenticated bootstrap.

1. Confirm the npm organization `qacg` exists and the publishing npm account has permission to create public packages in the `@qacg` scope.
2. Confirm npm username `isopropilick` is a member of the organization and has read/write access through the organization `developers` team or another write-enabled team.
3. Create a temporary granular npm token that can publish `@qacg/qk-test-analytics` and place it in the GitHub repository/environment secret `NPM_TOKEN`.
4. Merge the release changes to `main` and publish the GitHub Release matching the selected package version.
5. Verify the selected version exists publicly as `@qacg/qk-test-analytics`.

The token is a bootstrap fallback only and should not remain the long-term publisher credential.

## Enable npm Trusted Publishing

After the first package version exists, configure its Trusted Publisher in npm package settings with:

- provider: GitHub Actions
- GitHub organization/user: `QACGBDT`
- repository: `QKTestAnalytics`
- workflow filename: `publish.yml`
- environment: `npm`
- allowed action: `npm publish`

The workflow already grants `id-token: write` and uses an OIDC-capable npm CLI. Once a trusted publisher is configured and verified, delete the `NPM_TOKEN` secret. Future releases will authenticate with short-lived OIDC credentials and npm will generate provenance automatically.

For the strongest registry posture, set package publishing access to require 2FA and disallow traditional tokens after Trusted Publishing is working.

## Maintainer ownership

Expected primary maintainer metadata:

- npm username: `isopropilick`
- email: `eric.pereyra@icloud.com`
- GitHub: `@isopropilick`

The `maintainers` entry in `package.json` is descriptive metadata; npm registry write permission is controlled by npm organization/team membership. New organization packages normally grant the organization's `developers` team read/write access.

After the first publish, verify effective access with an authenticated npm session:

```bash
npm owner ls @qacg/qk-test-analytics
npm access list packages qacg isopropilick
```

If `isopropilick` is not present in the organization, an npm organization owner must invite that username and grant write access. Package-maintainer and organization-governance changes require an interactive authenticated/2FA-capable npm session and should not be automated with the publish token.

## Release checklist

1. `develop` is green on Node 20, 22 and 24.
2. Release version is updated in `package.json` and `package-lock.json`.
3. `CHANGELOG.md` contains the dated release section.
4. A PR promotes the release commit to `main`.
5. Create GitHub Release `v<version>` from the `main` commit.
6. Confirm the Publish npm workflow succeeds.
7. Confirm the npm package version, public visibility and provenance.
8. Confirm maintainer/team access.
9. For the bootstrap release, configure Trusted Publishing and remove `NPM_TOKEN`.
