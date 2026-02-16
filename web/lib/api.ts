/**
 * Typed HTTP clients for the Djinn validator and miner REST APIs.
 */

// ---------------------------------------------------------------------------
// Request / Response types (mirrors Pydantic models)
// ---------------------------------------------------------------------------

export interface StoreShareRequest {
  signal_id: string;
  genius_address: string;
  share_x: number;
  share_y: string; // Hex-encoded field element
  encrypted_key_share: string; // Hex-encoded
}

export interface StoreShareResponse {
  signal_id: string;
  stored: boolean;
}

export interface PurchaseRequest {
  buyer_address: string;
  sportsbook: string;
  available_indices: number[];
}

export interface PurchaseResponse {
  signal_id: string;
  status: string;
  available: boolean | null;
  encrypted_key_share: string | null; // Hex-encoded Shamir share y-value
  share_x: number | null; // Shamir share x-coordinate
  message: string;
}

export interface ValidatorHealthResponse {
  status: string;
  version: string;
  uid: number | null;
  shares_held: number;
  chain_connected: boolean;
  bt_connected: boolean;
}

export interface CandidateLine {
  index: number;
  sport: string;
  event_id: string;
  home_team: string;
  away_team: string;
  market: string;
  line: number | null;
  side: string;
}

export interface CheckRequest {
  lines: CandidateLine[];
}

export interface BookmakerAvailability {
  bookmaker: string;
  odds: number;
}

export interface LineResult {
  index: number;
  available: boolean;
  bookmakers: BookmakerAvailability[];
}

export interface CheckResponse {
  results: LineResult[];
  available_indices: number[];
  response_time_ms: number;
}

export interface MinerHealthResponse {
  status: string;
  version: string;
  uid: number | null;
  odds_api_connected: boolean;
  bt_connected: boolean;
  uptime_seconds: number;
}

// ---------------------------------------------------------------------------
// HTTP client helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;

/** Error subclass for API errors with status code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly url: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }

  /** True if the error is retryable (5xx or network failure). */
  get retryable(): boolean {
    return this.status >= 500;
  }

  /** True if rate-limited. */
  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/** Check if an error is retryable (5xx, network, or timeout). */
function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.retryable;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof TypeError) return true; // network errors
  return false;
}

/** Sleep for ms with optional jitter. */
function sleep(ms: number): Promise<void> {
  const jitter = ms * 0.2 * Math.random();
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok || res.status < 500) return res;
      // 5xx — retryable
      lastErr = new ApiError(
        res.status,
        await res.text().catch(() => res.statusText),
        url,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastErr = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
        // Timeouts are not retried
        throw lastErr;
      }
      lastErr = err;
      if (!isRetryable(err)) throw err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      await sleep(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

async function post<T>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, detail, url);
  }
  return res.json() as Promise<T>;
}

async function get<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const res = await fetchWithRetry(url, {}, timeoutMs);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, detail, url);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// ValidatorClient
// ---------------------------------------------------------------------------

export class ValidatorClient {
  constructor(private baseUrl: string) {}

  async storeShare(req: StoreShareRequest): Promise<StoreShareResponse> {
    return post<StoreShareResponse>(`${this.baseUrl}/v1/signal`, req);
  }

  async purchaseSignal(
    signalId: string,
    req: PurchaseRequest,
  ): Promise<PurchaseResponse> {
    return post<PurchaseResponse>(
      `${this.baseUrl}/v1/signal/${signalId}/purchase`,
      req,
    );
  }

  async health(): Promise<ValidatorHealthResponse> {
    return get<ValidatorHealthResponse>(`${this.baseUrl}/health`);
  }
}

// ---------------------------------------------------------------------------
// MinerClient
// ---------------------------------------------------------------------------

export class MinerClient {
  constructor(private baseUrl: string) {}

  async checkLines(req: CheckRequest): Promise<CheckResponse> {
    return post<CheckResponse>(`${this.baseUrl}/v1/check`, req);
  }

  async health(): Promise<MinerHealthResponse> {
    return get<MinerHealthResponse>(`${this.baseUrl}/health`);
  }
}

// ---------------------------------------------------------------------------
// Singleton instances (configured from env vars)
// ---------------------------------------------------------------------------

function getEnvOrDefault(envVar: string, devDefault: string): string {
  const val = process.env[envVar];
  if (val) return val;
  return devDefault;
}

function getValidatorUrls(): string[] {
  return getEnvOrDefault(
    "NEXT_PUBLIC_VALIDATOR_URL",
    "http://localhost:8421",
  ).split(",").filter((u) => u.trim().length > 0);
}

function getMinerUrl(): string {
  return getEnvOrDefault(
    "NEXT_PUBLIC_MINER_URL",
    "http://localhost:8422",
  );
}

export function getValidatorClients(): ValidatorClient[] {
  return getValidatorUrls().map((url) => new ValidatorClient(url.trim()));
}

export function getValidatorClient(): ValidatorClient {
  return new ValidatorClient(getValidatorUrls()[0].trim());
}

export function getMinerClient(): MinerClient {
  return new MinerClient(getMinerUrl());
}
