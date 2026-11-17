import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export interface AppServerOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  mode?: 'dev' | 'preview';
  buildBeforePreview?: boolean;
  missingEnv?: boolean;
  startupTimeoutMs?: number;
}

export interface AppServerHandle {
  url: string;
  port: number;
  isExternal: boolean;
  stop: () => Promise<void>;
}

async function allocateEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close(() => reject(new Error('Unable to allocate ephemeral port')));
        return;
      }
      const { port } = addr;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url: string, proc: ChildProcess, timeoutMs: number, logs: string[]): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let exitedCode: number | null = null;
  let exitedSignal: NodeJS.Signals | null = null;

  proc.once('exit', (code, signal) => {
    exitedCode = code;
    exitedSignal = signal;
  });

  while (Date.now() < deadline) {
    if (exitedCode !== null || exitedSignal !== null) {
      throw new Error(
        `App server exited prematurely (code=${String(exitedCode)}, signal=${String(exitedSignal)}).\nLogs:\n${logs.join('')}`,
      );
    }
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        return;
      }
    } catch {
      // Server not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${url}.\nLogs:\n${logs.join('')}`);
}

function buildViteEnv(options: AppServerOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.missingEnv) {
    env.VITE_SUPABASE_URL = '';
    env.VITE_SUPABASE_ANON_KEY = '';
    return env;
  }

  const resolvedUrl = options.supabaseUrl ?? process.env.E2E_LIVE_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
  const resolvedKey =
    options.supabaseAnonKey ?? process.env.E2E_LIVE_SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY ?? '';

  env.VITE_SUPABASE_URL = resolvedUrl;
  env.VITE_SUPABASE_ANON_KEY = resolvedKey;
  return env;
}

function resolveViteEntry(): string {
  return path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
}

function killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && proc.pid) {
    try {
      process.kill(-proc.pid, signal);
      return;
    } catch {
      // Fall back to direct child kill below
    }
  }
  proc.kill(signal);
}

async function runViteBuild(env: NodeJS.ProcessEnv, outDir: string): Promise<void> {
  const viteEntry = resolveViteEntry();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [viteEntry, 'build', '--outDir', outDir], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const output: string[] = [];
    child.stdout?.on('data', (d: Buffer) => output.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => output.push(d.toString()));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite build failed (code=${String(code)}):\n${output.join('')}`));
    });
  });
}

export async function startAppServer(options: AppServerOptions = {}): Promise<AppServerHandle> {
  if (!options.missingEnv && process.env.E2E_APP_URL) {
    const extUrl = process.env.E2E_APP_URL.replace(/\/+$/, '');
    const parsed = new URL(extUrl);
    return {
      url: extUrl,
      port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
      isExternal: true,
      stop: async () => {},
    };
  }

  const viteEntry = resolveViteEntry();
  if (!fs.existsSync(viteEntry)) {
    throw new Error(`Vite entry not found at ${viteEntry}. Ensure root dependencies are installed before launching the app.`);
  }

  const port = await allocateEphemeralPort();
  const mode = options.mode ?? 'dev';
  const env = buildViteEnv(options);
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000;

  let tempOutDir: string | null = null;
  let args: string[];

  if (mode === 'preview') {
    if (options.buildBeforePreview) {
      tempOutDir = path.join(REPO_ROOT, `.e2e-dist-${port}`);
      await runViteBuild(env, tempOutDir);
      args = ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', tempOutDir];
    } else {
      args = ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
    }
  } else {
    args = ['--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  }

  const proc = spawn(process.execPath, [viteEntry, ...args], {
    cwd: REPO_ROOT,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const logs: string[] = [];
  proc.stdout?.on('data', (d: Buffer) => logs.push(d.toString()));
  proc.stderr?.on('data', (d: Buffer) => logs.push(d.toString()));

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttpReady(url, proc, startupTimeoutMs, logs);
  } catch (err) {
    try {
      killProcessTree(proc, 'SIGTERM');
    } catch {
      // Ignore cleanup errors
    }
    if (tempOutDir && fs.existsSync(tempOutDir)) {
      fs.rmSync(tempOutDir, { recursive: true, force: true });
    }
    throw err;
  }

  const stop = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            killProcessTree(proc, 'SIGKILL');
          } catch {
            // Ignore cleanup errors
          }
          resolve();
        }, 3000);
        proc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          killProcessTree(proc, 'SIGTERM');
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }
    if (tempOutDir && fs.existsSync(tempOutDir)) {
      fs.rmSync(tempOutDir, { recursive: true, force: true });
    }
  };

  return {
    url,
    port,
    isExternal: false,
    stop,
  };
}

export async function startMissingEnvAppServer(): Promise<AppServerHandle> {
  return startAppServer({
    missingEnv: true,
    mode: 'dev',
  });
}
