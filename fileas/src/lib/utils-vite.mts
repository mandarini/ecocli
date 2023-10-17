import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  PackageInfo,
  Overrides,
  RepoOptions,
  RunOptions,
  Task,
} from './types.mjs';
import { cd, getCwd, $, getVitePath } from './common-utils.mjs';
import { detect, AGENTS, Agent, getCommand } from '@antfu/ni';
import * as semver from 'semver';

export async function setupRepo() {
  // Always clone latest main branch from vite repo
  const branch = 'main';
  const shallow = true;
  const repo = 'vitejs/vite';
  const dir = 'tmp-vite-repo';
  let needClone = true;
  if (fs.existsSync(dir)) {
    const _cwd = getCwd();
    cd(dir);
    let currentClonedRepo: string | undefined;
    try {
      currentClonedRepo = await $`git ls-remote --get-url`;
    } catch {
      // when not a git repo
    }
    cd(_cwd);

    if (repo === currentClonedRepo) {
      needClone = false;
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  if (needClone) {
    await $`git -c advice.detachedHead=false clone ${
      shallow ? '--depth=1 --no-tags' : ''
    } --branch ${branch} ${repo} ${dir}`;
  }
  cd(dir);
  await $`git clean -fdxq`;
  await $`git fetch ${
    shallow ? '--depth=1 --no-tags' : '--tags'
  } origin ${branch}`;
  if (shallow) {
    await $`git -c advice.detachedHead=false checkout ${branch}`;
  } else {
    await $`git checkout ${branch}`;
    await $`git merge FETCH_HEAD`;
  }
}

function toCommand(
  task: Task | Task[] | void,
  agent: Agent
): ((scripts: any) => Promise<any>) | void {
  return async (scripts: any) => {
    const tasks = Array.isArray(task) ? task : [task];
    for (const task of tasks) {
      if (task == null || task === '') {
        continue;
      } else if (typeof task === 'string') {
        if (scripts[task] != null) {
          const runTaskWithAgent = getCommand(agent, 'run', [task]);
          await $`${runTaskWithAgent}`;
        } else {
          await $`${task}`;
        }
      } else if (typeof task === 'function') {
        await task();
      } else if (task?.script) {
        if (scripts[task.script] != null) {
          const runTaskWithAgent = getCommand(agent, 'run', [
            task.script,
            ...(task.args ?? []),
          ]);
          await $`${runTaskWithAgent}`;
        } else {
          throw new Error(
            `invalid task, script "${task.script}" does not exist in package.json`
          );
        }
      } else {
        throw new Error(
          `invalid task, expected string or function but got ${typeof task}: ${task}`
        );
      }
    }
  };
}

export async function runInRepo(options: RunOptions & RepoOptions) {
  if (options.verify == null) {
    options.verify = true;
  }
  if (options.skipGit == null) {
    options.skipGit = false;
  }
  if (options.branch == null) {
    options.branch = `tmp-ecosystem-ci-${Math.random().toString(36).slice(2)}`;
  }

  const {
    build,
    test,
    branch,
    verify,
    beforeInstall,
    beforeBuild,
    beforeTest,
  } = options;

  // Test current project
  const dir = process.cwd();

  cd(dir);
  await $`git checkout -b ${branch}`;
  if (options.agent == null) {
    const detectedAgent = await detect({ cwd: dir, autoInstall: false });
    if (detectedAgent == null) {
      throw new Error(`Failed to detect packagemanager in ${dir}`);
    }
    options.agent = detectedAgent;
  }
  if (!AGENTS[options.agent]) {
    throw new Error(
      `Invalid agent ${options.agent}. Allowed values: ${Object.keys(
        AGENTS
      ).join(', ')}`
    );
  }
  const agent = options.agent;
  const beforeInstallCommand = toCommand(beforeInstall, agent);
  const beforeBuildCommand = toCommand(beforeBuild, agent);
  const beforeTestCommand = toCommand(beforeTest, agent);
  const buildCommand = toCommand(build, agent);
  const testCommand = toCommand(test, agent);

  const pkgFile = path.join(dir, 'package.json');
  const pkg = JSON.parse(await fs.promises.readFile(pkgFile, 'utf-8'));

  await beforeInstallCommand?.(pkg.scripts);

  if (verify && test) {
    const frozenInstall = getCommand(agent, 'frozen');
    await $`${frozenInstall}`;
    await beforeBuildCommand?.(pkg.scripts);
    await buildCommand?.(pkg.scripts);
    await beforeTestCommand?.(pkg.scripts);
    await testCommand?.(pkg.scripts);
  }
  let overrides = options.overrides || {};
  if (options.release) {
    if (overrides.vite && overrides.vite !== options.release) {
      throw new Error(
        `conflicting overrides.vite=${overrides.vite} and --release=${options.release} config. Use either one or the other`
      );
    } else {
      overrides.vite = options.release;
    }
  } else {
    overrides.vite ||= `${options.vitePath}/packages/vite`;

    overrides[
      `@vitejs/plugin-legacy`
    ] ||= `${options.vitePath}/packages/plugin-legacy`;

    const vitePackageInfo = await getVitePackageInfo(
      options.vitePath as string
    );
    if (vitePackageInfo.dependencies.rollup?.version && !overrides.rollup) {
      overrides.rollup = vitePackageInfo.dependencies.rollup.version;
    }

    // build and apply local overrides
    const localOverrides = await buildOverrides(pkg, options, overrides);
    cd(dir); // buildOverrides changed dir, change it back
    overrides = {
      ...overrides,
      ...localOverrides,
    };
  }
  await applyPackageOverrides(dir, pkg, overrides);
  await beforeBuildCommand?.(pkg.scripts);
  await buildCommand?.(pkg.scripts);
  if (test) {
    await beforeTestCommand?.(pkg.scripts);
    await testCommand?.(pkg.scripts);
  }
  return { dir };
}

export async function setupViteRepo() {
  const repo = 'vitejs/vite';
  await setupRepo();

  try {
    const rootPackageJsonFile = path.join(getVitePath(), 'package.json');
    const rootPackageJson = JSON.parse(
      await fs.promises.readFile(rootPackageJsonFile, 'utf-8')
    );
    const viteMonoRepoNames = ['@vitejs/vite-monorepo', 'vite-monorepo'];
    const { name } = rootPackageJson;
    if (!viteMonoRepoNames.includes(name)) {
      throw new Error(
        `expected  "name" field of ${repo}/package.json to indicate vite monorepo, but got ${name}.`
      );
    }
    const needsWrite = await overridePackageManagerVersion(
      rootPackageJson,
      'pnpm'
    );
    if (needsWrite) {
      fs.writeFileSync(
        rootPackageJsonFile,
        JSON.stringify(rootPackageJson, null, 2),
        'utf-8'
      );
      if (rootPackageJson.devDependencies?.pnpm) {
        await $`pnpm install -Dw pnpm --lockfile-only`;
      }
    }
  } catch (e) {
    throw new Error(`Failed to setup vite repo`, { cause: e });
  }
}

export async function getPermanentRef() {
  cd(getVitePath());
  try {
    const ref = await $`git log -1 --pretty=format:%H`;
    return ref;
  } catch (e) {
    console.warn(`Failed to obtain perm ref. ${e}`);
    return undefined;
  }
}

export async function buildVite({ verify = false }) {
  cd(getVitePath());
  const frozenInstall = getCommand('pnpm', 'frozen');
  const runBuild = getCommand('pnpm', 'run', ['build']);
  const runTest = getCommand('pnpm', 'run', ['build']);
  await $`${frozenInstall}`;
  await $`${runBuild}`;
  if (verify) {
    await $`${runTest}`;
  }
}

export async function bisectVite(
  good: string,
  runSuite: () => Promise<Error | void>
) {
  // sometimes vite build modifies files in git, e.g. LICENSE.md
  // this would stop bisect, so to reset those changes
  const resetChanges = async () => $`git reset --hard HEAD`;

  try {
    cd(getVitePath());
    await resetChanges();
    await $`git bisect start`;
    await $`git bisect bad`;
    await $`git bisect good ${good}`;
    let bisecting = true;
    while (bisecting) {
      const commitMsg = await $`git log -1 --format=%s`;
      const isNonCodeCommit = commitMsg.match(/^(?:release|docs)[:(]/);
      if (isNonCodeCommit) {
        await $`git bisect skip`;
        continue; // see if next commit can be skipped too
      }
      const error = await runSuite();
      cd(getVitePath());
      await resetChanges();
      const bisectOut = await $`git bisect ${error ? 'bad' : 'good'}`;
      bisecting = bisectOut.substring(0, 10).toLowerCase() === 'bisecting:'; // as long as git prints 'bisecting: ' there are more revisions to test
    }
  } catch (e) {
    console.log('error while bisecting', e);
  } finally {
    try {
      cd(getVitePath());
      await $`git bisect reset`;
    } catch (e) {
      console.log('Error while resetting bisect', e);
    }
  }
}

function isLocalOverride(v: string): boolean {
  if (!v.includes('/') || v.startsWith('@')) {
    // not path-like (either a version number or a package name)
    return false;
  }
  try {
    return !!fs.lstatSync(v)?.isDirectory();
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
    return false;
  }
}

/**
 * utility to override packageManager version
 *
 * @param pkg parsed package.json
 * @param pm package manager to override eg. `pnpm`
 * @returns {boolean} true if pkg was updated, caller is responsible for writing it to disk
 */
async function overridePackageManagerVersion(
  pkg: { [key: string]: any },
  pm: string
): Promise<boolean> {
  const versionInUse = pkg.packageManager?.startsWith(`${pm}@`)
    ? pkg.packageManager.substring(pm.length + 1)
    : await $`${pm} --version`;
  let overrideWithVersion: string | null = null;
  if (pm === 'pnpm') {
    if (semver.eq(versionInUse, '7.18.0')) {
      // avoid bug with absolute overrides in pnpm 7.18.0
      overrideWithVersion = '7.18.1';
    }
  }
  if (overrideWithVersion) {
    console.warn(
      `detected ${pm}@${versionInUse} used in ${pkg.name}, changing pkg.packageManager and pkg.engines.${pm} to enforce use of ${pm}@${overrideWithVersion}`
    );
    // corepack reads this and uses pnpm @ newVersion then
    pkg.packageManager = `${pm}@${overrideWithVersion}`;
    if (!pkg.engines) {
      pkg.engines = {};
    }
    pkg.engines[pm] = overrideWithVersion;

    if (pkg.devDependencies?.[pm]) {
      // if for some reason the pm is in devDependencies, that would be a local version that'd be preferred over our forced global
      // so ensure it here too.
      pkg.devDependencies[pm] = overrideWithVersion;
    }

    return true;
  }
  return false;
}

export async function applyPackageOverrides(
  dir: string,
  pkg: any,
  overrides: Overrides = {}
) {
  const useFileProtocol = (v: string) =>
    isLocalOverride(v) ? `file:${path.resolve(v)}` : v;
  // remove boolean flags
  overrides = Object.fromEntries(
    Object.entries(overrides)
      //eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([key, value]) => typeof value === 'string')
      .map(([key, value]) => [key, useFileProtocol(value as string)])
  );
  await $`git clean -fdxq`; // remove current install

  const agent = await detect({ cwd: dir, autoInstall: false });
  if (!agent) {
    throw new Error(`failed to detect packageManager in ${dir}`);
  }
  // Remove version from agent string:
  // yarn@berry => yarn
  // pnpm@6, pnpm@7 => pnpm
  const pm = agent?.split('@')[0];

  await overridePackageManagerVersion(pkg, pm);

  if (pm === 'pnpm') {
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      ...overrides, // overrides must be present in devDependencies or dependencies otherwise they may not work
    };
    if (!pkg.pnpm) {
      pkg.pnpm = {};
    }
    pkg.pnpm.overrides = {
      ...pkg.pnpm.overrides,
      ...overrides,
    };
  } else if (pm === 'yarn') {
    pkg.resolutions = {
      ...pkg.resolutions,
      ...overrides,
    };
  } else if (pm === 'npm') {
    pkg.overrides = {
      ...pkg.overrides,
      ...overrides,
    };
    // npm does not allow overriding direct dependencies, force it by updating the blocks themselves
    for (const [name, version] of Object.entries(overrides)) {
      if (pkg.dependencies?.[name]) {
        pkg.dependencies[name] = version;
      }
      if (pkg.devDependencies?.[name]) {
        pkg.devDependencies[name] = version;
      }
    }
  } else {
    throw new Error(`unsupported package manager detected: ${pm}`);
  }
  const pkgFile = path.join(dir, 'package.json');
  await fs.promises.writeFile(pkgFile, JSON.stringify(pkg, null, 2), 'utf-8');

  // use of `ni` command here could cause lockfile violation errors so fall back to native commands that avoid these
  if (pm === 'pnpm') {
    await $`pnpm install --prefer-frozen-lockfile --prefer-offline --strict-peer-dependencies false`;
  } else if (pm === 'yarn') {
    await $`yarn install`;
  } else if (pm === 'npm') {
    await $`npm install`;
  }
}

export function parseViteMajor(vitePath: string): number {
  const content = fs.readFileSync(
    path.join(vitePath, 'packages', 'vite', 'package.json'),
    'utf-8'
  );
  const pkg = JSON.parse(content);
  return parseMajorVersion(pkg.version);
}

export function parseMajorVersion(version: string) {
  return parseInt(version.split('.', 1)[0], 10);
}

async function buildOverrides(
  pkg: any,
  options: RunOptions,
  repoOverrides: Overrides
) {
  const { root } = options;
  const buildsPath = path.join(root, 'builds');
  const buildFiles: string[] = fs
    .readdirSync(buildsPath)
    .filter((f: string) => !f.startsWith('_') && f.endsWith('.ts'))
    .map((f) => path.join(buildsPath, f));
  const buildDefinitions: {
    packages: { [key: string]: string };
    build: (options: RunOptions) => Promise<{ dir: string }>;
    dir?: string;
  }[] = await Promise.all(buildFiles.map((f) => import(pathToFileURL(f).href)));
  const deps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  const needsOverride = (p: string) =>
    repoOverrides[p] === true || (deps.has(p) && repoOverrides[p] == null);
  const buildsToRun = buildDefinitions.filter(({ packages }) =>
    Object.keys(packages).some(needsOverride)
  );
  const overrides: Overrides = {};
  for (const buildDef of buildsToRun) {
    const { dir } = await buildDef.build({
      root: options.root,
      workspace: options.workspace,
      vitePath: options.vitePath,
      viteMajor: options.viteMajor,
      skipGit: options.skipGit,
      release: options.release,
      verify: options.verify,
      // do not pass along scripts
    });
    for (const [name, path] of Object.entries(buildDef.packages)) {
      if (needsOverride(name)) {
        overrides[name] = `${dir}/${path}`;
      }
    }
  }
  return overrides;
}

/**
 * 	use pnpm ls to get information about installed dependency versions of vite
 * @param vitePath - workspace vite root
 */
async function getVitePackageInfo(vitePath: string): Promise<PackageInfo> {
  try {
    const lsOutput = await $`pnpm --dir ${vitePath}/packages/vite ls --json`;
    const lsParsed = JSON.parse(lsOutput);
    return lsParsed[0] as PackageInfo;
  } catch (e) {
    console.error('failed to retrieve vite package infos', e);
    throw e;
  }
}
