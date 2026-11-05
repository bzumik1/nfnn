package cz.novanadeje.app.donations.interfaces.rest;

import tools.jackson.databind.JsonNode;

final class CanonicalRows {

    private CanonicalRows() {
    }

    static String canonical(JsonNode rows) {
        throw new UnsupportedOperationException("2.12 writes the canonical rows");
    }

    static String sha256(JsonNode rows) {
        throw new UnsupportedOperationException("2.12 takes the digest of the canonical rows");
    }
}
