/**
 * On-chain event queries for signal discovery, purchase history, and audit history.
 *
 * Uses ethers.js event queries (no subgraph) to index contract events.
 */

import { ethers } from "ethers";
import {
  SIGNAL_COMMITMENT_ABI,
  ESCROW_ABI,
  AUDIT_ABI,
  ADDRESSES,
} from "./contracts";

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
  const events = await contract.queryFilter(filter, fromBlock);
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
  const events = await contract.queryFilter(filter, fromBlock);
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
  const events = await contract.queryFilter(filter, fromBlock);

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
  const auditEvents = await contract.queryFilter(auditFilter, fromBlock);

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
  const earlyExitEvents = await contract.queryFilter(earlyExitFilter, fromBlock);

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
