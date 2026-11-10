export interface StreamCheckpoint {
  readonly streamId: string;
  readonly deliveredSeq: number;
  readonly durableMessageIds: readonly string[];
  readonly resumableTransferIds: readonly string[];
}

export interface StateSyncPlan {
  readonly streamId: string;
  readonly requestFromSeq: number;
  readonly replayDurableMessageIds: readonly string[];
  readonly resumeTransferIds: readonly string[];
}

export function createStateSyncPlan(
  local: StreamCheckpoint,
  remote: StreamCheckpoint
): StateSyncPlan {
  if (local.streamId !== remote.streamId) {
    throw new Error("Cannot sync different streams");
  }

  const localDurable = new Set(local.durableMessageIds);
  const localTransfers = new Set(local.resumableTransferIds);

  return {
    streamId: local.streamId,
    requestFromSeq: Math.min(local.deliveredSeq, remote.deliveredSeq) + 1,
    replayDurableMessageIds: remote.durableMessageIds.filter((id) => !localDurable.has(id)),
    resumeTransferIds: remote.resumableTransferIds.filter((id) => !localTransfers.has(id))
  };
}
