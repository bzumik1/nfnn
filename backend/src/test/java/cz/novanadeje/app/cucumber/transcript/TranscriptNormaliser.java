package cz.novanadeje.app.cucumber.transcript;

import tools.jackson.databind.JsonNode;

import java.util.Map;

public final class TranscriptNormaliser {

    public TranscriptNormaliser(Map<String, String> knownValues) {
    }

    public String text(String raw) {
        return raw;
    }

    public String path(String uri) {
        return uri;
    }

    public JsonNode json(JsonNode raw) {
        return raw;
    }

    public static String template(String uri) {
        return uri;
    }
}
