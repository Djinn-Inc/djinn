import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Deposited,
  Withdrawn,
  SignalPurchased,
  Refunded,
  OutcomeUpdated,
} from "../generated/Escrow/Escrow";
import {
  Purchase,
  Signal,
  Genius,
  Idiot,
  ProtocolStats,
} from "../generated/schema";

function outcomeToString(outcome: i32): string {
  if (outcome == 0) return "Pending";
  if (outcome == 1) return "Favorable";
  if (outcome == 2) return "Unfavorable";
  if (outcome == 3) return "Void";
  return "Pending";
}

function getOrCreateIdiot(address: Bytes, timestamp: BigInt): Idiot {
  let id = address.toHexString();
  let idiot = Idiot.load(id);
  if (idiot == null) {
    idiot = new Idiot(id);
    idiot.totalPurchases = BigInt.zero();
    idiot.totalDeposited = BigInt.zero();
    idiot.totalWithdrawn = BigInt.zero();
    idiot.escrowBalance = BigInt.zero();
    idiot.totalFeesPaid = BigInt.zero();
    idiot.totalCreditsUsed = BigInt.zero();
    idiot.creditBalance = BigInt.zero();
    idiot.createdAt = timestamp;

    let stats = getOrCreateProtocolStats();
    stats.uniqueIdiots = stats.uniqueIdiots.plus(BigInt.fromI32(1));
    stats.save();
  }
  return idiot;
}

function getOrCreateGenius(address: string, timestamp: BigInt): Genius {
  let genius = Genius.load(address);
  if (genius == null) {
    genius = new Genius(address);
    genius.totalSignals = BigInt.zero();
    genius.activeSignals = BigInt.zero();
    genius.totalPurchases = BigInt.zero();
    genius.totalVolume = BigInt.zero();
    genius.totalFeesEarned = BigInt.zero();
    genius.aggregateQualityScore = BigInt.zero();
    genius.totalAudits = BigInt.zero();
    genius.collateralDeposited = BigInt.zero();
    genius.collateralLocked = BigInt.zero();
    genius.totalSlashed = BigInt.zero();
    genius.createdAt = timestamp;
  }
  return genius;
}

function getOrCreateProtocolStats(): ProtocolStats {
  let stats = ProtocolStats.load("1");
  if (stats == null) {
    stats = new ProtocolStats("1");
    stats.totalSignals = BigInt.zero();
    stats.totalPurchases = BigInt.zero();
    stats.totalVolume = BigInt.zero();
    stats.totalFees = BigInt.zero();
    stats.totalCreditsMinted = BigInt.zero();
    stats.totalCreditsBurned = BigInt.zero();
    stats.totalAudits = BigInt.zero();
    stats.totalEarlyExits = BigInt.zero();
    stats.totalProtocolFees = BigInt.zero();
    stats.totalCollateralDeposited = BigInt.zero();
    stats.totalCollateralSlashed = BigInt.zero();
    stats.uniqueGeniuses = BigInt.zero();
    stats.uniqueIdiots = BigInt.zero();
  }
  return stats;
}

export function handleDeposited(event: Deposited): void {
  let idiot = getOrCreateIdiot(event.params.user, event.block.timestamp);
  idiot.totalDeposited = idiot.totalDeposited.plus(event.params.amount);
  idiot.escrowBalance = idiot.escrowBalance.plus(event.params.amount);
  idiot.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  let idiot = getOrCreateIdiot(event.params.user, event.block.timestamp);
  idiot.totalWithdrawn = idiot.totalWithdrawn.plus(event.params.amount);
  idiot.escrowBalance = idiot.escrowBalance.minus(event.params.amount);
  idiot.save();
}

export function handleSignalPurchased(event: SignalPurchased): void {
  let signalId = event.params.signalId.toString();
  let signal = Signal.load(signalId);
  if (signal == null) return;

  // Use the on-chain purchaseId for deterministic entity linking
  let purchaseId = event.params.purchaseId.toString();

  let idiot = getOrCreateIdiot(event.params.buyer, event.block.timestamp);
  idiot.totalPurchases = idiot.totalPurchases.plus(BigInt.fromI32(1));
  idiot.totalFeesPaid = idiot.totalFeesPaid.plus(event.params.feePaid);
  idiot.totalCreditsUsed = idiot.totalCreditsUsed.plus(event.params.creditUsed);
  idiot.escrowBalance = idiot.escrowBalance.minus(event.params.usdcPaid);
  idiot.save();

  let genius = getOrCreateGenius(signal.genius, event.block.timestamp);
  genius.totalPurchases = genius.totalPurchases.plus(BigInt.fromI32(1));
  genius.totalVolume = genius.totalVolume.plus(event.params.notional);
  genius.totalFeesEarned = genius.totalFeesEarned.plus(event.params.feePaid);
  genius.save();

  let purchase = new Purchase(purchaseId);
  purchase.signal = signalId;
  purchase.idiot = idiot.id;
  purchase.genius = genius.id;
  purchase.onChainPurchaseId = event.params.purchaseId;
  purchase.notional = event.params.notional;
  purchase.feePaid = event.params.feePaid;
  purchase.creditUsed = event.params.creditUsed;
  purchase.usdcPaid = event.params.usdcPaid;
  purchase.outcome = "Pending";
  purchase.purchasedAt = event.block.timestamp;
  purchase.purchasedAtBlock = event.block.number;
  purchase.purchasedAtTx = event.transaction.hash;
  purchase.save();

  let stats = getOrCreateProtocolStats();
  stats.totalPurchases = stats.totalPurchases.plus(BigInt.fromI32(1));
  stats.totalVolume = stats.totalVolume.plus(event.params.notional);
  stats.totalFees = stats.totalFees.plus(event.params.feePaid);
  stats.save();
}

export function handleRefunded(event: Refunded): void {
  let idiotId = event.params.idiot.toHexString();
  let idiot = Idiot.load(idiotId);
  if (idiot != null) {
    idiot.escrowBalance = idiot.escrowBalance.plus(event.params.amount);
    idiot.save();
  }
}

export function handleOutcomeUpdated(event: OutcomeUpdated): void {
  let purchaseId = event.params.purchaseId.toString();
  let purchase = Purchase.load(purchaseId);
  if (purchase == null) return;

  purchase.outcome = outcomeToString(event.params.outcome);
  purchase.save();
}
