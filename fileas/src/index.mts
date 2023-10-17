// Based on / copied from Vite Ecosystem CI: https://github.com/vitejs/vite-ecosystem-ci
import fs from 'fs';
import path from 'path';
import process from 'process';
import { cac } from 'cac';
import { setupEnvironment, $ } from './lib/common-utils.mjs';
import { CommandOptions, RepoOptions, RunOptions } from './lib/types.mjs';
import {
  buildVite,
  parseMajorVersion,
  parseViteMajor,
  runInRepo as viteRunInRepo,
  setupViteRepo,
} from './lib/utils-vite.mjs';
import { runInRepo as nxRunInRepo } from './lib/utils-nx.mjs';

const cli = cac();
cli
  .command('[...suites]', 'build and run selected suites')
  .option('--verify', 'verify checkouts by running tests', { default: false })
  .option('--ecosystem <ecosystem>', 'which ecosystem to run tests for', {
    default: undefined,
  })
  .option('--repo <repo>', 'vite repository to use', { default: 'vitejs/vite' })
  .option('--branch <branch>', 'vite branch to use', { default: 'main' })
  .option('--tag <tag>', 'vite tag to use')
  .option('--commit <commit>', 'vite commit sha to use')
  .option('--release <version>', 'vite release to use from npm registry')
  .option('--build <build>', 'build script', {
    default: 'build',
    type: [String],
  })
  .option('--test <test>', 'test script', { default: 'test', type: [String] })
  .option('--e2e <e2e>', 'e2e script', { default: 'e2e', type: [String] })
  .option('--optionsFile <optionsFile>', 'file with options', {
    default: undefined,
  })
  .action(async (_suites, options: CommandOptions) => {
    const { root, vitePath, workspace } = await setupEnvironment();
    if (!vitePath && options.ecosystem === 'vite') {
      throw new Error('Could not find vite path.');
    }
    let suiteOptions;
    if (options.optionsFile !== undefined) {
      const getSuitePath = path.join(process.cwd(), options.optionsFile);
      if (fs.existsSync(getSuitePath)) {
        suiteOptions = JSON.parse(
          fs.readFileSync(getSuitePath, 'utf-8')
        ) as RepoOptions;
      }
    }
    let viteMajor;
    if (options.ecosystem === 'vite') {
      if (!options.release) {
        await setupViteRepo();
        await buildVite({ verify: options.verify });
        viteMajor = parseViteMajor(vitePath as string);
      } else {
        viteMajor = parseMajorVersion(options.release);
      }
    }
    const runOptions: RunOptions = {
      root,
      vitePath,
      viteMajor,
      workspace,
      release: options.release,
      verify: options.verify,
      skipGit: false,
      build: options.build,
      test: options.test,
      e2e: options.e2e,
    };
    try {
      await run(suiteOptions ?? {}, runOptions, options.ecosystem);
    } catch (e) {
      await $`git add -A`;
      await $`git commit -m ecosystem-run-failed`;
      await $`git checkout -`;
      throw e;
    }
  });

cli.help();
cli.parse();

async function run(
  suiteOptions: RepoOptions,
  options: RunOptions,
  ecosystem: 'vite' | 'nx'
) {
  const finalOptions = {
    ...suiteOptions,
    ...options,
    workspace: path.resolve(options.workspace),
  };
  console.log('Run options: ', finalOptions);
  if (ecosystem === 'vite') {
    await viteRunInRepo(finalOptions);
  } else if (ecosystem === 'nx') {
    await nxRunInRepo(finalOptions);
  } else {
    throw new Error('Unknown ecosystem: ' + ecosystem);
  }
}
