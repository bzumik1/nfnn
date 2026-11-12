package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;

import java.util.List;
import java.util.UUID;

record AdminOperationsSyncManifestResponse(UUID subject, boolean administrator, List<SyncChunkEntry> chunks) {

    static AdminOperationsSyncManifestResponse of(UUID subject, boolean administrator, List<SyncChunk> chunks) {
        return new AdminOperationsSyncManifestResponse(subject, administrator, chunks.stream().map(SyncChunkEntry::of).toList());
    }
}
