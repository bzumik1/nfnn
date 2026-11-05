package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.DonorSyncSnapshot;

import java.util.List;
import java.util.UUID;

record DonorSyncManifestResponse(UUID subject, DonorSyncSummaryResponse summary, List<ChunkEntryResponse> chunks) {

    static DonorSyncManifestResponse from(DonorSyncSnapshot snapshot, List<SyncChunk> chunks) {
        return new DonorSyncManifestResponse(snapshot.donor().value(), DonorSyncSummaryResponse.from(snapshot),
                chunks.stream().map(chunk -> new ChunkEntryResponse(chunk.id(), chunk.rowsSha256(), chunk.count())).toList());
    }

    record ChunkEntryResponse(String id, String rowsSha256, int count) {
    }
}
