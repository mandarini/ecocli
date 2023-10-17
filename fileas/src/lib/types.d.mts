import type { Agent } from '@antfu/ni';
export interface EnvironmentData {
  root: string;
  vitePath?: string;
  workspace: string;
  cwd: string;
  env: ProcessEnv;
}

export interface RunOptions {
  workspace: string;
  vitePath?: string;
  viteMajor?: number;
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

type Task = string | { script: string; args?: string[] } | (() => Promise<any>);

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
  ecosystem: 'nx' | 'vite';
}

export interface RepoOptions {
  build?: Task | Task[];
  test?: Task | Task[];
  e2e?: Task | Task[];
  branch?: string;
  overrides?: Overrides;
}

export interface Overrides {
  [key: string]: string | boolean;
}

export interface ProcessEnv {
  [key: string]: string | undefined;
}

export interface PackageInfo {
  name: string;
  version: string;
  path: string;
  private: boolean;
  dependencies: Record<string, DependencyInfo>;
  devDependencies: Record<string, DependencyInfo>;
  optionalDependencies: Record<string, DependencyInfo>;
}
