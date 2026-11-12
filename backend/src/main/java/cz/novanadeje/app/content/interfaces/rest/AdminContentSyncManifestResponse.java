package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunkEntry;

import java.util.List;
import java.util.UUID;

record AdminContentSyncManifestResponse(UUID subject, boolean administrator, List<SyncChunkEntry> chunks) {

    static AdminContentSyncManifestResponse of(UUID subject, boolean administrator, List<SyncChunk> chunks) {
        return new AdminContentSyncManifestResponse(subject, administrator, chunks.stream().map(SyncChunkEntry::of).toList());
    }
}
