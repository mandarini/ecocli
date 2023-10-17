# Nx Ecosystem CI cli prototype

Prototype for a CLI for Nx ecosystem CI: https://github.com/nrwl/nx-ecosystem-ci/tree/main

Based on Vite Ecosystem CI: https://github.com/vitejs/vite-ecosystem-ci

```shell
npx ecosystem-ci-prototype
```

npm: https://www.npmjs.com/package/ecosystem-ci-prototype

## Purpose

The purpose of this tool is to keep the ecosystem ci functionality into one place (rather that different clones per tool), and have the individual tools be able to invoke it, to test the integrations.

The way this would work would be the following scenario:

    I am a maintainer of a package that uses, for example, vite.

    I want to test the integration of my package with the latest changes on vite.

    Instead of adding a new test file under `vite-ecosystem-ci`, I just run `npx ecosystem-ci-prototype --ecosystem=vite` on my repo, and this runs the tests it's supposed to run.

Similarly, for Nx:

    I am a maintainer of a package that uses nx.

    I want to test the integration of my package with the latest changes on nx.

    Instead of adding a new test file under `nx-ecosystem-ci`, I just run `npx ecosystem-ci-prototype --ecosystem=nx` on my repo, and this runs the tests it's supposed to run.

Right now the code is tailored to run for just `nx` and `vite`, copying the logic from [nx-ecosystem-ci](https://github.com/nrwl/nx-ecosystem-ci/tree/main) and [vite-ecosystem-ci](https://github.com/vitejs/vite-ecosystem-ci). The same should be done for the rest of the `*-ecosystem-ci` repos.

This approach is not super-maintainable, it's just a prototype.

## Usage

Working for `nx` and `vite` for the moment.

Example usage:

### For Nx

1. Clone a repository that uses the Nx packages, for example the `nxext` repository:

```shell
git clone git@github.com:nxext/nx-extensions.git
```

2. Install the dependencies

```shell
cd nx-extensions
```

and

```shell
pnpm i
```

3. Run the ecosystem tests

```shell
npx ecosystem-ci-prototype@latest --ecosystem="nx" --build="build vue" --test="test vue"
```

### For vite

1. Clone a repository that uses the vite packages, for example the `nx` repository:

```shell
git clone git@github.com:nrwl/nx.git
```

2. Install the dependencies

```shell
cd nx
```

and

```shell
pnpm i
```

3. Run the ecosystem tests

```shell
npx ecosystem-ci-prototype@latest --ecosystem="vite" --build="build-project vite" --test="test vite" --test="e2e e2e-vite"
```
