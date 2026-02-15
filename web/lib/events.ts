/**
 * On-chain event queries for signal discovery.
 *
 * Uses ethers.js event queries (no subgraph) to index SignalCommitted events.
 */

import { ethers } from "ethers";
import { getSignalCommitmentContract, SIGNAL_COMMITMENT_ABI, ADDRESSES } from "./contracts";

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
