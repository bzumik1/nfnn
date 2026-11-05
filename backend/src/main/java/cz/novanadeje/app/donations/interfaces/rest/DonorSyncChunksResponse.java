package cz.novanadeje.app.donations.interfaces.rest;

import java.util.List;
import java.util.UUID;

record DonorSyncChunksResponse(UUID subject, DonorSyncSummaryResponse summary, List<SyncChunk> chunks, List<String> missing) {
}
