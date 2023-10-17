import type { Agent } from '@antfu/ni';
export interface EnvironmentData {
  root: string;
  workspace: string;
  cwd: string;
  env: ProcessEnv;
}

export interface RunOptions {
  workspace: string;
  root: string;
  verify?: boolean;
  skipGit?: boolean;
  release?: string;
  agent?: Agent;
  build?: Task | Task[];
  test?: Task | Task[];
  e2e?: Task | Task[];
  beforeInstall?: Task | Task[];
  beforeBuild?: Task | Task[];
  beforeTest?: Task | Task[];
}

type Task = string | (() => Promise<any>);

export interface CommandOptions {
  suites?: string[];
  repo?: string;
  branch?: string;
  tag?: string;
  build?: Task | Task[];
  test?: Task | Task[];
  e2e?: Task | Task[];
  optionsFile?: string;
  commit?: string;
  release?: string;
  verify?: boolean;
  skipGit?: boolean;
}

export interface RepoOptions {
  build?: Task | Task[];
  test?: Task | Task[];
  e2e?: Task | Task[];
  branch?: string;
}

export interface Overrides {
  [key: string]: string | boolean;
}

export interface ProcessEnv {
  [key: string]: string | undefined;
}
