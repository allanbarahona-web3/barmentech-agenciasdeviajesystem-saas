import {
  readAdditionalServiceParticipantContractSources,
  snapshotAdditionalServiceParticipantContractContext,
} from "./additional-service-order-participant-contract-context";

describe("Additional Service order participant Contract context", () => {
  it("snapshots every authoritative Contract source in deterministic order", () => {
    const participant = travelParticipant([
      source("contract-2", "CT-00141", "COMPANION"),
      source("contract-1", "CT-00125", "HOLDER"),
    ]);

    expect(snapshotAdditionalServiceParticipantContractContext(participant)).toEqual({
      travelPackageParticipantId: "travel-participant-1",
      contractSources: [
        source("contract-1", "CT-00125", "HOLDER"),
        source("contract-2", "CT-00141", "COMPANION"),
      ],
    });
  });

  it("persists a TravelPackage participant with no Contract sources as an empty array", () => {
    expect(
      snapshotAdditionalServiceParticipantContractContext(
        travelParticipant([]),
      ),
    ).toEqual({
      travelPackageParticipantId: "travel-participant-1",
      contractSources: [],
    });
  });

  it("keeps the snapshot independent from later mutable source values", () => {
    const participant = travelParticipant([source("contract-1", "CT-00125", "HOLDER")]);
    const snapshot = snapshotAdditionalServiceParticipantContractContext(participant)!;
    participant.contractSources[0].contractNumber = "CT-CHANGED";

    expect(snapshot.contractSources[0].contractNumber).toBe("CT-00125");
  });

  it("exposes only safe display fields and keeps historical null snapshots readable", () => {
    expect(readAdditionalServiceParticipantContractSources(null)).toBeNull();
    expect(
      readAdditionalServiceParticipantContractSources({
        travelPackageParticipantId: "travel-participant-1",
        contractSources: [source("contract-1", "CT-00125", "HOLDER")],
      }),
    ).toEqual([
      {
        contractNumber: "CT-00125",
        status: "SIGNED",
        sourceRole: "HOLDER",
      },
    ]);
  });
});

function travelParticipant(contractSources: ReturnType<typeof source>[]) {
  return {
    clientId: "client-1",
    role: "HOLDER" as const,
    travelPackageParticipantId: "travel-participant-1",
    contractSources,
  };
}

function source(
  contractId: string,
  contractNumber: string,
  sourceRole: "HOLDER" | "COMPANION",
) {
  return {
    contractId,
    contractNumber,
    status: "SIGNED",
    sourceRole,
  };
}
