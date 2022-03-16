#!/usr/bin/env node

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path');

const { randomChars, resolveFromModule, resolveFromRoot } = require('./utils')

const args = process.argv.slice(2)
const argsProjectIndex = args.findIndex(arg => ['-p', '--project'].includes(arg)) // prettier-ignore
const argsProjectValue = argsProjectIndex !== -1 ? args[argsProjectIndex + 1] : undefined // prettier-ignore

const files = args.filter(file => /\.(ts|tsx)$/.test(file))
if (files.length === 0) {
  process.exit(0)
}

const remainingArgsToForward = args.slice().filter(arg => !files.includes(arg))

if (argsProjectIndex !== -1) {
  remainingArgsToForward.splice(argsProjectIndex, 2)
}

// Load existing config
const tsconfigPath = argsProjectValue || resolveFromRoot('tsconfig.json')
const tsconfigContent = fs.readFileSync(tsconfigPath).toString()
// Use 'eval' to read the JSON as regular JavaScript syntax so that comments are allowed
let tsconfig = {}
eval(`tsconfig = ${tsconfigContent}`)

// Write a temp config file
const tmpTsconfigPath = resolveFromRoot(`tsconfig.${randomChars()}.json`)
const tmpTsconfig = {
  ...tsconfig,
  compilerOptions: {
    ...tsconfig.compilerOptions,
    skipLibCheck: true,
  },
  files,
  // include: [],
}
fs.writeFileSync(tmpTsconfigPath, JSON.stringify(tmpTsconfig, null, 2))

// Type-check our files
const { status, stdout } = spawnSync(
  /*resolveFromModule(
    'typescript',
    `../.bin/tsc${process.platform === 'win32' ? '.cmd' : ''}`,
  ),*/
  'tsc',
  ['-p', tmpTsconfigPath, ...remainingArgsToForward],
  { stdio: 'pipe' },
)

// Delete temp config file
fs.unlinkSync(tmpTsconfigPath)

if (status) {
  const lines = stdout?.toString()?.split('\n') ?? [];
  const allErrorFiles = [];
  const allErrorMessages = {};
  let lastMessages = null;
  lines.forEach((line) => {
    if (/^(.*?.tsx?)\(\d+,\d+\): /.test(line)) {
      const file = RegExp.$1;
      allErrorFiles.push(file);
      lastMessages = [line];
      allErrorMessages[file] = lastMessages;
    } else if (lastMessages) {
      lastMessages.push(line);
    }
  });
  if (allErrorFiles.length) {
    const checkFilesMap = {};
    const projectPath = `${process.cwd()}${path.sep}`;
    files.forEach((file) => {
      if (file.substr(0, projectPath.length) === projectPath) {
        checkFilesMap[file.substr(projectPath.length)] = true;
      } else {
        checkFilesMap[file] = true;
      }
    });
    const errorFiles = allErrorFiles.filter((file) => {
      return checkFilesMap[file];
    });
    if (errorFiles.length) {
      const errorMessages = errorFiles.map((file) => {
        return allErrorMessages[file].join('\n');
      });
      console.log(errorMessages.join('\n'));
      process.exit(status)
    }
  }
}
