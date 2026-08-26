# QKTestAnalytics

Open, framework-agnostic test analytics and reporting from **Quality & Knowledge (QK)**. QKTestAnalytics consolidates the former `quality-report-data` and `quality-dashboard` projects into one public npm package and one stable reporting contract.

> Status: **0.1.x foundation**. The legacy QReport JSON format is supported while adapters for common frameworks are added.

## Why QKTestAnalytics

- **Zero-server by default**: generate a portable, self-contained HTML report locally or in CI.
- **Framework-agnostic core**: the normalized schema does not depend on WebdriverIO's global `browser` object.
- **Historical analytics**: combine current and archived execution JSON into one model.
- **Evidence-friendly**: steps, errors, browser metadata, screenshots/video references can be represented without forcing a storage backend.
- **Public-package safe**: no install-time Python, pip, OpenCV, database or service requirement.
- **QK-native, vendor-neutral**: designed as the default reporter across QK frameworks while remaining usable independently.

## Install

```bash
npm install -D qk-test-analytics
```

## CLI

```bash
# Build the report from the legacy/default result directory
npx qkta build

# Custom paths
npx qkta build --input ./results --output ./artifacts/report.html

# Archive current.json
npx qkta clean

# Run a command in a new test cycle
npx qkta cycle --new -- npm test
```

Transition aliases `qreport-build` and `qreport-cycle` remain available in 0.x.

## Programmatic API

```js
import { ExecutionDataManager, buildReport } from 'qk-test-analytics';

const report = new ExecutionDataManager();
report.recordStart({ projectName: 'checkout', framework: 'webdriverio' });
report.saveData('Checkout.pay.test_summary.status', 'PASSED');
report.recordEnd();

buildReport();
```

## Architecture

QKTestAnalytics separates **collection**, **normalization**, **analytics** and **presentation**. Framework adapters emit or translate into the versioned canonical model. The HTML renderer consumes only that model, which prevents the UI from becoming tied to a runner.

See [Architecture](docs/ARCHITECTURE.md), [Competitive analysis](docs/COMPETITIVE-ANALYSIS.md), [Migration](docs/MIGRATION.md), and [Roadmap](docs/ROADMAP.md).

## Current compatibility

The importer understands the JSON hierarchy produced by `@qacgbdt/quality-report-data` 1.1.x and the current/history convention consumed by `@qacgbdt/quality-dashboard` 1.1.x. Existing `qreport-results/media-bucket/reports/{current,rep_*}.json` directories can therefore be rendered without changing historical data.

## Security and public contribution

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By contributing, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
