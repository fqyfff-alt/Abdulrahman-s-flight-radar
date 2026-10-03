/**
 * env-check.js — works out WHY the OpenSky credentials weren't found, so the
 * anonymous-mode warning can say exactly what to fix.
 *
 * It only ever prints file names and variable NAMES, never your secret values.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const REQUIRED_NAMES = ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'];

/** Read a .env-style file into { NAME: value } using dotenv's own parser. */
function readEnvFile(filePath) {
  return dotenv.parse(fs.readFileSync(filePath));
}

/** True if someone typed the credentials into .env.example by mistake. */
function exampleFileHasValues(folder) {
  const examplePath = path.join(folder, '.env.example');
  if (!fs.existsSync(examplePath)) {
    return false;
  }
  const values = readEnvFile(examplePath);
  return REQUIRED_NAMES.some((name) => Boolean(values[name]));
}

/** Returns a one-paragraph, plain-language explanation of what's wrong. */
export function explainMissingCredentials() {
  // dotenv looks for .env in the folder the program was started from.
  // (`npm start` always starts from the project folder, next to package.json.)
  const folder = process.cwd();
  const envPath = path.join(folder, '.env');

  const wrongFileMessage =
    'Your credentials are in ".env.example" instead of ".env". Move them into ".env", ' +
    'and empty ".env.example" again: unlike .env, it IS uploaded to GitHub.';

  // 1. Is there a .env file at all?
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(`${envPath}.txt`)) {
      return 'Found ".env.txt" but no ".env". Windows hides the ".txt" ending, so rename the file to exactly ".env".';
    }
    if (exampleFileHasValues(folder)) {
      return wrongFileMessage;
    }
    return `There is no ".env" file in ${folder}. Create one with:  cp .env.example .env`;
  }

  // 2. Is it saved in a format dotenv can read? UTF-16 ("Unicode") text stores
  //    a zero byte after every English letter, which normal text never contains.
  if (fs.readFileSync(envPath).includes(0)) {
    return (
      '".env" is saved in UTF-16 ("Unicode") format, which can\'t be read. In VS Code, click ' +
      '"UTF-16 LE" in the bottom-right corner → "Save with Encoding" → "UTF-8".'
    );
  }

  // 3. Are both names in the file, with values after the "="?
  const values = readEnvFile(envPath);
  const problems = [];
  for (const name of REQUIRED_NAMES) {
    if (!(name in values)) {
      problems.push(`${name} is missing`);
    } else if (values[name] === '') {
      problems.push(`${name} has no value after the "="`);
    }
  }

  if (problems.length > 0) {
    if (exampleFileHasValues(folder)) {
      return wrongFileMessage;
    }
    const namesFound = Object.keys(values).join(', ') || '(none)';
    return (
      `In ${envPath}: ${problems.join('; ')}. Variable names found in the file: ${namesFound}. ` +
      'Each line must look like OPENSKY_CLIENT_ID=your-value (exact spelling, no # at the start). ' +
      "Don't paste the whole credentials.json, just the two values. Then save the file (Ctrl+S)."
    );
  }

  // 4. The file looks right, so the server was probably started before it was saved.
  return '".env" looks correct now. Restart the server (Ctrl+C, then npm start) so it reads the file again.';
}
