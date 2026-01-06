# Daily Commit Summary

Generate daily work reports from git commits using AI. Create detailed reports for project management tools or brief summaries for time tracking apps.

## Quick Start

### Installation

```bash
# Using pnpm (recommended)
pnpm add -g daily-commit-summary

# Using npm
npm install -g daily-commit-summary

# Using yarn
yarn global add daily-commit-summary
```

### Setup

1. After installation, create a `.env` file in your home directory or project directory:

```bash
# Copy the example
cp ~/.pnpm/global/node_modules/daily-commit-summary/.env.example ~/.env
# Or in your project
cp node_modules/daily-commit-summary/.env.example .env
```

2. Edit `.env` and add your API keys:

```env
API_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
DEFAULT_REPORT=all
```

### Usage

```bash
# Quick commands
ds                                    # Generate all reports today
dcs                                   # Generate all reports + copy to clipboard
ds -r full                           # Only full report
ds -r summary                        # Only summary
ds -p ~/projects/myapp               # Specify repo path
ds -d 2026-01-05                     # Specific date
ds --show-env                        # View current configuration

# Override API settings
ds --api perplexity --key pplx-xxx   # Use Perplexity with custom key
ds --model gpt-4-turbo               # Use different model
```

## Command Shortcuts

- **ds** - Generate reports (standard)
- **dcs** - Generate reports with clipboard copy

## Configuration

### `.env` File Options

```env
API_PROVIDER          # openai or perplexity
OPENAI_API_KEY        # Your OpenAI key
PERPLEXITY_API_KEY    # Your Perplexity key
OPENAI_MODEL          # gpt-4o-mini (default), gpt-4-turbo, gpt-4o
PERPLEXITY_MODEL      # llama-3.1-sonar-small-128k-online (default)
DEFAULT_REPORT        # all, full, or summary
DEFAULT_COPY          # true or false
```

### CLI Options

```
--path, -p            Repository path (default: current directory)
--date, -d            Date in YYYY-MM-DD format (default: today)
--report, -r          Report type: all, full, summary
--api, -a             API provider: openai, perplexity
--key, -k             API key (overrides env)
--model, -m           Model name (overrides env)
--copy                Copy to clipboard
--show-env            View current configuration
--help, -h            Show help
```

## Pricing

### Cheapest Options

**OpenAI (gpt-4o-mini)**
- $0.15 per 1M input tokens
- ~1000 commits → ~$0.001 per report

**Perplexity (llama-3.1-sonar-small-128k-online)**
- $0.02 per 1M input tokens
- ~1000 commits → $0.0002 per report

## Examples

```bash
# Generate all reports for today's commits
ds

# Copy summary to clipboard for today
dcs -r summary

# Full report for a specific project yesterday
ds -p ~/projects/myapp -d 2026-01-05 -r full

# Use Perplexity instead of OpenAI
ds --api perplexity

# Override API key for one-time use
ds --api openai --key sk-your-temp-key

# Check your current configuration
ds --show-env
```

## How It Works

1. Fetches all commits from today (or specified date)
2. Sends commits to AI model with structured prompt
3. Generates detailed report with sections and bullets
4. Creates concise summary (~200 chars)
5. Optionally copies to clipboard

## Requirements

- Node.js 16+
- Git
- Valid API key (OpenAI or Perplexity)

## License

ISC

## Contributing

Contributions welcome! Feel free to submit issues or PRs.
```

***

## **Step 6: Install Locally**

```bash
cd ~/daily-commit-summary
pnpm install
pnpm link --global
```

Or to test before publishing:
```bash
pnpm link --global
```


