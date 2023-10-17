import actionsCore from '@actions/core';
import { execaCommand } from 'execa';
import path from 'path';
import fs from 'fs';
import { EnvironmentData, ProcessEnv } from './types.mjs';
import { fileURLToPath } from 'url';

const isGitHubActions = !!process.env.GITHUB_ACTIONS;
let cwd: string;
let env: ProcessEnv;
let vitePath: string;

export function cd(dir: string) {
  cwd = path.resolve(cwd, dir);
}

export function getCwd() {
  return cwd;
}

export function getEnv() {
  return env;
}

export function getVitePath() {
  return vitePath;
}

export async function $(literals: TemplateStringsArray, ...values: any[]) {
  const cmd = literals.reduce(
    (result, current, i) =>
      result + current + (values?.[i] != null ? `${values[i]}` : ''),
    ''
  );

  if (isGitHubActions) {
    actionsCore.startGroup(`${cwd} $> ${cmd}`);
  } else {
    console.log(`${cwd} $> ${cmd}`);
  }

  const proc = execaCommand(cmd, {
    env,
    stdio: 'pipe',
    cwd,
  });
  proc.stdin && process.stdin.pipe(proc.stdin);
  proc.stdout && proc.stdout.pipe(process.stdout);
  proc.stderr && proc.stderr.pipe(process.stderr);
  const result = await proc;

  if (isGitHubActions) {
    actionsCore.endGroup();
  }

  return result.stdout;
}

export async function setupEnvironment(): Promise<EnvironmentData> {
  const root = dirnameFrom(import.meta.url);
  const workspace = path.resolve(process.cwd(), 'workspace');
  vitePath = path.resolve(workspace, 'vite');
  cwd = process.cwd();
  env = {
    ...process.env,
    CI: 'true',
    YARN_ENABLE_IMMUTABLE_INSTALLS: 'false', // to avoid errors with mutated lockfile due to overrides
    NODE_OPTIONS: '--max-old-space-size=6144', // GITHUB CI has 7GB max, stay below
    ECOSYSTEM_CI: 'true', // flag for tests, can be used to conditionally skip irrelevant tests.
    NO_COLOR: '1',
  };
  initWorkspace(workspace);
  return { root, workspace, vitePath, cwd, env };
}

export function dirnameFrom(url: string) {
  return path.dirname(fileURLToPath(url));
}

function initWorkspace(workspace: string) {
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(workspace, { recursive: true });
  }
  const eslintrc = path.join(workspace, '.eslintrc.json');
  if (!fs.existsSync(eslintrc)) {
    fs.writeFileSync(eslintrc, '{"root":true}\n', 'utf-8');
  }
  const editorconfig = path.join(workspace, '.editorconfig');
  if (!fs.existsSync(editorconfig)) {
    fs.writeFileSync(editorconfig, 'root = true\n', 'utf-8');
  }
}
