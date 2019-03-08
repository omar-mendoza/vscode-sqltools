import Dialects from '@sqltools/core/dialect';
import GenericDialect from '@sqltools/core/dialect/generic';
import SQLTools from '@sqltools/core/plugin-api';
import { commandExists } from '@sqltools/core/utils';
import SQLToolsLanguageServer from '@sqltools/language-server/server';
import { spawn, SpawnOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import { InstallDepRequest } from './contracts';

function run(
  command: string,
  args?: ReadonlyArray<string>,
  options: SpawnOptions = {}
): Promise<{ stdout?: string; stderr?: string; code: number }> {
  return new Promise<{ stdout?: string; stderr?: string; code: number }>(
    (resolve, reject) => {
      options.env = {
        ...process.env,
        NODE_VERSION: process.versions.node,
        ...options.env,
      };
      const child = spawn(command, args, { cwd: __dirname, ...options });
      let stderr = '';
      let stdout = '';

      if (!options.stdio) {
        child.stdout.on('data', chunk => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', chunk => {
          stderr += chunk.toString();
        });
      }

      child.on('exit', code => {
        if (code !== 0) {
          return reject({
            code,
            stderr
          });
        }
        return resolve({
          code,
          stdout,
          stderr
        });
      });
    }
  );
}

export default class DependencyManager implements SQLTools.LanguageServerPlugin {
  private root: string;
  private server: SQLToolsLanguageServer;


 private onRequestToInstall = async (params) => {
    console.debug('Received request to install deps:', JSON.stringify(params));
    const DialectClass = Dialects[params.dialect];
    if (
      !DialectClass ||
      !DialectClass.deps ||
      DialectClass.deps.length === 0
    ) {
      throw new Error('Nothing to install. Request is invalid.');
    }

    const deps: typeof GenericDialect['deps'] = DialectClass.deps;

    for (let dep of deps) {
      switch(dep.type) {
        case 'npmscript':
          console.debug(`Will run ${dep.name} script`);
          await this.runNpmScript(dep.name, { env: dep.env });
          console.debug(`Finished ${dep.name} script`);
          break;
        case 'package':
          console.debug(`Will install ${dep.name} package`);
          await this.install(`${dep.name}${dep.version ? `@${dep.version}` : ''}`, { env: dep.env });
          console.debug(`Finished ${dep.name} script`);
          break;
      }

    }
    console.debug('Finished installing deps');
  }

  public register(server: SQLToolsLanguageServer) {
    this.server = this.server || server;

    this.server.addOnInitializeHook(({ initializationOptions }) => {
      this.root = initializationOptions.extensionPath || __dirname;
      return { capabilities: {} };
    });

    try {
      fs.mkdirSync(path.join(this.root, 'node_modules'))
    } catch (error) {};

    this.server.onRequest(InstallDepRequest, this.onRequestToInstall);
  }

  private npm(args: ReadonlyArray<string>, options: SpawnOptions = {}) {
    if (!commandExists('npm')) {
      throw new Error('You need to install node@6 or newer and npm first to install dependencies. Install it and restart to continue.');
    }
    return run('npm', args, { cwd: this.root, shell: true, stdio: [ process.stdin, process.stdout, process.stderr ], ...options });
  }

  get npmVersion() {
    return this.npm(['--version']).then(({ stdout }) =>
      stdout.replace('\n', '')
    );
  }

  public async install(args: string | string[], options: SpawnOptions = {}) {
    return this.npm(['install', ...(Array.isArray(args) ? args : [args]) ], options);
  }

  public async runNpmScript(scriptName: string, options: SpawnOptions = {}) {
    return this.npm(['run', scriptName ], options);
  }
}
