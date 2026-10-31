package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.support.CanonicalJson;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class ApiTranscripts {

    public static final String SOURCE = "v2-baseline";
    private static final String MAIL_SETTINGS = "MAIL_";
    private static final String APPLICATION_PROPERTIES = "APP_";
    private static final String SPRING_PROPERTIES = "SPRING_";
    private static final String SPRING_APPLICATION_JSON = "SPRING_APPLICATION_JSON";
    private static final Pattern SECRET_NAME = Pattern.compile("[A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|KEY)[A-Z0-9_]*");
    private static final Set<String> SERVER_SECRETS = Set.of("JWT_SECRET", "SETTINGS_KEY", "BACKUP_KEY", "DB_PASSWORD", "RECEIPT_SIGNING_KEY");
    private static final Set<String> SECRET_VARIABLES = Stream.concat(SERVER_SECRETS.stream(), Setting.secrets().stream().map(Setting::name))
            .collect(Collectors.toUnmodifiableSet());
    private static final String TABLE_ROW = "|";
    public static final Instant RECORDING_CLOCK = Instant.parse("2026-11-04T09:00:00Z");
    private static final String MODE = "api.transcripts";
    private static final String DIRECTORY = "api.transcripts.dir";
    private static final String RECORD = "record";
    private static final String CLASSPATH = "classpath";
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
        Path target = directory().resolve(feature + ".json");
        try {
            Files.createDirectories(target.getParent());
            Files.writeString(target, CanonicalJson.write(file), StandardCharsets.UTF_8);
        } catch (IOException unwritable) {
            throw new UncheckedIOException(unwritable);
        }
    }

    static synchronized void startRun() {
        FEATURES.clear();
        SCENARIO_ORDINALS.clear();
    }

    static Path directory() {
        return Path.of(System.getProperty(DIRECTORY, "build/api-transcripts"));
    }

    static String scenarioKey(String featureText, String name, int line) {
        List<String> lines = featureText.lines().toList();
        if (line < 1 || line > lines.size() || !lines.get(line - 1).strip().startsWith(TABLE_ROW)) {
            return name;
        }
        String row = lines.get(line - 1).strip();
        List<String> cells = Arrays.stream(row.substring(1, row.endsWith(TABLE_ROW) ? row.length() - 1 : row.length()).split("\\|", -1))
                .map(String::strip).toList();
        return name + " [" + String.join(" | ", cells) + "]";
    }

    static void refuseRealSecrets(Map<String, String> environment) {
        List<String> secrets = environment.entrySet().stream()
                .filter(variable -> mayCarryASecret(variable.getKey()))
                .filter(variable -> variable.getValue() != null && !variable.getValue().isBlank())
                .map(Map.Entry::getKey).sorted().toList();
        if (!secrets.isEmpty()) {
            throw new IllegalStateException("Recording API transcripts refuses to run while " + secrets
                    + " are set in the environment: the transcripts are public, so unset them and record with the fictional test settings only");
        }
    }

    private static boolean mayCarryASecret(String name) {
        return name.startsWith(MAIL_SETTINGS) || name.startsWith(APPLICATION_PROPERTIES) || SECRET_VARIABLES.contains(name)
                || SPRING_APPLICATION_JSON.equals(name) || name.startsWith(SPRING_PROPERTIES) && SECRET_NAME.matcher(name).matches();
    }

    static String featureText(URI featureUri) {
        try {
            if (CLASSPATH.equals(featureUri.getScheme())) {
                try (InputStream feature = ApiTranscripts.class.getClassLoader().getResourceAsStream(featureUri.getSchemeSpecificPart())) {
                    if (feature == null) {
                        throw new IllegalStateException("The feature " + featureUri + " is not on the classpath");
                    }
                    return new String(feature.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
            return Files.readString(Path.of(featureUri), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    static String feature(String featureUri) {
        int start = featureUri.lastIndexOf(FEATURES_FOLDER);
        String path = start < 0 ? featureUri : featureUri.substring(start + FEATURES_FOLDER.length());
        return path.endsWith(FEATURE_SUFFIX) ? path.substring(0, path.length() - FEATURE_SUFFIX.length()) : path;
    }

    private static ObjectNode emptyFeature(String feature) {
        ObjectNode file = JsonNodeFactory.instance.objectNode();
        file.put("source", SOURCE);
        file.put("feature", feature);
        file.putObject("scenarios");
        return file;
    }
}
