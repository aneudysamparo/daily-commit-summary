#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import OpenAI from "openai";
import clipboardy from "clipboardy";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, ".env") });

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
    describe: "Report type to generate",
    type: "string",
    choices: ["all", "asana", "toptracker"],
    default: "all",
  })
  .option("api", {
    alias: "a",
    describe: "API provider: openai or perplexity",
    type: "string",
    default: "openai",
    choices: ["openai", "perplexity"],
  })
  .option("model", {
    alias: "m",
    describe: "Model name (optional, uses default if not specified)",
    type: "string",
    default: null,
  })
  .option("copy", {
    describe: "Copy reports to clipboard",
    type: "boolean",
    default: false,
  })
  .help()
  .alias("help", "h")
  .example(
    "daily-summary",
    "Generate all reports for today in current directory"
  )
  .example(
    "daily-summary -p ~/projects/myapp -r asana",
    "Generate Asana report for specific project"
  )
  .example(
    "daily-summary -d 2026-01-05 -r toptracker --copy",
    "Generate TopTracker report for specific date and copy to clipboard"
  )
  .parseSync();

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
 * Summarize with OpenAI
 */
async function callAI(commits, prompt, model, apiProvider) {
  if (apiProvider === "openai") {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.4,
    });

    return response.choices[0].message.content.trim();
  } else if (apiProvider === "perplexity") {
    const client = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: "https://api.perplexity.ai",
    });

    const response = await client.chat.completions.create({
      model: model || "llama-3.1-sonar-small-128k-online",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.4,
    });

    return response.choices[0].message.content.trim();
  }
}

/**
 * Generate Asana-style detailed report
 */
async function generateAsanaReport(commits, branch, api, model) {
  const prompt = `You are a professional project manager. Create a detailed daily work report in Asana format based on these git commits.

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

  return await callAI(commits, prompt, model, api);
}

/**
 * Generate TopTracker-style summary
 */
async function generateTopTrackerSummary(commits, asanaReport, branch, api, model) {
  const prompt = `You are creating a brief end-of-day work log entry for TopTracker (~150-200 characters, single line).

Based on this detailed Asana report and git commits, create a concise summary.

Requirements:
- Max 200 characters
- Single sentence or two short ones
- First person ("I worked on...", "Fixed...", "Added...")
- Include feature/component name when relevant
- Professional tone
- Start with action verb

Asana Report:
${asanaReport}

Git commits:
${commits}

Branch: ${branch}

Generate the TopTracker summary (keep it short and punchy):`;

  return await callAI(commits, prompt, model, api);
}

/**
 * Format reports for display
 */
function formatReports(asanaReport, topTrackerSummary, dateStr) {
  const date = dateStr || new Date().toISOString().split("T")[0];
  let output = `\n${"═".repeat(70)}\n`;
  output += `📅 Daily Report - ${date}\n`;
  output += `${"═".repeat(70)}\n\n`;

  if (asanaReport) {
    output += `📋 ASANA REPORT\n`;
    output += `${"─".repeat(70)}\n`;
    output += asanaReport;
    output += `\n\n`;
  }

  if (topTrackerSummary) {
    output += `⏱️  TOPTRACKER SUMMARY\n`;
    output += `${"─".repeat(70)}\n`;
    output += `"${topTrackerSummary}"\n`;
    output += `📊 Characters: ${topTrackerSummary.length}/200\n\n`;
  }

  output += `${"═".repeat(70)}\n`;
  return output;
}

/**
 * Save reports to file
 */
async function saveReportsToFile(asanaReport, topTrackerSummary, dateStr) {
  const fs = await import("fs");
  const date = dateStr || new Date().toISOString().split("T")[0];
  const fileName = `daily-report-${date}.md`;

  let content = `# Daily Report - ${date}\n\n`;
  if (asanaReport) {
    content += `## Asana Report\n\n${asanaReport}\n\n`;
  }
  if (topTrackerSummary) {
    content += `## TopTracker Summary\n\n${topTrackerSummary}\n\n`;
  }

  fs.writeFileSync(fileName, content);
  return fileName;
}

/**
 * Main function
 */
async function main() {
  const repoPath = resolve(argv.path);
  const branch = getCurrentBranch(repoPath);
  const dateStr = argv.date;

  // Display header
  console.log("\n");
  console.log("🎯 Daily Commit Summary Generator");
  console.log("═".repeat(70));
  console.log(`📍 Repository: ${repoPath}`);
  console.log(`🌿 Branch: ${branch}`);
  console.log(`📅 Date: ${dateStr || "Today"}`);
  console.log(`📊 Reports: ${argv.report.toUpperCase()}`);
  console.log(`🤖 API: ${argv.api}`);
  if (argv.model) console.log(`🎯 Model: ${argv.model}`);
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

  let asanaReport = null;
  let topTrackerSummary = null;

  try {
    // Generate Asana report if requested
    if (argv.report === "all" || argv.report === "asana") {
      console.log("🔄 Generating Asana report...");
      asanaReport = await generateAsanaReport(commits, branch, argv.api, argv.model);
      console.log("✅ Asana report generated\n");
    }

    // Generate TopTracker summary if requested
    if (argv.report === "all" || argv.report === "toptracker") {
      console.log("🔄 Generating TopTracker summary...");
      // If we have Asana report, use it for context; otherwise use commits
      const context = asanaReport || commits;
      topTrackerSummary = await generateTopTrackerSummary(
        commits,
        context,
        branch,
        argv.api,
        argv.model
      );
      console.log("✅ TopTracker summary generated\n");
    }

    // Display formatted reports
    const formattedOutput = formatReports(asanaReport, topTrackerSummary, dateStr);
    console.log(formattedOutput);

    // Copy to clipboard if requested
    if (argv.copy) {
      console.log("📋 Copying to clipboard...");
      const clipboardContent = asanaReport ? asanaReport + "\n\n---\n\n" + topTrackerSummary : topTrackerSummary;
      await clipboardy.write(clipboardContent);
      console.log("✅ Copied to clipboard!\n");
    }

    // Optional: Save to file
    // const fileName = await saveReportsToFile(asanaReport, topTrackerSummary, dateStr);
    // console.log(`💾 Reports saved to: ${fileName}\n`);
  } catch (error) {
    console.error("❌ Error generating reports:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
