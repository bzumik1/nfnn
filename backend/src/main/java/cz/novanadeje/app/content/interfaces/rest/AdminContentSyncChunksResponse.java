package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;

import java.util.List;
import java.util.UUID;

record AdminContentSyncChunksResponse(UUID subject, boolean administrator, List<SyncChunk> chunks, List<String> missing) {
}
