#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import OpenAI from "openai";
import clipboardy from "clipboardy";
import inquirer from "inquirer";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Paths & basic env ----------
const LOCAL_ENV_PATH = resolve(__dirname, ".env");
if (existsSync(LOCAL_ENV_PATH)) {
  dotenv.config({ path: LOCAL_ENV_PATH });
}

const GLOBAL_CONFIG_PATH = resolve(os.homedir(), ".daily-commit-summary.json");

// ---------- Helpers for global config ----------
function loadGlobalConfig() {
  if (!existsSync(GLOBAL_CONFIG_PATH)) return {};
  try {
    const raw = readFileSync(GLOBAL_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveGlobalConfig(config) {
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function printGlobalConfig(config) {
  console.log("\n⚙️  Global config file:");
  console.log(`   ${GLOBAL_CONFIG_PATH}\n`);
  if (!Object.keys(config).length) {
    console.log("No global config set yet. Run `ds --init` to configure.\n");
    return;
  }

  Object.entries(config).forEach(([k, v]) => {
    const redacted =
      k.toLowerCase().includes("key") && v ? "**** (set)" : String(v);
    console.log(`${k} = ${redacted}`);
  });
  console.log("");
}

// ---------- Load env + config defaults ----------
const globalConfig = loadGlobalConfig();

const envOr = (key, fallback) =>
  process.env[key] !== undefined ? process.env[key] : fallback;

const DEFAULT_API_PROVIDER =
  globalConfig.apiProvider || envOr("API_PROVIDER", "openai");
const DEFAULT_REPORT_TYPE =
  globalConfig.defaultReport || envOr("DEFAULT_REPORT", "all");
const DEFAULT_COPY =
  globalConfig.defaultCopy ?? (envOr("DEFAULT_COPY", "false") === "true");

const DEFAULT_OPENAI_MODEL =
  globalConfig.openaiModel || envOr("OPENAI_MODEL", "gpt-4o-mini");
const DEFAULT_PERPLEXITY_MODEL =
  globalConfig.perplexityModel ||
  envOr("PERPLEXITY_MODEL", "llama-3.1-sonar-small-128k-online");

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
    describe: "API key (overrides config/env for chosen provider)",
    type: "string",
    default: null,
  })
  .option("model", {
    alias: "m",
    describe:
      "Model name (overrides config/env). Default: gpt-4o-mini / llama-3.1-sonar-small-128k-online",
    type: "string",
    default: null,
  })
  .option("copy", {
    describe: "Copy reports to clipboard",
    type: "boolean",
    default: DEFAULT_COPY,
  })
  .option("init", {
    describe: "Interactive setup of global config (like `npm init`)",
    type: "boolean",
    default: false,
  })
  .option("config", {
    describe: "Show current global config (like `git config --list`)",
    type: "boolean",
    default: false,
  })
  .help()
  .alias("help", "h")
  .parseSync();

// ---------- Interactive init ----------
async function runInitWizard() {
  console.log("\n🧙  Daily Commit Summary - Init");
  console.log("This will create/update your global config:");
  console.log(`  ${GLOBAL_CONFIG_PATH}\n`);

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "apiProvider",
      message: "Default API provider:",
      choices: [
        { name: "OpenAI", value: "openai" },
        { name: "Perplexity", value: "perplexity" },
      ],
      default: DEFAULT_API_PROVIDER,
    },
    {
      type: "input",
      name: "openaiKey",
      message: "OpenAI API key (leave blank if not using):",
      default: globalConfig.openaiKey || "",
    },
    {
      type: "input",
      name: "perplexityKey",
      message: "Perplexity API key (leave blank if not using):",
      default: globalConfig.perplexityKey || "",
    },
    {
      type: "input",
      name: "openaiModel",
      message: "Default OpenAI model:",
      default: DEFAULT_OPENAI_MODEL,
    },
    {
      type: "input",
      name: "perplexityModel",
      message: "Default Perplexity model:",
      default: DEFAULT_PERPLEXITY_MODEL,
    },
    {
      type: "list",
      name: "defaultReport",
      message: "Default report type:",
      choices: [
        { name: "all (full + summary)", value: "all" },
        { name: "full only", value: "full" },
        { name: "summary only", value: "summary" },
      ],
      default: DEFAULT_REPORT_TYPE,
    },
    {
      type: "confirm",
      name: "defaultCopy",
      message: "Copy to clipboard by default?",
      default: DEFAULT_COPY,
    },
  ]);

  const newConfig = {
    ...globalConfig,
    apiProvider: answers.apiProvider,
    openaiKey: answers.openaiKey,
    perplexityKey: answers.perplexityKey,
    openaiModel: answers.openaiModel,
    perplexityModel: answers.perplexityModel,
    defaultReport: answers.defaultReport,
    defaultCopy: answers.defaultCopy,
  };

  saveGlobalConfig(newConfig);

  console.log("\n✅ Global config saved.");
  printGlobalConfig(newConfig);
  process.exit(0);
}

// ---------- Config command ----------
if (argv.config) {
  console.log("\n⚙️  Daily Commit Summary - Config\n");
  printGlobalConfig(globalConfig);
  console.log("Tip: run `ds --init` to change these values.\n");
  process.exit(0);
}

if (argv.init) {
  // run interactive wizard then exit
  await runInitWizard();
}

// ---------- API config resolution & validation ----------
function getApiConfig(provider, cliKey, cliModel) {
  const selectedProvider = provider || DEFAULT_API_PROVIDER;

  let apiKey;
  let model;

  if (selectedProvider === "openai") {
    apiKey =
      cliKey ||
      globalConfig.openaiKey ||
      process.env.OPENAI_API_KEY ||
      null;
    model = cliModel || DEFAULT_OPENAI_MODEL;
  } else {
    apiKey =
      cliKey ||
      globalConfig.perplexityKey ||
      process.env.PERPLEXITY_API_KEY ||
      null;
    model = cliModel || DEFAULT_PERPLEXITY_MODEL;
  }

  const missing = [];
  if (!apiKey) missing.push("API key");

  if (missing.length) {
    console.error("\n❌ Missing required configuration:");
    if (!apiKey) {
      console.error(
        `   - No API key for provider \"${selectedProvider}\".`
      );
      console.error(
        `     Set it via one of:\n` +
          `       • ds --init\n` +
          `       • ds --api ${selectedProvider} --key YOUR_KEY\n` +
          `       • global config file: ${GLOBAL_CONFIG_PATH}\n` +
          `       • env var: ${
            selectedProvider === "openai"
              ? "OPENAI_API_KEY"
              : "PERPLEXITY_API_KEY"
          }\n`
      );
    }
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
