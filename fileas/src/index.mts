import * as fs from 'fs'; // ES Modules
import path from 'path';
import process from 'process';
import { cac } from 'cac';
import { CommandOptions, RepoOptions, RunOptions } from './lib/types.mjs';
import { runInRepo, setupEnvironment, $ } from './lib/utils.mjs';

const cli = cac();
cli
  .command('[...suites]', 'run selected suites')
  .option(
    '--verify',
    'verify checkouts by running tests before using next nx',
    { default: false }
  )
  .option('--build <build>', 'build script', {
    default: 'build',
    type: [String],
  })
  .option('--test <test>', 'test script', { default: 'test', type: [String] })
  .option('--e2e <e2e>', 'e2e script', { default: 'e2e', type: [String] })
  .option('--optionsFile <optionsFile>', 'file with options', {
    default: 'test-ecosystem.json',
    type: [String],
  })
  .action(async (suites, options: CommandOptions) => {
    const { root, workspace } = await setupEnvironment();
    let suiteOptions;
    if (options.optionsFile) {
      const getSuitePath = path.join(process.cwd(), options.optionsFile);
      if (fs.existsSync(getSuitePath)) {
        suiteOptions = JSON.parse(
          fs.readFileSync(getSuitePath, 'utf-8')
        ) as RepoOptions;
      }
    }

    const runOptions: RunOptions = {
      root,
      workspace,
      release: options.release,
      verify: options.verify,
      skipGit: false,
      build: options.build,
      test: options.test,
      e2e: options.e2e,
    };
    try {
      await run(suiteOptions ?? {}, runOptions);
    } catch (e) {
      await $`git add -A`;
      await $`git commit -m ecosystem-run-failed`;
      await $`git checkout -`;
      throw e;
    }
  });

cli.help();
cli.parse();

async function run(suiteOptions: RepoOptions, options: RunOptions) {
  const finalOptions = {
    ...suiteOptions,
    ...options,
    workspace: path.resolve(options.workspace),
  };
  console.log('Run options: ', finalOptions);
  await runInRepo(finalOptions);
}
