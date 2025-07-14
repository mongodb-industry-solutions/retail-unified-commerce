/**
 * 📄 Script: generate-third-party-notices.js
 *
 * This Node.js script generates a human-readable `THIRD-PARTY-NOTICES.md` file
 * from the `third-party-licenses.json` output produced by `license-checker`.
 *
 * ✅ Usage:
 * 1. First, generate the raw license data:
 *    npx --no-install license-checker --production --json > third-party-licenses.json
 *
 * 2. Then, run this script:
 *    node docs/scripts/generate-third-party-notices.js
 *
 * 🔧 What it does:
 * - Parses the JSON file with license info
 * - Outputs a Markdown file with package names, versions, licenses, repo links, and license text (if available)
 * - Wraps license texts in collapsible `<details>` blocks to keep the output readable
 *
 * 📁 Expected File Structure:
 * - Input:  docs/scripts/third-party-licenses.json
 * - Output: docs/scripts/THIRD-PARTY-NOTICES.md (or update paths as needed)
 *
 * 💡 Store this script in `docs/scripts/` or equivalent for future reuse.
 */

const fs = require('fs');
const path = require('path');

// Input and output paths (can be adjusted as needed)
const inputPath = path.resolve(__dirname, 'third-party-licenses.json');
const outputPath = path.resolve(__dirname, 'THIRD-PARTY-NOTICES.md');

// Load and parse the license metadata
const jsonData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const output = [];

// Markdown header
output.push('# 📦 Third-Party Notices\n');
output.push('This project uses the following third-party open source components:\n');

// Process each dependency and format as Markdown
for (const [pkg, meta] of Object.entries(jsonData)) {
  output.push(`---\n### 📦 ${pkg}`);
  output.push(`- Version: ${meta.version}`);
  output.push(`- License: ${meta.licenses}`);
  if (meta.repository) output.push(`- Repository: ${meta.repository}`);
  if (meta.publisher) output.push(`- Publisher: ${meta.publisher}`);
  if (meta.email) output.push(`- Email: ${meta.email}`);

  // Attempt to include license file text if available
  if (meta.licenseFile) {
    try {
      const licenseText = fs.readFileSync(meta.licenseFile, 'utf-8');
      output.push('\n<details><summary>License Text</summary>\n\n```text\n' + licenseText.trim() + '\n```\n</details>');
    } catch {
      output.push('\n_⚠️ License file not found locally._');
    }
  }

  output.push('\n'); // Spacer
}

// Write the formatted output to disk
fs.writeFileSync(outputPath, output.join('\n'), 'utf-8');
console.log('✅ THIRD-PARTY-NOTICES.md has been generated.');
