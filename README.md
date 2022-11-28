# VSCode Auto-Update

VSCode library that allows private extensions to automatically update

## How to use

-   install [package](https://www.npmjs.com/package/vscode-auto-update) (`vscode-auto-update`)
-   import checker `import { AutoUpdateChecker } from 'vscode-auto-update'`
-   add [relevant fields](#packagejson-config) to `package.json`
-   start checker `new AutoUpdateChecker({ ... })` (check [options](#options) for params)
-   you're good to go

## Package.json config

To use this extension, ensure the following:

-   Your `package.json` file contains a `publishConfig` field that contains a `registry` value. (use https://registry.npmjs.org/ when using NPM)
-   The uploaded packge contains exactly 1 `.vsix` file (does not matter where).

## Options

-   `config.friendlyName (string)` - Friendly name of extension, is displayed to the user when prompting for update permission
-   `config.requireUserConfirmation (bool)` - Whether to wait for user approval or to just install immediately
-   `config.forceUpdateOnTag (string, optional)` - If provided, force update without asking for user confirmation if a version with the given tag exists in the registry. See [npm docs](https://docs.npmjs.com/cli/v9/commands/npm-dist-tag) for more info on dist tags.
-   `config.onCheckFail ('notify'|'ignore')` - Warn the user when checking fails or not. Ignore is generally best here since the user being offline should not warrant a warning.
-   `config.onUpdateAvailable (callback, optional)` - Optional callback that can change behavior of installation
-   `config.checkInterval (number, default 1 hour)` - Interval by which checking occurs
-   `config.remote (object)` - contains info about remote to use
-   `config.remote.context (ExtensionContext)` - VSCode extension context. Used to determine remote (see below).

# Change Log

## 1.0.2

-   Reduce reload wait time (from 10s to 5s)

## 1.0.1

-   Reduce unnecessary files in package
-   Include sourcemap

## 1.0.0

-   Initial release
