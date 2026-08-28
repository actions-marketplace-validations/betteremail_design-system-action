# Better Email Design System Action

Review a [Better Email](https://better.email) Design System on pull requests, then push a version after changes merge.

<!-- Screenshot placeholder: a pull request comment showing the Design System diff table. -->

Node.js 20 or 22 is required. Add `BETTER_API_KEY` as a repository secret before using either workflow.

## On pull requests

The default `review` mode runs `better check`, generates a Markdown diff against `live` (or another channel), and updates its previous comment instead of adding a new comment on every commit. Validation failures fail the job after the action has attempted to post the diff.

Create a workflow such as `.github/workflows/design-system-review.yml`:

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

## On merge to main

Use `push` mode in a separate merge-to-main workflow. It runs `better check` first and only runs `better ds push --yes` when validation passes.

```yaml
name: Push Design System

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  design-system:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: betteremail/design-system-action@v1
        id: design-system
        with:
          mode: push
          api-key: ${{ secrets.BETTER_API_KEY }}
      - name: Report a version awaiting publish
        if: ${{ steps.design-system.outputs.version != '' && steps.design-system.outputs.staged == 'false' }}
        run: echo "Version ${{ steps.design-system.outputs.version }} awaiting publish"
```

A push creates a version and, when Candidate testing is available, stages it as Candidate by default. Pushing **never** publishes Live; promotion stays in the app. When the Organization does not use Candidate testing, the push creates a version that is not published; someone publishes that version from the app, and `staged` is `false` so a workflow can notify that `version N` is awaiting publish. Setting `stage: false` also creates the version without staging it as Candidate.

`push-name` names the version. It defaults to `CI push {sha}` and replaces `{sha}` with the short commit SHA and `{ref}` with the Git ref.

Without `force`, the push fails if the remote Design System moved since the checkout's last pull binding. This is the safe default: let the workflow fail and have someone pull the latest version before retrying. With `force: true`, CI always wins by passing `--force`. The action never silently retries with force.

## Inputs

| Input               | Required | Default                    | Description                                                                                                             |
| ------------------- | -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `api-key`           | Yes      | —                          | Better Email organization API key. Pass `${{ secrets.BETTER_API_KEY }}`.                                                |
| `base-url`          | No       | `https://app.better.email` | Better Email application URL.                                                                                           |
| `working-directory` | No       | `.`                        | Design System checkout containing `.better/config.json`.                                                                |
| `mode`              | No       | `review`                   | `review` checks and comments on a pull request; `push` creates a version.                                               |
| `channel`           | No       | `live`                     | Published channel to compare against in `review` mode. Ignored in `push` mode.                                          |
| `check`             | No       | `true`                     | Run `better check`. A failure stops `push` before creating a version; `review` still generates its diff before failing. |
| `comment`           | No       | `true`                     | Upsert the sticky pull request comment in `review` mode. Ignored in `push` mode.                                        |
| `push-name`         | No       | `CI push {sha}`            | Name for the version in `push` mode, with `{sha}` and `{ref}` placeholders. Ignored in `review` mode.                   |
| `stage`             | No       | `true`                     | Stage the version as Candidate when possible in `push` mode; `false` passes `--no-stage`. Ignored in `review` mode.     |
| `force`             | No       | `false`                    | Let CI push over a remote change by passing `--force` in `push` mode. Ignored in `review` mode.                         |
| `cli-version`       | No       | `^0.7.0`                   | Version of `@better-email/cli` to install.                                                                              |

`cli-version` defaults to the compatible `>=0.7.0 <0.8.0` range. Override it when you need to use another CLI version.

## Outputs

| Output         | Description                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| `has-changes`  | In `review` mode, `true` when the local Design System differs from the target channel.  |
| `check-passed` | `true` when `better check` passes, or when `check` is disabled.                         |
| `version`      | In `push` mode, the created version number. Empty when no version number can be parsed. |
| `staged`       | In `push` mode, `true` when the version was staged as Candidate; otherwise `false`.     |

## Fork pull requests

GitHub gives fork pull requests a read-only `github.token`. The action detects forks, logs a notice, and skips the comment without failing for that reason. GitHub also withholds repository secrets from untrusted fork workflows, so run authenticated validation only when your repository's security policy makes the API key available safely.

The workflow needs `pull-requests: write` to create or update comments. If that permission is unavailable, the action logs a notice and leaves the validation result unchanged.

Learn more in the [Design Systems as Code CI guide](https://learn.better.email/docs/design-system-development/as-code/ci) or visit [Better Email](https://better.email).
