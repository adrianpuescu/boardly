/**
 * Browser Stockfish (WASM) wrapper — runs the engine in a Web Worker via stockfish.js.
 * Assets are copied from `stockfish` npm into `/public/stockfish` by `scripts/copy-stockfish.mjs`.
 * Served by Next.js from the site root (e.g. `/stockfish/stockfish-18-lite-single.js`).
 */

import { Chess } from "chess.js";

const STOCKFISH_SCRIPT_PATH = "/stockfish/stockfish-18-lite-single.js";
const STOCKFISH_WASM_PATH = "/stockfish/stockfish-18-lite-single.wasm";

const INIT_HANDSHAKE_TIMEOUT_MS = 5000;
const GET_BEST_MOVE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }) as Promise<T>;
}

/** Uniform random legal move in UCI form — used for very low Skill Level to keep bots beatable. */
function pickRandomLegalUci(fen: string): string {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    throw new Error("No legal moves for random pick");
  }
  const mv = moves[Math.floor(Math.random() * moves.length)]!;
  let uci = `${mv.from}${mv.to}`;
  if (mv.promotion) uci += mv.promotion;
  return uci;
}

/**
 * Loads the Stockfish bundle via fetch and starts a Worker from the script source blob.
 * Patches the minified WASM URL assignment (`a=decodeURIComponent(...)`) — regex consumes both closing `)`
 * for `.replace(...)` and `decodeURIComponent(...)`. Blob workers break `location.origin` + `location.pathname`;
 * Stockfish overwrites `Module`, so `locateFile` is unreliable.
 */
async function createStockfishWorker(): Promise<Worker> {
  const wasmUrl = `${window.location.origin}${STOCKFISH_WASM_PATH}`;

  const response = await fetch(STOCKFISH_SCRIPT_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Stockfish script (${response.status}): ${STOCKFISH_SCRIPT_PATH}`
    );
  }
  const scriptText = await response.text();

  const patchedScript = scriptText.replace(
    /a=decodeURIComponent\(e\[0\]\|\|location\.origin\+location\.pathname\.replace[^)]+\)\)/,
    `a=${JSON.stringify(wasmUrl)}`
  );

  const blob = new Blob([patchedScript], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    return new Worker(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Stockfish Skill Level UCI option — validated range 1–20 for our presets. */
export class StockfishEngine {
  private worker: Worker | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private lineWaiters: Array<(line: string) => void> = [];
  private lineBuffer: string[] = [];
  private skillLevel = 10;

  /** Clears a failed startup so `init()` can be retried. */
  private resetAfterFailedInit(): void {
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this.lineBuffer = [];
    this.lineWaiters = [];
    this.initPromise = null;
  }

  async init(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("StockfishEngine.init() requires a browser environment");
    }
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.bootstrapWorkerAndHandshake();

    await this.initPromise;
    this.initialized = true;
  }

  private async bootstrapWorkerAndHandshake(): Promise<void> {
    try {
      this.worker = await createStockfishWorker();

      // Engine output may arrive as multiple lines in one postMessage — split so handshake / bestmove parsing don't hang.
      this.worker.onmessage = (ev: MessageEvent<string>) => {
        const raw =
          typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
        const lines = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          const waiter = this.lineWaiters.shift();
          if (waiter) waiter(line);
          else this.lineBuffer.push(line);
        }
      };

      await new Promise<void>((resolve, reject) => {
        this.worker!.onerror = (err: ErrorEvent) => {
          const e = err.error ?? err.message ?? err;
          reject(e instanceof Error ? e : new Error(String(e)));
        };

        void withTimeout(
          this.handshake(),
          INIT_HANDSHAKE_TIMEOUT_MS,
          `Stockfish init timed out after ${INIT_HANDSHAKE_TIMEOUT_MS}ms (no uciok / readyok)`
        )
          .then(() => resolve())
          .catch(reject);
      });

      this.worker.onerror = () => {
        this.resetAfterFailedInit();
      };
    } catch (e) {
      this.resetAfterFailedInit();
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  private async nextLine(): Promise<string> {
    if (this.lineBuffer.length > 0) {
      return this.lineBuffer.shift()!;
    }
    return new Promise((resolve) => {
      this.lineWaiters.push(resolve);
    });
  }

  private post(cmd: string): void {
    if (!this.worker) throw new Error("Stockfish worker not started");
    this.worker.postMessage(cmd);
  }

  private async handshake(): Promise<void> {
    this.post("uci");
    // Consume lines until uciok
    for (;;) {
      const line = await this.nextLine();
      if (line === "uciok") break;
    }
    this.post("isready");
    for (;;) {
      const line = await this.nextLine();
      if (line === "readyok") break;
    }
  }

  /**
   * Maps preset difficulties to Stockfish Skill Level (1–20).
   */
  setDifficulty(level: number): void {
    const clamped = Math.min(20, Math.max(1, Math.round(level)));
    this.skillLevel = clamped;
    if (!this.worker || !this.initialized) return;
    this.post(`setoption name Skill Level value ${clamped}`);
  }

  /** Applies Skill Level UCI option when the worker is running. */
  private syncSkillOption(): void {
    if (!this.worker) return;
    this.post(`setoption name Skill Level value ${this.skillLevel}`);
  }

  /**
   * Returns best move in UCI form (e.g. `e2e4`, `e7e8q`).
   */
  async getBestMove(fen: string): Promise<string> {
    await this.init();

    // Beginner (1): pure random — no Stockfish. Easy (2–3): partial randomness.
    if (this.skillLevel === 1) {
      return pickRandomLegalUci(fen);
    }

    this.syncSkillOption();

    if (this.skillLevel === 2 && Math.random() < 0.75) {
      return pickRandomLegalUci(fen);
    }
    if (this.skillLevel === 3 && Math.random() < 0.4) {
      return pickRandomLegalUci(fen);
    }

    this.post("ucinewgame");
    this.post(`position fen ${fen}`);
    const movetime = movetimeMsForSkill(this.skillLevel);
    this.post(`go movetime ${movetime}`);

    const waitForBestMove = async (): Promise<string> => {
      for (;;) {
        const line = await this.nextLine();
        if (line.startsWith("bestmove ")) {
          const rest = line.slice("bestmove ".length).trim();
          const token = rest.split(/\s+/)[0];
          if (!token || token === "(none)") {
            throw new Error("Stockfish returned no legal move");
          }
          return token;
        }
      }
    };

    return await withTimeout(
      waitForBestMove(),
      GET_BEST_MOVE_TIMEOUT_MS,
      `Stockfish getBestMove timed out after ${GET_BEST_MOVE_TIMEOUT_MS}ms (no bestmove)`
    );
  }

  dispose(): void {
    try {
      this.worker?.postMessage("quit");
    } catch {
      /* ignore */
    }
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    this.initPromise = null;
    this.lineBuffer = [];
    this.lineWaiters = [];
  }
}

function movetimeMsForSkill(skill: number): number {
  if (skill <= 4) return 120;
  if (skill <= 9) return 200;
  if (skill <= 14) return 320;
  return 480;
}

/** Parses UCI bestmove tokens such as `e2e4` or `e7e8q`. */
export function parseUciMove(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  const u = uci.trim();
  if (u.length < 4) {
    throw new Error("Invalid UCI move");
  }
  return {
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u.length >= 5 ? u.slice(4, 5) : undefined,
  };
}

let sharedEngine: StockfishEngine | null = null;

export function getSharedStockfishEngine(): StockfishEngine {
  if (!sharedEngine) sharedEngine = new StockfishEngine();
  return sharedEngine;
}

export function disposeSharedStockfishEngine(): void {
  sharedEngine?.dispose();
  sharedEngine = null;
}
