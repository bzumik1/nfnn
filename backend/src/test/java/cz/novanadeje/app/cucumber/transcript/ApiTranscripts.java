package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.support.CanonicalJson;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

public final class ApiTranscripts {

    public static final Instant RECORDING_CLOCK = Instant.parse("2026-11-04T09:00:00Z");
    private static final String MODE = "api.transcripts";
    private static final String DIRECTORY = "api.transcripts.dir";
    private static final String RECORD = "record";
    private static final String FEATURES_FOLDER = "features/";
    private static final String FEATURE_SUFFIX = ".feature";
    private static final Map<String, ObjectNode> FEATURES = new TreeMap<>();
    private static final Map<String, Integer> SCENARIO_ORDINALS = new HashMap<>();

    private ApiTranscripts() {
    }

    public static boolean recording() {
        return RECORD.equals(System.getProperty(MODE));
    }

    static synchronized void store(String featureUri, String scenarioName, JsonNode transcript) {
        String feature = feature(featureUri);
        int ordinal = SCENARIO_ORDINALS.merge(feature + "\n" + scenarioName, 1, Integer::sum);
        ObjectNode file = FEATURES.computeIfAbsent(feature, ApiTranscripts::emptyFeature);
        ((ObjectNode) file.get("scenarios")).set(scenarioName + " #" + ordinal, transcript);
        Path target = Path.of(System.getProperty(DIRECTORY, "build/api-transcripts")).resolve(feature + ".json");
        try {
            Files.createDirectories(target.getParent());
            Files.writeString(target, CanonicalJson.write(file), StandardCharsets.UTF_8);
        } catch (IOException unwritable) {
            throw new UncheckedIOException(unwritable);
        }
    }

    static String feature(String featureUri) {
        int start = featureUri.lastIndexOf(FEATURES_FOLDER);
        String path = start < 0 ? featureUri : featureUri.substring(start + FEATURES_FOLDER.length());
        return path.endsWith(FEATURE_SUFFIX) ? path.substring(0, path.length() - FEATURE_SUFFIX.length()) : path;
    }

    private static ObjectNode emptyFeature(String feature) {
        ObjectNode file = JsonNodeFactory.instance.objectNode();
        file.put("source", "v2-baseline@70e9233");
        file.put("feature", feature);
        file.putObject("scenarios");
        return file;
    }
}
