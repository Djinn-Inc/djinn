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
  encrypted_key_share: string | null;
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

async function post<T>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function get<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
