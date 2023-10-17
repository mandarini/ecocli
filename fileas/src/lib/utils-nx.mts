import path from 'path';
import * as fs from 'fs'; // ES Modules
import { Overrides, RepoOptions, RunOptions, Task } from './types.mjs';
import { detect, AGENTS, Agent, getCommand } from '@antfu/ni';
import * as semver from 'semver';
import { cd, $ } from './common-utils.mjs';

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
        const scriptOrBin = task.trim().split(/\s+/)[0];
        if (scripts?.[scriptOrBin] != null) {
          const runTaskWithAgent = getCommand(agent, 'run', [task]);
          // For some reason, this is needed: to remove the quotes around the command
          await $`${runTaskWithAgent.replaceAll('"', '')}`;
        } else {
          await $`${task}`;
        }
      } else if (typeof task === 'function') {
        await task();
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
    e2e,
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
  const e2eCommand = toCommand(e2e, agent);

  const pkgFile = path.join(dir, 'package.json');
  const pkg = JSON.parse(await fs.promises.readFile(pkgFile, 'utf-8'));
  const pm = agent?.split('@')[0];

  await beforeInstallCommand?.(pkg.scripts);

  const frozenInstall = getCommand(agent, 'frozen');
  try {
    await $`${frozenInstall}`;
  } catch (e) {
    handleNoFrozenError(pm, e);
  }

  if (verify && test) {
    console.log(
      'Running tests suite before migrating to latest version of Nx.'
    );
    await beforeBuildCommand?.(pkg.scripts);
    await buildCommand?.(pkg.scripts);
    await beforeTestCommand?.(pkg.scripts);
    await testCommand?.(pkg.scripts);
    await e2eCommand?.(pkg.scripts);
  }

  await $`${pm} nx migrate next`;
  const justInstall = getCommand(agent, 'install');
  try {
    await $`${justInstall}`;
  } catch (e) {
    handleNoFrozenError(pm, e);
  }

  await $`${pm} nx migrate --run-migrations --if-exists --no-interactive`;

  console.log('PACKAGE SCRIPTS', pkg.scripts);

  await beforeBuildCommand?.(pkg.scripts);
  await buildCommand?.(pkg.scripts);
  if (test) {
    await beforeTestCommand?.(pkg.scripts);
    await testCommand?.(pkg.scripts);
  }

  await e2eCommand?.(pkg.scripts);

  await $`git add -A`;
  await $`git commit -m ecosystem-run-success`;
  await $`git checkout -`;
  return { dir };
}

async function handleNoFrozenError(pm: string, e: any) {
  if (
    (pm === 'pnpm' && e.message?.includes('ERR_PNPM_OUTDATED_LOCKFILE')) ||
    e.message?.includes('ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE')
  ) {
    console.warn(
      `Frozen install failed, falling back to non-frozen install. Error was: ${e.message}`
    );
    await $`${pm} install --no-frozen-lockfile`;
  } else {
    throw e;
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
  const versionInUse = pkg['packageManager']?.startsWith(`${pm}@`)
    ? pkg['packageManager'].substring(pm.length + 1)
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
      `detected ${pm}@${versionInUse} used in ${pkg['name']}, changing pkg.packageManager and pkg.engines.${pm} to enforce use of ${pm}@${overrideWithVersion}`
    );
    // corepack reads this and uses pnpm @ newVersion then
    pkg['packageManager'] = `${pm}@${overrideWithVersion}`;
    if (!pkg['engines']) {
      pkg['engines'] = {};
    }
    pkg['engines'][pm] = overrideWithVersion;

    if (pkg['devDependencies']?.[pm]) {
      // if for some reason the pm is in devDependencies, that would be a local version that'd be preferred over our forced global
      // so ensure it here too.
      pkg['devDependencies'][pm] = overrideWithVersion;
    }

    return true;
  }
  return false;
}

export async function applyPackageOverridesAndInstall(
  dir: string,
  pkg: any,
  overrides: Overrides = {}
) {
  // remove boolean flags
  overrides = Object.fromEntries(
    Object.entries(overrides)
      //eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_key, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value])
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

  if (pm === 'pnpm' || pm === 'yarn' || pm === 'npm') {
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

export async function getInstallCommand(dir: string): Promise<string> {
  const agent = await detect({ cwd: dir, autoInstall: false });
  if (!agent) {
    throw new Error(`failed to detect packageManager in ${dir}`);
  }
  // Remove version from agent string:
  // yarn@berry => yarn
  // pnpm@6, pnpm@7 => pnpm
  const pm = agent?.split('@')[0];
  if (pm === 'pnpm') {
    return `pnpm install --prefer-frozen-lockfile --prefer-offline --strict-peer-dependencies false`;
  } else if (pm === 'yarn') {
    return `yarn install`;
  } else if (pm === 'npm') {
    return `npm install`;
  } else {
    throw new Error(`unsupported package manager detected: ${pm}`);
  }
}
