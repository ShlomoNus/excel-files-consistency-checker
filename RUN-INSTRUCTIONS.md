# Run Instructions

## What the app does
The app compares the lists and generates a report in Markdown format.

## Requirements
- Node.js installed on your machine (download: https://nodejs.org/en/download)
- Run commands from the project root folder

## File placement and naming
- Keep file names correct and consistent with the lists.
- PDF files must be in:

    files/pdfs

- Media files must be in (allowed formats: .mp3, .mp4, and .wmv):

    files/media

- Any other format (for example .pps) is reported as invalid format in the generated report.

- If a file is in the wrong folder or has a wrong name, the report will show missing items or mismatches.

## Run
1. Open a terminal in the project root folder.
2. Run:

    node src/run.js

## Output
The report is saved here:

output/compare-report.md

## Direct script run
You can also run the comparison script directly:

    node src/compare-arrays.js
