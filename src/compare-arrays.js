#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORK_DIR = __dirname;
const sourceFile = path.join(WORK_DIR, 'all-names-array.js');
const OUTPUT_DIR = path.join(WORK_DIR, '..', 'output');
const reportFile = path.join(OUTPUT_DIR, 'compare-report.md');
const FILES_DIR = path.join(WORK_DIR, '..', 'files');
const PDFS_DIR = path.join(FILES_DIR, 'pdfs');
const MEDIA_DIR = path.join(FILES_DIR, 'media');

function parseArrayFromSource(sourceText, arrayName) {
  const assignRegex = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[`, 'm');
  const assignMatch = assignRegex.exec(sourceText);

  if (!assignMatch) {
    throw new Error(`Could not find array: ${arrayName}`);
  }

  const startIndex = assignMatch.index + assignMatch[0].length - 1;
  let depth = 0;
  let endIndex = -1;

  for (let i = startIndex; i < sourceText.length; i += 1) {
    const ch = sourceText[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    throw new Error(`Could not parse array boundaries for: ${arrayName}`);
  }

  const content = sourceText.slice(startIndex, endIndex + 1);
  return JSON.parse(content);
}

function normalize(text) {
  return text
    .normalize('NFKC')
    .replace(/[()\-_,.:;'"\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);

  if (maxLen === 0) return 1;
  const distance = levenshtein(na, nb);
  return 1 - distance / maxLen;
}

function findBestCandidate(item, candidates) {
  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = similarity(item, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return { best, score: bestScore };
}

function toLines(title, items) {
  const lines = [`## ${title} (${items.length})`, ''];

  if (items.length === 0) {
    lines.push('- None');
    lines.push('');
    return lines;
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }

  lines.push('');
  return lines;
}

function getFileExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext || '<no extension>';
}

function listInvalidFormats(dirPath, allowedExts) {
  if (!fs.existsSync(dirPath)) {
    return [`Folder not found: ${dirPath}`];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const invalid = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === '.gitkeep') continue;

    const ext = getFileExtension(entry.name);
    if (!allowedExts.includes(ext)) {
      invalid.push(`${entry.name} (format: ${ext})`);
    }
  }

  return invalid.sort((a, b) => a.localeCompare(b));
}

function clearOutputDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function main() {
  const NEAR_MATCH_THRESHOLD = 0.65;
  clearOutputDirectory(OUTPUT_DIR);
  const sourceText = fs.readFileSync(sourceFile, 'utf8');
  const excel = parseArrayFromSource(sourceText, 'excel');
  const files = parseArrayFromSource(sourceText, 'files');

  const excelSet = new Set(excel);
  const filesSet = new Set(files);

  const exactMatches = excel.filter((item) => filesSet.has(item)).sort((a, b) => a.localeCompare(b));
  const missingInFilesAll = excel.filter((item) => !filesSet.has(item)).sort((a, b) => a.localeCompare(b));
  const missingInExcelAll = files.filter((item) => !excelSet.has(item)).sort((a, b) => a.localeCompare(b));

  const candidates = [];
  for (const excelItem of missingInFilesAll) {
    for (const fileItem of missingInExcelAll) {
      const score = similarity(excelItem, fileItem);
      if (score >= NEAR_MATCH_THRESHOLD) {
        candidates.push({ excelItem, fileItem, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const matchedExcel = new Set();
  const matchedFiles = new Set();
  const nearPairs = [];

  for (const candidate of candidates) {
    if (matchedExcel.has(candidate.excelItem) || matchedFiles.has(candidate.fileItem)) {
      continue;
    }

    matchedExcel.add(candidate.excelItem);
    matchedFiles.add(candidate.fileItem);
    nearPairs.push(candidate);
  }

  const missingInFiles = missingInFilesAll
    .filter((item) => !matchedExcel.has(item))
    .sort((a, b) => a.localeCompare(b));
  const missingInExcel = missingInExcelAll
    .filter((item) => !matchedFiles.has(item))
    .sort((a, b) => a.localeCompare(b));

  const possibleNearMatches = nearPairs
    .sort((a, b) => a.excelItem.localeCompare(b.excelItem))
    .map(
      (pair) =>
        `Excel: ${pair.excelItem} | Files: ${pair.fileItem} (similarity ${(pair.score * 100).toFixed(1)}%)`
    );

  const invalidInPdfs = listInvalidFormats(PDFS_DIR, ['.pdf']);
  const invalidInMedia = listInvalidFormats(MEDIA_DIR, ['.mp3', '.mp4', '.wmv']);

  const reportLines = [];
  reportLines.push('# Array Comparison Report');
  reportLines.push('');
  reportLines.push(`- Source: ${path.basename(sourceFile)}`);
  reportLines.push(`- Excel count: ${excel.length}`);
  reportLines.push(`- Files count: ${files.length}`);
  reportLines.push(`- Exact matching: ${exactMatches.length}`);
  reportLines.push(`- Missing in files: ${missingInFiles.length}`);
  reportLines.push(`- Missing in excel: ${missingInExcel.length}`);
  reportLines.push(`- Not exact (near matches): ${possibleNearMatches.length}`);
  reportLines.push(`- Invalid formats in files/pdfs: ${invalidInPdfs.length}`);
  reportLines.push(`- Invalid formats in files/media: ${invalidInMedia.length}`);
  reportLines.push('');

  reportLines.push(...toLines('Matching (exact)', exactMatches));
  reportLines.push(...toLines('Missing in files (exists in excel only)', missingInFiles));
  reportLines.push(...toLines('Missing in excel (exists in files only)', missingInExcel));
  reportLines.push(...toLines('Not exact (possible near matches)', possibleNearMatches));
  reportLines.push(...toLines('Invalid formats in files/pdfs (allowed: .pdf)', invalidInPdfs));
  reportLines.push(...toLines('Invalid formats in files/media (allowed: .mp3, .mp4, .wmv)', invalidInMedia));

  fs.writeFileSync(reportFile, reportLines.join('\n'), 'utf8');

  console.log(`Report written: ${reportFile}`);
  console.log(`Exact matching: ${exactMatches.length}`);
  console.log(`Missing in files: ${missingInFiles.length}`);
  console.log(`Missing in excel: ${missingInExcel.length}`);
  console.log(`Not exact (near matches): ${possibleNearMatches.length}`);
  console.log(`Invalid formats in files/pdfs: ${invalidInPdfs.length}`);
  console.log(`Invalid formats in files/media: ${invalidInMedia.length}`);
}

main();
