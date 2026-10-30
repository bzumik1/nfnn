package cz.novanadeje.app.cucumber.transcript;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class TranscriptNormaliser {

    public static final String SECRET = "<secret>";
    private static final String JWT = "<jwt>";
    private static final String TOKEN = "<token>";
    private static final String NUMBER = "#";
    private static final Pattern UUID_SHAPE = Pattern.compile("(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b");
    private static final Pattern RECEIPT_SIGNING_KEY_IN_PATH = Pattern.compile("(?<=/receipt-signing-keys/)[0-9a-f]{8}(?=/|$)");
    private static final Pattern JWT_SHAPE = Pattern.compile("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*");
    private static final Pattern BACKUP_KEY_SHAPE = Pattern.compile("(?i)(?<![A-Za-z0-9])age-secret-key-1[0-9a-z]{58}(?![A-Za-z0-9])");
    private static final Pattern TOKEN_CANDIDATE = Pattern.compile("(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])");
    private static final Pattern UPPERCASE = Pattern.compile("[A-Z]");
    private static final Pattern LOWERCASE = Pattern.compile("[a-z]");
    private static final Pattern CAMEL_CASE_NAME = Pattern.compile("[a-z]*(?:[A-Z][a-z]+)+");
    private static final Pattern CODE_SHAPE = Pattern.compile("^[0-9A-Z-]{4,}$");
    private static final Pattern DIGIT_CODE = Pattern.compile("^[0-9]{6,8}$");
    private static final Pattern RECOVERY_CODE = Pattern.compile("(?<![A-Z0-9])(OBNOVA[\\s:-]*)([A-HJ-NP-Z2-9]{4}[\\s-]?[A-HJ-NP-Z2-9]{4})(?![A-Z0-9])");
    private static final String RECOVERY = "<recovery-code>";
    private static final Pattern DATA_URI = Pattern.compile("data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)");
    private static final Pattern SECRET_SETTING = Pattern.compile("[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|KEY)");
    private static final String SETTING_NAME_FIELD = "name";
    private static final String SETTING_VALUE_FIELD = "value";
    private static final int LEAK_CHECK_MINIMUM_LENGTH = 8;
    private static final int UUID_BYTES = 16;
    private static final String USER_HANDLE_FIELD = "userHandle";
    private static final String USER_FIELD = "user";
    private static final String ID_FIELD = "id";
    private static final Set<String> SECRET_FIELDS = Set.of("password", "currentpassword", "newpassword", "secret", "otpauthuri",
            "accesstoken", "access_token", "refreshtoken", "refresh_token", "id_token", "token", "recoverycodes", "recoverycode",
            "setupcode", "client_secret", "clientsecret", "code_verifier", "codeverifier", "word");
    private static final Pattern SIGNING_SEED_FIELD = Pattern.compile("[a-z]*(?:seed|signingkey|privatekey)(?:hex|base64|base64url)?");
    private static final String WORDS_FIELD = "words";
    private static final String CODE_FIELD = "code";
    private static final String CODE_SUFFIX = "code";
    private static final String TOTP_URI_FIELD = "otpauthUri";
    private static final String TOTP_QR_FIELD = "qrCode";
    private static final String SPAYD_FIELD = "spayd";
    private static final String QR_MODULES_FIELD = "modules";
    private static final String QR_OF_MASKED_TEXT = "<qr-of-masked-text>";

    private final Map<String, String> knownValues;
    private final Pattern knownValuePattern;
    private final Pattern knownSecretPattern;
    private final Map<String, String> ids = new HashMap<>();
    private final Map<String, String> numberedLabels = new HashMap<>();
    private final Map<String, Integer> labelCounters = new HashMap<>();
    private final Set<String> maskedValues = new TreeSet<>();

    public TranscriptNormaliser(Map<String, String> knownValues) {
        Map<String, String> caseInsensitive = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        caseInsensitive.putAll(knownValues);
        this.knownValues = caseInsensitive;
        this.maskedValues.addAll(knownValues.keySet());
        this.knownValuePattern = alternativesOf(knownValues.keySet());
        this.knownSecretPattern = alternativesOf(knownValues.entrySet().stream().filter(known -> SECRET.equals(known.getValue())).map(Map.Entry::getKey)
                .collect(Collectors.toSet()));
    }

    private static Pattern alternativesOf(Set<String> values) {
        return values.isEmpty() ? null : Pattern.compile(values.stream()
                .sorted((first, second) -> second.length() - first.length())
                .map(Pattern::quote)
                .collect(Collectors.joining("|", "(?i)(?<![A-Za-z0-9])(?:", ")(?![A-Za-z0-9])")));
    }

    public String text(String raw) {
        if (raw == null) {
            return null;
        }
        String normalised = replace(DATA_URI, raw, TranscriptNormaliser::dataUri);
        normalised = replace(UUID_SHAPE, normalised, this::id);
        normalised = replace(JWT_SHAPE, normalised, jwt -> masking(jwt, JWT));
        normalised = replace(BACKUP_KEY_SHAPE, normalised, key -> masking(key, SECRET));
        normalised = recoveryCodesMasked(normalised);
        if (knownSecretPattern != null) {
            normalised = replace(knownSecretPattern, normalised, this::label);
        }
        normalised = replace(TOKEN_CANDIDATE, normalised, candidate -> isRandom(candidate) ? masking(candidate, TOKEN) : candidate);
        if (knownValuePattern != null) {
            normalised = replace(knownValuePattern, normalised, this::label);
        }
        return normalised;
    }

    public Set<String> maskedValues() {
        return maskedValues.stream().filter(value -> value.length() >= LEAK_CHECK_MINIMUM_LENGTH).collect(Collectors.toUnmodifiableSet());
    }

    private String masking(String raw, String placeholder) {
        maskedValues.add(raw);
        return placeholder;
    }

    private String recoveryCodesMasked(String text) {
        Matcher matcher = RECOVERY_CODE.matcher(text);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            maskedValues.add(matcher.group(2));
            matcher.appendReplacement(result, Matcher.quoteReplacement(matcher.group(1) + RECOVERY));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private static String dataUri(String uri) {
        Matcher parts = DATA_URI.matcher(uri);
        if (!parts.matches()) {
            return uri;
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(parts.group(2));
        } catch (IllegalArgumentException notBase64) {
            return uri;
        }
        return "<data:" + parts.group(1) + " size=" + bytes.length + " sha256=" + ScenarioTranscript.sha256(bytes) + ">";
    }

    public String path(String uri) {
        return text(uri);
    }

    public JsonNode json(JsonNode raw) {
        return json(raw, "");
    }

    private JsonNode json(JsonNode raw, String parentField) {
        if (raw == null) {
            return null;
        }
        if (raw.isObject()) {
            ObjectNode normalised = JsonNodeFactory.instance.objectNode();
            boolean totpEnrolment = raw.has(TOTP_URI_FIELD);
            boolean qrOfRecoveryCode = raw.path(SPAYD_FIELD).isString() && RECOVERY_CODE.matcher(raw.path(SPAYD_FIELD).asString()).find();
            boolean secretSetting = raw.path(SETTING_NAME_FIELD).isString() && SECRET_SETTING.matcher(raw.path(SETTING_NAME_FIELD).asString()).matches();
            for (Map.Entry<String, JsonNode> field : raw.properties()) {
                boolean secret = isSecretField(field.getKey(), field.getValue(), totpEnrolment)
                        || secretSetting && SETTING_VALUE_FIELD.equals(field.getKey()) && !field.getValue().isNull();
                if (qrOfRecoveryCode && TOTP_QR_FIELD.equals(field.getKey()) && field.getValue().isObject()) {
                    ObjectNode qr = (ObjectNode) json(field.getValue(), field.getKey());
                    qr.put(QR_MODULES_FIELD, QR_OF_MASKED_TEXT);
                    normalised.set(field.getKey(), qr);
                    continue;
                }
                normalised.set(field.getKey(), secret ? masked(field.getValue())
                        : passkeyUserHandle(parentField, field.getKey(), field.getValue()).map(id -> (JsonNode) JsonNodeFactory.instance.stringNode(id(id)))
                        .orElseGet(() -> json(field.getValue(), field.getKey())));
            }
            return normalised;
        }
        if (raw.isArray()) {
            ArrayNode normalised = JsonNodeFactory.instance.arrayNode();
            raw.values().forEach(element -> normalised.add(json(element, parentField)));
            return normalised;
        }
        if (raw.isString()) {
            return JsonNodeFactory.instance.stringNode(text(raw.asString()));
        }
        return raw;
    }

    public static String template(String uri) {
        int query = uri.indexOf('?');
        String path = query < 0 ? uri : uri.substring(0, query);
        return RECEIPT_SIGNING_KEY_IN_PATH.matcher(UUID_SHAPE.matcher(path).replaceAll("{id}")).replaceAll("{keyId}");
    }

    private static boolean isSecretField(String name, JsonNode value, boolean totpEnrolment) {
        if (value.isNull() || value.isBoolean() || value.isNumber()) {
            return false;
        }
        String key = name.toLowerCase(Locale.ROOT);
        if (SECRET_FIELDS.contains(key) || SIGNING_SEED_FIELD.matcher(key).matches()) {
            return true;
        }
        if (totpEnrolment && TOTP_QR_FIELD.equals(name)) {
            return true;
        }
        if (WORDS_FIELD.equals(key) && value.isArray()) {
            return value.valueStream().allMatch(JsonNode::isString);
        }
        if (!value.isString()) {
            return false;
        }
        return CODE_FIELD.equals(key) && CODE_SHAPE.matcher(value.asString()).matches()
                || key.endsWith(CODE_SUFFIX) && DIGIT_CODE.matcher(value.asString()).matches();
    }

    private static Optional<String> passkeyUserHandle(String parentField, String field, JsonNode value) {
        boolean userHandle = USER_HANDLE_FIELD.equals(field) || USER_FIELD.equals(parentField) && ID_FIELD.equals(field);
        return userHandle && value.isString() ? base64UrlId(value.asString()) : Optional.empty();
    }

    private static Optional<String> base64UrlId(String candidate) {
        byte[] bytes;
        try {
            bytes = Base64.getUrlDecoder().decode(candidate);
        } catch (IllegalArgumentException notBase64) {
            return Optional.empty();
        }
        if (bytes.length != UUID_BYTES) {
            return Optional.empty();
        }
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return Optional.of(new UUID(buffer.getLong(), buffer.getLong()).toString());
    }

    private JsonNode masked(JsonNode value) {
        if (value.isNull()) {
            return value;
        }
        if (value.isObject()) {
            ObjectNode masked = JsonNodeFactory.instance.objectNode();
            value.properties().forEach(field -> masked.set(field.getKey(), masked(field.getValue())));
            return masked;
        }
        if (value.isArray()) {
            ArrayNode masked = JsonNodeFactory.instance.arrayNode();
            value.values().forEach(element -> masked.add(masked(element)));
            return masked;
        }
        if (value.isString()) {
            maskedValues.add(value.asString());
        }
        return JsonNodeFactory.instance.stringNode(SECRET);
    }

    private static boolean isRandom(String candidate) {
        return UPPERCASE.matcher(candidate).find() && LOWERCASE.matcher(candidate).find() && !CAMEL_CASE_NAME.matcher(candidate).matches();
    }

    private String label(String value) {
        String label = knownValues.get(value);
        if (!label.contains(NUMBER)) {
            return label;
        }
        return numberedLabels.computeIfAbsent(value, ignored -> label.replace(NUMBER, String.valueOf(labelCounters.merge(label, 1, Integer::sum))));
    }

    private String id(String raw) {
        return ids.computeIfAbsent(raw.toLowerCase(Locale.ROOT), ignored -> "<id:" + (ids.size() + 1) + ">");
    }

    private static String replace(Pattern pattern, String text, Function<String, String> replacement) {
        Matcher matcher = pattern.matcher(text);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement.apply(matcher.group())));
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
