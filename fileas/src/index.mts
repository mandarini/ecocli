import * as fs from 'fs'; // ES Modules
import path from 'path';
import process from 'process';
import { cac } from 'cac';
import { CommandOptions, RepoOptions, RunOptions } from './lib/types.mjs';
import { runInRepo, setupEnvironment } from './lib/utils.mjs';

const cli = cac();
cli
  .command('[...suites]', 'run selected suites')
  .option(
    '--verify',
    'verify checkouts by running tests before using next nx',
    { default: false }
  )
  .action(async (suites, options: CommandOptions) => {
    const { root, workspace } = await setupEnvironment();
    const currentWd = process.cwd();
    console.log('currentWd', currentWd);
    const getSuitePath = path.join(process.cwd(), 'test-nx.json');
    const suiteOptions = JSON.parse(
      fs.readFileSync(getSuitePath, 'utf-8')
    ) as RepoOptions;
    console.log('suiteOptions', suiteOptions);
    const runOptions: RunOptions = {
      root,
      workspace,
      release: options.release,
      verify: options.verify,
      skipGit: false,
    };
    console.log('runOptions', runOptions);
    await run(suiteOptions, runOptions);
  });

// cli
//   .command('run-suites [...suites]', 'run single suite')
//   .option('--verify', 'verify checkout by running tests before using next nx', {
//     default: false,
//   })
//   .action(async (suites, options: CommandOptions) => {
//     const { root, workspace } = await setupEnvironment();
//     const suitesToRun = getSuitesToRun(suites, root);
//     const runOptions: RunOptions = {
//       ...options,
//       root,
//       workspace,
//     };
//     for (const suite of suitesToRun) {
//       await run(suite, runOptions);
//     }
//   });

cli.help();
cli.parse();

async function run(suiteOptions: RepoOptions, options: RunOptions) {
  await runInRepo({
    ...suiteOptions,
    ...options,
    workspace: path.resolve(options.workspace, 'nx'),
  });
}

// function getSuitesToRun(suites: string[], root: string) {
//   let suitesToRun: string[] = suites;
//   const availableSuites: string[] = fs
//     .readdirSync(path.join(root, 'tests'))
//     .filter((f: string) => !f.startsWith('_') && f.endsWith('.ts'))
//     .map((f: string) => f.slice(0, -3));
//   availableSuites.sort();
//   if (suitesToRun.length === 0) {
//     suitesToRun = availableSuites;
//   } else {
//     const invalidSuites = suitesToRun.filter(
//       (x) => !x.startsWith('_') && !availableSuites.includes(x)
//     );
//     if (invalidSuites.length) {
//       console.log(`invalid suite(s): ${invalidSuites.join(', ')}`);
//       console.log(`available suites: ${availableSuites.join(', ')}`);
//       process.exit(1);
//     }
//   }
//   return suitesToRun;
// }
