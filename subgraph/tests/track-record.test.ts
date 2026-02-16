import {
  test,
  describe,
  clearStore,
  assert,
  newMockEvent,
  afterEach,
} from "matchstick-as";
import { BigInt, Address, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { handleTrackRecordSubmitted } from "../src/track-record";
import { TrackRecordSubmitted } from "../generated/TrackRecord/TrackRecord";

const GENIUS_ADDR = Address.fromString(
  "0x1111111111111111111111111111111111111111"
);
const GENIUS_2_ADDR = Address.fromString(
  "0x3333333333333333333333333333333333333333"
);

function createTrackRecordSubmittedEvent(
  recordId: BigInt,
  genius: Address,
  signalCount: BigInt,
  totalGain: BigInt,
  totalLoss: BigInt,
  favCount: BigInt,
  unfavCount: BigInt,
  voidCount: BigInt,
  proofHash: Bytes
): TrackRecordSubmitted {
  let event = changetype<TrackRecordSubmitted>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "recordId",
      ethereum.Value.fromUnsignedBigInt(recordId)
    )
  );
  event.parameters.push(
    new ethereum.EventParam("genius", ethereum.Value.fromAddress(genius))
  );
  event.parameters.push(
    new ethereum.EventParam(
      "signalCount",
      ethereum.Value.fromUnsignedBigInt(signalCount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "totalGain",
      ethereum.Value.fromUnsignedBigInt(totalGain)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "totalLoss",
      ethereum.Value.fromUnsignedBigInt(totalLoss)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "favCount",
      ethereum.Value.fromUnsignedBigInt(favCount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "unfavCount",
      ethereum.Value.fromUnsignedBigInt(unfavCount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "voidCount",
      ethereum.Value.fromUnsignedBigInt(voidCount)
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "proofHash",
      ethereum.Value.fromFixedBytes(proofHash)
    )
  );
  return event;
}

describe("TrackRecord", () => {
  afterEach(() => {
    clearStore();
  });

  test("creates TrackRecordProof entity on submit", () => {
    let proofHash = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ) as Bytes;

    let event = createTrackRecordSubmittedEvent(
      BigInt.fromI32(0),
      GENIUS_ADDR,
      BigInt.fromI32(10),
      BigInt.fromI32(500000000), // 500 USDC
      BigInt.fromI32(200000000), // 200 USDC
      BigInt.fromI32(7),
      BigInt.fromI32(2),
      BigInt.fromI32(1),
      proofHash
    );

    handleTrackRecordSubmitted(event);

    assert.entityCount("TrackRecordProof", 1);
    assert.fieldEquals("TrackRecordProof", "0", "signalCount", "10");
    assert.fieldEquals("TrackRecordProof", "0", "totalGain", "500000000");
    assert.fieldEquals("TrackRecordProof", "0", "totalLoss", "200000000");
    assert.fieldEquals("TrackRecordProof", "0", "favCount", "7");
    assert.fieldEquals("TrackRecordProof", "0", "unfavCount", "2");
    assert.fieldEquals("TrackRecordProof", "0", "voidCount", "1");
  });

  test("updates Genius totalTrackRecordProofs", () => {
    let proofHash1 = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    ) as Bytes;
    let proofHash2 = Bytes.fromHexString(
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    ) as Bytes;

    let event1 = createTrackRecordSubmittedEvent(
      BigInt.fromI32(0),
      GENIUS_ADDR,
      BigInt.fromI32(5),
      BigInt.fromI32(100000000),
      BigInt.fromI32(50000000),
      BigInt.fromI32(3),
      BigInt.fromI32(1),
      BigInt.fromI32(1),
      proofHash1
    );

    let event2 = createTrackRecordSubmittedEvent(
      BigInt.fromI32(1),
      GENIUS_ADDR,
      BigInt.fromI32(10),
      BigInt.fromI32(300000000),
      BigInt.fromI32(100000000),
      BigInt.fromI32(7),
      BigInt.fromI32(2),
      BigInt.fromI32(1),
      proofHash2
    );

    handleTrackRecordSubmitted(event1);
    handleTrackRecordSubmitted(event2);

    assert.entityCount("TrackRecordProof", 2);
    assert.fieldEquals(
      "Genius",
      GENIUS_ADDR.toHexString(),
      "totalTrackRecordProofs",
      "2"
    );
  });

  test("updates ProtocolStats totalTrackRecordProofs", () => {
    let proofHash = Bytes.fromHexString(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    ) as Bytes;

    let event = createTrackRecordSubmittedEvent(
      BigInt.fromI32(0),
      GENIUS_ADDR,
      BigInt.fromI32(5),
      BigInt.fromI32(100000000),
      BigInt.fromI32(50000000),
      BigInt.fromI32(3),
      BigInt.fromI32(1),
      BigInt.fromI32(1),
      proofHash
    );

    handleTrackRecordSubmitted(event);

    assert.fieldEquals("ProtocolStats", "1", "totalTrackRecordProofs", "1");
  });

  test("creates separate records for different geniuses", () => {
    let proofHash1 = Bytes.fromHexString(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    ) as Bytes;
    let proofHash2 = Bytes.fromHexString(
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    ) as Bytes;

    let event1 = createTrackRecordSubmittedEvent(
      BigInt.fromI32(0),
      GENIUS_ADDR,
      BigInt.fromI32(5),
      BigInt.fromI32(100000000),
      BigInt.fromI32(50000000),
      BigInt.fromI32(3),
      BigInt.fromI32(1),
      BigInt.fromI32(1),
      proofHash1
    );

    let event2 = createTrackRecordSubmittedEvent(
      BigInt.fromI32(1),
      GENIUS_2_ADDR,
      BigInt.fromI32(10),
      BigInt.fromI32(500000000),
      BigInt.fromI32(200000000),
      BigInt.fromI32(7),
      BigInt.fromI32(2),
      BigInt.fromI32(1),
      proofHash2
    );

    handleTrackRecordSubmitted(event1);
    handleTrackRecordSubmitted(event2);

    assert.entityCount("TrackRecordProof", 2);
    assert.fieldEquals(
      "Genius",
      GENIUS_ADDR.toHexString(),
      "totalTrackRecordProofs",
      "1"
    );
    assert.fieldEquals(
      "Genius",
      GENIUS_2_ADDR.toHexString(),
      "totalTrackRecordProofs",
      "1"
    );
    assert.fieldEquals("ProtocolStats", "1", "totalTrackRecordProofs", "2");
  });

  test("stores proofHash correctly", () => {
    let proofHash = Bytes.fromHexString(
      "0xdeadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678"
    ) as Bytes;

    let event = createTrackRecordSubmittedEvent(
      BigInt.fromI32(0),
      GENIUS_ADDR,
      BigInt.fromI32(20),
      BigInt.fromI32(1000000000),
      BigInt.fromI32(300000000),
      BigInt.fromI32(15),
      BigInt.fromI32(3),
      BigInt.fromI32(2),
      proofHash
    );

    handleTrackRecordSubmitted(event);

    assert.fieldEquals(
      "TrackRecordProof",
      "0",
      "proofHash",
      "0xdeadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678"
    );
  });
});
