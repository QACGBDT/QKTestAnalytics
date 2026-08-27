# Migration from quality-report-data + quality-dashboard

## Source packages

The consolidation starts from `@qacgbdt/quality-report-data` 1.1.1 and `@qacgbdt/quality-dashboard` 1.1.1.

### Mapping

| Legacy | QKTestAnalytics |
|---|---|
| `ExecutionDataManager` | `ExecutionDataManager` |
| `qreport-results/media-bucket/reports/current.json` | Supported unchanged in 0.x |
| `qreport-clean` | `qkta clean` |
| `qreport-cycle` | `qkta cycle` (legacy alias retained) |
| `qreport-build` | `qkta build` (legacy alias retained) |
| `build-report.js` | `buildReport()` |
| Dashboard global JS | Canonical model + self-contained renderer |
| Python/OpenCV postinstall | Removed from default package; future optional evidence adapter |

## Consumer migration

Remove the two old dependencies and install one:

```bash
npm remove @qacgbdt/quality-report-data @qacgbdt/quality-dashboard
npm install -D @qacg/qk-test-analytics
```

Existing scripts can temporarily keep `qreport-build` / `qreport-cycle`, then migrate to `qkta` commands.

## Data compatibility

Do not delete historical JSON. The compatibility importer reads the existing `current.json` and `rep_*.json` layout. New adapters will gradually emit canonical schema directly; when that happens, a migration utility will convert old history once rather than requiring dual formats forever.

## Behavioral differences

- Core no longer assumes a WebdriverIO global `browser`; screenshots belong to the WDIO adapter.
- Report installation never invokes pip.
- Video generation is not automatic in the foundation release.
- The consolidated public package is published as `@qacg/qk-test-analytics` on the npm registry rather than GitHub Packages.
- The product name in user-facing output is QKTestAnalytics; QReport names remain only for transition compatibility.
