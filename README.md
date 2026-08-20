# Better Email Design System Action

Validate a [Better Email](https://better.email) Design System, compare it with a published channel, and keep the result in one sticky pull request comment.

<!-- Screenshot placeholder: a pull request comment showing the Design System diff table. -->

The action runs `better check`, generates a Markdown diff against `live` (or another channel), and updates its previous comment instead of adding a new comment on every commit. Validation failures fail the job after the action has attempted to publish the diff.

## Quickstart

Node.js 20 or 22 is required. Add `BETTER_API_KEY` as a repository secret, then create a workflow such as `.github/workflows/design-system.yml`:

```yaml
name: Design System

on:
  pull_request:

concurrency:
  group: better-email-diff-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  design-system:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: betteremail/design-system-action@v1
        with:
          api-key: ${{ secrets.BETTER_API_KEY }}
```

The concurrency group cancels overlapping runs for the same pull request so they cannot race while writing the sticky comment.

The checkout at `working-directory` must contain `.better/config.json`. The API key must belong to the Better Email organization that owns the Design System.

## Inputs

| Input               | Required | Default                    | Description                                                                  |
| ------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------- |
| `api-key`           | Yes      | —                          | Better Email organization API key. Pass `${{ secrets.BETTER_API_KEY }}`.     |
| `base-url`          | No       | `https://app.better.email` | Better Email application URL.                                                |
| `working-directory` | No       | `.`                        | Design System checkout containing `.better/config.json`.                     |
| `channel`           | No       | `live`                     | Published channel to compare against.                                        |
| `check`             | No       | `true`                     | Run `better check`. Check failures fail the job after the diff is attempted. |
| `comment`           | No       | `true`                     | Upsert the sticky pull request comment.                                      |
| `cli-version`       | No       | `^0.5.0`                   | Version of `@better-email/cli` to install.                                   |

`cli-version` defaults to the compatible `>=0.5.0 <0.6.0` range. Override it when you need to use another CLI version.

## Outputs

| Output         | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `has-changes`  | `true` when the local Design System differs from the target channel. |
| `check-passed` | `true` when `better check` passes, or when `check` is disabled.      |

## Fork pull requests

GitHub gives fork pull requests a read-only `github.token`. The action detects forks, logs a notice, and skips the comment without failing for that reason. GitHub also withholds repository secrets from untrusted fork workflows, so run authenticated validation only when your repository's security policy makes the API key available safely.

The workflow needs `pull-requests: write` to create or update comments. If that permission is unavailable, the action logs a notice and leaves the validation result unchanged.

Learn more in the [Design Systems as Code CI guide](https://learn.better.email/docs/design-system-development/as-code/ci) or visit [Better Email](https://better.email).
