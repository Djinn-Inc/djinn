/**
 * Subgraph query client for the Djinn Protocol.
 *
 * Uses plain fetch (no library dependency) to query The Graph's hosted
 * service or a local Graph node. Falls back gracefully when the subgraph
 * URL is not configured.
 */

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || "";

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

async function querySubgraph<T>(query: string): Promise<T | null> {
  if (!SUBGRAPH_URL) return null;

  const resp = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
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
  const result = await querySubgraph<{ geniuses: SubgraphGeniusEntry[] }>(`{
    geniuses(
      first: ${limit}
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
  const result = await querySubgraph<{
    trackRecordProofs: SubgraphTrackRecordProof[];
  }>(`{
    trackRecordProofs(
      where: { genius: "${geniusAddress.toLowerCase()}" }
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
  }`);

  return result?.trackRecordProofs ?? [];
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
