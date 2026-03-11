import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecFileNoThrowResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: Error;
}

export async function execFileNoThrow(
  file: string,
  args: readonly string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
  }
): Promise<ExecFileNoThrowResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args as string[], {
      cwd: options?.cwd,
      env: options?.env,
      timeout: options?.timeout ?? 60000, // Default 60 second timeout
      maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024, // Default 10MB buffer
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      error: err,
    };
  }
}
