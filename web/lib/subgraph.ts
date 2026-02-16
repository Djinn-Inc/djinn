/**
 * Subgraph query client for the Djinn Protocol.
 *
 * Uses plain fetch (no library dependency) to query The Graph's hosted
 * service or a local Graph node. Falls back gracefully when the subgraph
 * URL is not configured.
 */

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || "";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface SubgraphGeniusEntry {
  id: string;
  totalSignals: string;
  activeSignals: string;
  totalPurchases: string;
  totalVolume: string;
  totalFeesEarned: string;
  aggregateQualityScore: string;
  totalAudits: string;
  collateralDeposited: string;
  totalSlashed: string;
  totalTrackRecordProofs: string;
}

export interface SubgraphTrackRecordProof {
  id: string;
  signalCount: string;
  totalGain: string;
  totalLoss: string;
  favCount: string;
  unfavCount: string;
  voidCount: string;
  proofHash: string;
  submittedAt: string;
}

export interface SubgraphProtocolStats {
  totalSignals: string;
  totalPurchases: string;
  totalVolume: string;
  totalAudits: string;
  uniqueGeniuses: string;
  uniqueIdiots: string;
  totalTrackRecordProofs: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function querySubgraph<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  if (!SUBGRAPH_URL) return null;

  const resp = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    console.warn(`Subgraph query failed: ${resp.status}`);
    return null;
  }

  const json: GraphQLResponse<T> = await resp.json();
  if (json.errors?.length) {
    console.warn("Subgraph errors:", json.errors);
    return null;
  }

  return json.data ?? null;
}

/** Check if the subgraph is configured */
export function isSubgraphConfigured(): boolean {
  return SUBGRAPH_URL.length > 0;
}

/** Fetch the leaderboard: top geniuses sorted by aggregate quality score */
export async function fetchLeaderboard(
  limit = 50,
): Promise<SubgraphGeniusEntry[]> {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const result = await querySubgraph<{ geniuses: SubgraphGeniusEntry[] }>(`{
    geniuses(
      first: ${safeLimit}
      orderBy: aggregateQualityScore
      orderDirection: desc
      where: { totalAudits_gt: "0" }
    ) {
      id
      totalSignals
      activeSignals
      totalPurchases
      totalVolume
      totalFeesEarned
      aggregateQualityScore
      totalAudits
      collateralDeposited
      totalSlashed
      totalTrackRecordProofs
    }
  }`);

  return result?.geniuses ?? [];
}

/** Fetch track record proofs for a specific genius */
export async function fetchTrackRecordProofs(
  geniusAddress: string,
): Promise<SubgraphTrackRecordProof[]> {
  if (!ETH_ADDRESS_RE.test(geniusAddress)) return [];

  const result = await querySubgraph<{
    trackRecordProofs: SubgraphTrackRecordProof[];
  }>(
    `query($genius: String!) {
      trackRecordProofs(
        where: { genius: $genius }
        orderBy: submittedAt
        orderDirection: desc
        first: 50
      ) {
        id
        signalCount
        totalGain
        totalLoss
        favCount
        unfavCount
        voidCount
        proofHash
        submittedAt
      }
    }`,
    { genius: geniusAddress.toLowerCase() },
  );

  return result?.trackRecordProofs ?? [];
}

// ---------------------------------------------------------------------------
// Genius signal queries (for track record proof auto-population)
// ---------------------------------------------------------------------------

export interface SubgraphSignalPurchase {
  id: string;
  onChainPurchaseId: string;
  notional: string;
  feePaid: string;
  outcome: string; // "Pending" | "Favorable" | "Unfavorable" | "Void"
  purchasedAt: string;
}

export interface SubgraphSignal {
  id: string;
  sport: string;
  maxPriceBps: string;
  slaMultiplierBps: string;
  status: string; // "Active" | "Purchased" | "Settled" | "Voided"
  createdAt: string;
  purchases: SubgraphSignalPurchase[];
}

/** Fetch a genius's signals with their purchase data (for track record proofs) */
export async function fetchGeniusSignals(
  geniusAddress: string,
  limit = 100,
): Promise<SubgraphSignal[]> {
  if (!ETH_ADDRESS_RE.test(geniusAddress)) return [];

  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const result = await querySubgraph<{ signals: SubgraphSignal[] }>(
    `query($genius: String!, $limit: Int!) {
      signals(
        where: { genius: $genius }
        orderBy: createdAt
        orderDirection: desc
        first: $limit
      ) {
        id
        sport
        maxPriceBps
        slaMultiplierBps
        status
        createdAt
        purchases(first: 10) {
          id
          onChainPurchaseId
          notional
          feePaid
          outcome
          purchasedAt
        }
      }
    }`,
    { genius: geniusAddress.toLowerCase(), limit: safeLimit },
  );

  return result?.signals ?? [];
}

/** Fetch protocol-wide statistics */
export async function fetchProtocolStats(): Promise<SubgraphProtocolStats | null> {
  const result = await querySubgraph<{
    protocolStats: SubgraphProtocolStats;
  }>(`{
    protocolStats(id: "1") {
      totalSignals
      totalPurchases
      totalVolume
      totalAudits
      uniqueGeniuses
      uniqueIdiots
      totalTrackRecordProofs
    }
  }`);

  return result?.protocolStats ?? null;
}
