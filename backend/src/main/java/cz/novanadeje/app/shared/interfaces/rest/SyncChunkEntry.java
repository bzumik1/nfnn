package cz.novanadeje.app.shared.interfaces.rest;

public record SyncChunkEntry(String id, String rowsSha256, int count) {

    public static SyncChunkEntry of(SyncChunk chunk) {
        return new SyncChunkEntry(chunk.id(), chunk.rowsSha256(), chunk.count());
    }
}
