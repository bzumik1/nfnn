package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;

import java.util.List;
import java.util.UUID;

record AdminDonorsSyncChunksResponse(UUID subject, boolean administrator, List<SyncChunk> chunks, List<String> missing) {
}
