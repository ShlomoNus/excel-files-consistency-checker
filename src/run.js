#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'compare-arrays.js');

const result = spawnSync(process.execPath, [scriptPath], {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
