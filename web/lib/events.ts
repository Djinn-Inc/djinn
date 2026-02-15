/**
 * On-chain event queries for signal discovery, purchase history, and audit history.
 *
 * Uses ethers.js event queries (no subgraph) to index contract events.
 * Queries are chunked to avoid RPC provider rate limits on large block ranges.
 */

import { ethers } from "ethers";
import {
  SIGNAL_COMMITMENT_ABI,
  ESCROW_ABI,
  AUDIT_ABI,
  ADDRESSES,
} from "./contracts";

/** Max blocks per queryFilter call to avoid RPC rate limits. */
const BLOCK_CHUNK_SIZE = 10_000;

/**
 * Query contract events in chunks to handle large block ranges safely.
 * Falls back to querying the full range if provider doesn't support getBlockNumber.
 */
async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.ContractEventName,
  fromBlock: number,
): Promise<(ethers.EventLog | ethers.Log)[]> {
  let toBlock: number;
  try {
    toBlock = await contract.runner!.provider!.getBlockNumber();
  } catch {
    // Fallback: query without chunking (works for local dev)
    return contract.queryFilter(filter, fromBlock);
  }

  if (toBlock - fromBlock <= BLOCK_CHUNK_SIZE) {
    return contract.queryFilter(filter, fromBlock, toBlock);
  }

  const allEvents: (ethers.EventLog | ethers.Log)[] = [];
  for (let start = fromBlock; start <= toBlock; start += BLOCK_CHUNK_SIZE) {
    const end = Math.min(start + BLOCK_CHUNK_SIZE - 1, toBlock);
    const chunk = await contract.queryFilter(filter, start, end);
    allEvents.push(...chunk);
  }
  return allEvents;
}

export interface SignalEvent {
  signalId: string;
  genius: string;
  sport: string;
  maxPriceBps: bigint;
  slaMultiplierBps: bigint;
  expiresAt: bigint;
  blockNumber: number;
}

export async function getActiveSignals(
  provider: ethers.Provider,
  fromBlock: number = 0,
): Promise<SignalEvent[]> {
  const contract = new ethers.Contract(
    ADDRESSES.signalCommitment,
    SIGNAL_COMMITMENT_ABI,
    provider,
  );

  const filter = contract.filters.SignalCommitted();
  const events = await queryFilterChunked(contract, filter, fromBlock);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const signals: SignalEvent[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    if (!log.args) continue;

    const expiresAt = BigInt(log.args.expiresAt);
    if (expiresAt <= now) continue; // Skip expired

    signals.push({
      signalId: log.args.signalId.toString(),
      genius: log.args.genius as string,
      sport: log.args.sport as string,
      maxPriceBps: BigInt(log.args.maxPriceBps),
      slaMultiplierBps: BigInt(log.args.slaMultiplierBps),
      expiresAt,
      blockNumber: log.blockNumber,
    });
  }

  return signals;
}

export async function getSignalsByGenius(
  provider: ethers.Provider,
  geniusAddress: string,
  fromBlock: number = 0,
): Promise<SignalEvent[]> {
  const contract = new ethers.Contract(
    ADDRESSES.signalCommitment,
    SIGNAL_COMMITMENT_ABI,
    provider,
  );

  const filter = contract.filters.SignalCommitted(null, geniusAddress);
  const events = await queryFilterChunked(contract, filter, fromBlock);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const signals: SignalEvent[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    if (!log.args) continue;

    const expiresAt = BigInt(log.args.expiresAt);
    if (expiresAt <= now) continue;

    signals.push({
      signalId: log.args.signalId.toString(),
      genius: log.args.genius as string,
      sport: log.args.sport as string,
      maxPriceBps: BigInt(log.args.maxPriceBps),
      slaMultiplierBps: BigInt(log.args.slaMultiplierBps),
      expiresAt,
      blockNumber: log.blockNumber,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Purchase history
// ---------------------------------------------------------------------------

export interface PurchaseEvent {
  purchaseId: string;
  signalId: string;
  buyer: string;
  notional: bigint;
  feePaid: bigint;
  creditUsed: bigint;
  usdcPaid: bigint;
  blockNumber: number;
}

export async function getPurchasesByBuyer(
  provider: ethers.Provider,
  buyerAddress: string,
  fromBlock: number = 0,
): Promise<PurchaseEvent[]> {
  const contract = new ethers.Contract(
    ADDRESSES.escrow,
    ESCROW_ABI,
    provider,
  );

  const filter = contract.filters.SignalPurchased(null, buyerAddress);
  const events = await queryFilterChunked(contract, filter, fromBlock);

  const purchases: PurchaseEvent[] = [];

  for (const event of events) {
    const log = event as ethers.EventLog;
    if (!log.args) continue;

    purchases.push({
      purchaseId: log.args.purchaseId.toString(),
      signalId: log.args.signalId.toString(),
      buyer: log.args.buyer as string,
      notional: BigInt(log.args.notional),
      feePaid: BigInt(log.args.feePaid),
      creditUsed: BigInt(log.args.creditUsed),
      usdcPaid: BigInt(log.args.usdcPaid),
      blockNumber: log.blockNumber,
    });
  }

  return purchases;
}

// ---------------------------------------------------------------------------
// Audit history
// ---------------------------------------------------------------------------

export interface AuditEvent {
  genius: string;
  idiot: string;
  cycle: bigint;
  qualityScore: bigint;
  trancheA: bigint;
  trancheB: bigint;
  protocolFee: bigint;
  isEarlyExit: boolean;
  blockNumber: number;
}

export async function getAuditsByGenius(
  provider: ethers.Provider,
  geniusAddress: string,
  fromBlock: number = 0,
): Promise<AuditEvent[]> {
  const contract = new ethers.Contract(
    ADDRESSES.audit,
    AUDIT_ABI,
    provider,
  );

  const audits: AuditEvent[] = [];

  const auditFilter = contract.filters.AuditSettled(geniusAddress);
  const auditEvents = await queryFilterChunked(contract, auditFilter, fromBlock);

  for (const event of auditEvents) {
    const log = event as ethers.EventLog;
    if (!log.args) continue;

    audits.push({
      genius: log.args.genius as string,
      idiot: log.args.idiot as string,
      cycle: BigInt(log.args.cycle),
      qualityScore: BigInt(log.args.qualityScore),
      trancheA: BigInt(log.args.trancheA),
      trancheB: BigInt(log.args.trancheB),
      protocolFee: BigInt(log.args.protocolFee),
      isEarlyExit: false,
      blockNumber: log.blockNumber,
    });
  }

  const earlyExitFilter = contract.filters.EarlyExitSettled(geniusAddress);
  const earlyExitEvents = await queryFilterChunked(contract, earlyExitFilter, fromBlock);

  for (const event of earlyExitEvents) {
    const log = event as ethers.EventLog;
    if (!log.args) continue;

    audits.push({
      genius: log.args.genius as string,
      idiot: log.args.idiot as string,
      cycle: BigInt(log.args.cycle),
      qualityScore: BigInt(log.args.qualityScore),
      trancheA: 0n,
      trancheB: BigInt(log.args.creditsAwarded),
      protocolFee: 0n,
      isEarlyExit: true,
      blockNumber: log.blockNumber,
    });
  }

  audits.sort((a, b) => b.blockNumber - a.blockNumber);
  return audits;
}
