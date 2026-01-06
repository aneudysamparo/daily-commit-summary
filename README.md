# Daily Commit Summary
![npm version](https://img.shields.io/npm/v/daily-commit-summary)
![license](https://img.shields.io/npm/l/daily-commit-summary)
![downloads](https://img.shields.io/npm/dt/daily-commit-summary)


Generate daily work reports from git commits using AI. Create detailed reports for project management tools or brief summaries for time tracking apps.

## Installation

[![asciicast](https://asciinema.org/a/MQdGBuXX5QutT4OESp4HZsamP.svg)](https://asciinema.org/a/MQdGBuXX5QutT4OESp4HZsamP)

### Global install (recommended for CLI usage)

```bash
# Using npm
npm install -g daily-commit-summary

# Using pnpm (recommended)
pnpm add -g daily-commit-summary

# Using yarn
yarn global add daily-commit-summary
```

### Run Locally (Development)

```bash
# Clone the repository
git clone git@github.com:aneudysamparo/daily-commit-summary.git
cd daily-commit-summary

# Install dependencies
pnpm install

# Run the CLI
node index.js [options]

# Or link globally
pnpm link --global
```

## Configuration

### Global Config (Recommended)

Run the interactive setup to configure your API keys and defaults:

```bash
ds --init
```

This creates a config file at `~/.daily-commit-summary.json`.

To view current config:
```bash
ds --config
```

### Per-Project Config

Create a `.env` file in your project root:

```env
API_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4o-mini
DEFAULT_REPORT=all
```

### CLI Overrides

Overrides take precedence (CLI flags > .env > Global Config).

```bash
ds --api perplexity --key pplx-xxx
```

## Usage

```bash
ds [options]
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--path` | `-p` | Path to git repository (default: current) |
| `--date` | `-d` | Date YYYY-MM-DD (default: today) |
| `--report` | `-r` | Report type: `all`, `full`, `summary` |
| `--api` | `-a` | Provider: `openai`, `perplexity` |
| `--model` | `-m` | Model name override |
| `--copy` | | Copy report to clipboard |
| `--init` | | Interactive setup |
| `--config` | | Show current config |
| `--help` | `-h` | Show help |

### Shortcuts

- `ds` → Daily summary (standard)
- `dcs` → Daily summary + copy to clipboard (equivalent to `ds --copy`)

### Examples

```bash
# Generate report for today
ds

# Generate for specific date and path
ds -p ~/projects/client-app -d 2026-01-05

# Only summary, copied to clipboard
dcs -r summary

# Use Perplexity instead of OpenAI temporarily
ds --api perplexity --model llama-3.1-sonar-large
```

## Features

- **Multi-Provider AI**: Support for OpenAI and Perplexity.
- **Flexible Reporting**: Full detailed reports or concise summaries.
- **Configurable**: Global config, per-project `.env`, or CLI flags.
- **Clipboard Integration**: `dcs` shortcut for instant pasting.

## How It Works

1. Fetches git commits for the target date.
2. Sends commits to the selected AI model with a structured prompt.
3. Generates a formatted markdown report.
4. Optionally copies output to clipboard.

## Requirements

- Node.js >= 16.0.0
- Git installed and available in path.
- API Key (OpenAI or Perplexity).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
