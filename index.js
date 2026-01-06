#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import OpenAI from "openai";
import clipboardy from "clipboardy";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn(
    "⚠️  .env file not found. Create one from .env.example or set API keys via CLI flags."
  );
}

// Get defaults from .env or use hardcoded defaults
const getEnvVar = (key, defaultValue) => process.env[key] || defaultValue;

const DEFAULT_API_PROVIDER = getEnvVar("API_PROVIDER", "openai");
const DEFAULT_REPORT_TYPE = getEnvVar("DEFAULT_REPORT", "all");
const DEFAULT_COPY = getEnvVar("DEFAULT_COPY", "false") === "true";
const DEFAULT_OPENAI_MODEL = getEnvVar("OPENAI_MODEL", "gpt-4o-mini");
const DEFAULT_PERPLEXITY_MODEL = getEnvVar(
  "PERPLEXITY_MODEL",
  "llama-3.1-sonar-small-128k-online"
);

const argv = yargs(hideBin(process.argv))
  .option("path", {
    alias: "p",
    describe: "Path to the Git repository",
    type: "string",
    default: process.cwd(),
  })
  .option("date", {
    alias: "d",
    describe: "Date in YYYY-MM-DD format (default: today)",
    type: "string",
    default: null,
  })
  .option("report", {
    alias: "r",
    describe: "Report type: all, full, or summary",
    type: "string",
    choices: ["all", "full", "summary"],
    default: DEFAULT_REPORT_TYPE,
  })
  .option("api", {
    alias: "a",
    describe: "API provider: openai or perplexity",
    type: "string",
    choices: ["openai", "perplexity"],
    default: DEFAULT_API_PROVIDER,
  })
  .option("key", {
    alias: "k",
    describe:
      "API key (overrides env var). Format: --key=sk-xxx or OPENAI_API_KEY=sk-xxx",
    type: "string",
    default: null,
  })
  .option("model", {
    alias: "m",
    describe:
      "Model name (overrides env var). Default: gpt-4o-mini (openai) or llama-3.1-sonar-small-128k-online (perplexity)",
    type: "string",
    default: null,
  })
  .option("copy", {
    describe: "Copy reports to clipboard",
    type: "boolean",
    default: DEFAULT_COPY,
  })
  .option("show-env", {
    describe: "Show current environment configuration",
    type: "boolean",
    default: false,
  })
  .help()
  .alias("help", "h")
  .example("ds", "Generate all reports for today")
  .example("ds -p ~/projects/myapp", "Specify repo path")
  .example("ds -r full", "Only full report")
  .example("dcs -r summary", "Summary copied to clipboard (dcs = ds + copy)")
  .example(
    "ds --api perplexity --key pplx-xxx --model llama-3.1-sonar-large",
    "Override API and model"
  )
  .example("ds --show-env", "View current configuration")
  .epilogue(
    `
Command Shortcuts:
  ds   - daily-summary (standard)
  dcs  - daily-summary with --copy enabled (for clipboard)

Configuration:
  Create a .env file in the project root (copy from .env.example):
  - API_PROVIDER: openai or perplexity
  - OPENAI_API_KEY: your OpenAI key
  - PERPLEXITY_API_KEY: your Perplexity key
  - OPENAI_MODEL: default OpenAI model
  - PERPLEXITY_MODEL: default Perplexity model
  - DEFAULT_REPORT: all, full, or summary
  - DEFAULT_COPY: true or false

CLI Override Examples:
  ds --api openai --key sk-xxx                    # Override API key
  ds --model gpt-4-turbo                          # Override model
  ds --api perplexity --key pplx-xxx              # Switch to Perplexity

Environment Check:
  ds --show-env                                   # See current config

Documentation:
  https://github.com/yourusername/daily-commit-summary
`.trim()
  )
  .parseSync();

/**
 * Show environment configuration
 */
function showEnvironmentConfig(api, model, key) {
  console.log("\n");
  console.log("⚙️  Current Configuration");
  console.log("═".repeat(70));
  console.log(`API Provider: ${api}`);
  console.log(`Model: ${model}`);
  console.log(`API Key: ${key ? "✅ Set (hidden for security)" : "❌ Not set"}`);
  console.log(`Default Report: ${DEFAULT_REPORT_TYPE}`);
  console.log(`Default Copy: ${DEFAULT_COPY}`);
  console.log("═".repeat(70));
  console.log("\n📝 To set a .env file, create one in the project root:");
  console.log("   cp .env.example .env");
  console.log("   # Edit .env with your settings\n");
}

/**
 * Get API key and model based on provider and CLI args
 */
function getApiConfig(provider, cliKey, cliModel) {
  const selectedProvider = provider || DEFAULT_API_PROVIDER;

  let apiKey;
  let model;

  if (selectedProvider === "openai") {
    apiKey = cliKey || process.env.OPENAI_API_KEY;
    model = cliModel || DEFAULT_OPENAI_MODEL;
  } else if (selectedProvider === "perplexity") {
    apiKey = cliKey || process.env.PERPLEXITY_API_KEY;
    model = cliModel || DEFAULT_PERPLEXITY_MODEL;
  }

  if (!apiKey) {
    console.error(`❌ No API key found for ${selectedProvider}`);
    console.error(
      `   Set it in .env or use: --key=your_key or OPENAI_API_KEY=sk-xxx`
    );
    process.exit(1);
  }

  return { apiKey, model, provider: selectedProvider };
}

/**
 * Get commits for a specific date range
 */
function getTodayCommits(repoPath, dateStr) {
  try {
    let gitCommand;

    if (dateStr) {
      const nextDay = new Date(dateStr);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split("T")[0];
      gitCommand = `git log --since="${dateStr}" --until="${nextDayStr}" --pretty=format:"%h %s" --no-merges`;
    } else {
      gitCommand = `git log --since="00:00" --until="23:59" --pretty=format:"%h %s" --no-merges`;
    }

    const log = execSync(gitCommand, {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();

    return log || "No commits found.";
  } catch (error) {
    console.error(`❌ Error fetching commits from ${repoPath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Get the current Git branch name
 */
function getCurrentBranch(repoPath) {
  try {
    const branch = execSync("git symbolic-ref --short HEAD", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    return branch;
  } catch {
    return "unknown";
  }
}

/**
 * Call AI API
 */
async function callAI(commits, prompt, model, apiKey, apiProvider) {
  if (apiProvider === "openai") {
    const client = new OpenAI({
      apiKey: apiKey,
    });

    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.4,
    });

    return response.choices[0].message.content.trim();
  } else if (apiProvider === "perplexity") {
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.perplexity.ai",
    });

    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.4,
    });

    return response.choices[0].message.content.trim();
  }
}

/**
 * Generate full detailed report
 */
async function generateFullReport(commits, branch, apiKey, model, api) {
  const prompt = `You are a professional project manager. Create a detailed daily work report based on these git commits.

Requirements:
- Use first person ("I", "We")
- Structure with clear sections (features, bug fixes, improvements, etc.)
- Use bullet points and indentation for sub-items
- Title should be max 12 words
- Include specific implementation details
- Be concise but comprehensive
- Format as markdown with sections and bullets

Git commits:
${commits}

Branch: ${branch}

Generate the report now. Start with a title, then sections with bullets:`;

  return await callAI(commits, prompt, model, apiKey, api);
}

/**
 * Generate summary report
 */
async function generateSummaryReport(
  commits,
  fullReport,
  branch,
  apiKey,
  model,
  api
) {
  const prompt = `You are creating a brief end-of-day work log entry (~150-200 characters, single line).

Based on this detailed report and git commits, create a concise summary.

Requirements:
- Max 200 characters
- Single sentence or two short ones
- First person ("I worked on...", "Fixed...", "Added...")
- Include feature/component name when relevant
- Professional tone
- Start with action verb
- No quotation marks needed

Full Report:
${fullReport}

Git commits:
${commits}

Branch: ${branch}

Generate the summary (keep it short and punchy):`;

  return await callAI(commits, prompt, model, apiKey, api);
}

/**
 * Format reports for display
 */
function formatReports(fullReport, summaryReport, dateStr) {
  const date = dateStr || new Date().toISOString().split("T")[0];
  let output = `\n${"═".repeat(70)}\n`;
  output += `📅 Daily Report - ${date}\n`;
  output += `${"═".repeat(70)}\n\n`;

  if (fullReport) {
    output += `📋 FULL REPORT\n`;
    output += `${"─".repeat(70)}\n`;
    output += fullReport;
    output += `\n\n`;
  }

  if (summaryReport) {
    output += `⏱️  SUMMARY\n`;
    output += `${"─".repeat(70)}\n`;
    output += `"${summaryReport}"\n`;
    output += `📊 Characters: ${summaryReport.length}/200\n\n`;
  }

  output += `${"═".repeat(70)}\n`;
  return output;
}

/**
 * Main function
 */
async function main() {
  // Show env if requested
  if (argv["show-env"]) {
    const { apiKey, model, provider } = getApiConfig(argv.api, argv.key, argv.model);
    showEnvironmentConfig(provider, model, argv.key || process.env.OPENAI_API_KEY || process.env.PERPLEXITY_API_KEY);
    return;
  }

  const repoPath = resolve(argv.path);
  const branch = getCurrentBranch(repoPath);
  const dateStr = argv.date;

  // Get API configuration
  const { apiKey, model, provider } = getApiConfig(argv.api, argv.key, argv.model);

  // Display header
  console.log("\n");
  console.log("🎯 Daily Report Generator");
  console.log("═".repeat(70));
  console.log(`📍 Repository: ${repoPath}`);
  console.log(`🌿 Branch: ${branch}`);
  console.log(`📅 Date: ${dateStr || "Today"}`);
  console.log(`📊 Reports: ${argv.report === "all" ? "full + summary" : argv.report}`);
  console.log(`🤖 API: ${provider}`);
  console.log(`🎯 Model: ${model}`);
  if (argv.copy) console.log(`📋 Will copy to clipboard`);
  console.log("═".repeat(70));

  // Fetch commits
  console.log("\n📝 Fetching commits...");
  const commits = getTodayCommits(repoPath, dateStr);

  if (commits === "No commits found.") {
    console.log("⚠️  No commits found for the specified date.");
    return;
  }

  console.log(`✓ Found commits:\n${commits}\n`);

  let fullReport = null;
  let summaryReport = null;

  try {
    // Generate full report if requested
    if (argv.report === "all" || argv.report === "full") {
      console.log("🔄 Generating full report...");
      fullReport = await generateFullReport(commits, branch, apiKey, model, provider);
      console.log("✅ Full report generated\n");
    }

    // Generate summary if requested
    if (argv.report === "all" || argv.report === "summary") {
      console.log("🔄 Generating summary...");
      const context = fullReport || commits;
      summaryReport = await generateSummaryReport(
        commits,
        context,
        branch,
        apiKey,
        model,
        provider
      );
      console.log("✅ Summary generated\n");
    }

    // Display formatted reports
    const formattedOutput = formatReports(fullReport, summaryReport, dateStr);
    console.log(formattedOutput);

    // Copy to clipboard if requested
    if (argv.copy) {
      console.log("📋 Copying to clipboard...");
      const clipboardContent = fullReport
        ? fullReport + "\n\n---\n\n" + summaryReport
        : summaryReport;
      await clipboardy.write(clipboardContent);
      console.log("✅ Copied to clipboard!\n");
    }
  } catch (error) {
    console.error("❌ Error generating reports:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
