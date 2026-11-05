package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;

import java.util.List;
import java.util.UUID;

record DonorSyncChunksResponse(UUID subject, DonorSyncSummaryResponse summary, List<SyncChunk> chunks, List<String> missing) {
}
