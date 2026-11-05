package cz.novanadeje.app.donations.interfaces.rest;

import tools.jackson.databind.JsonNode;

record SyncChunk(String id, String rowsSha256, int count, JsonNode rows) {

    static SyncChunk of(String id, JsonNode rows) {
        return new SyncChunk(id, CanonicalRows.sha256(rows), rows.size(), rows);
    }
}
