package cz.novanadeje.app.cucumber;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

final class BundleTexts {

    private static final List<String> BUNDLES = List.of("i18n/messages.properties", "i18n/messages_cs.properties", "i18n/messages_en.properties");
    private static final List<String> VALIDATOR_BUNDLES = Stream.of("", "_cs", "_de", "_sk")
            .map(suffix -> "org/hibernate/validator/ValidationMessages" + suffix + ".properties").toList();
    private static final Set<String> SERVER_VALUES = Set.of("type", "instance", "status", "challenge", "challengeExpiresAt");
    private static final Set<String> ERROR_NAMES = Set.of("field", "code");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{[^}]*}|\\{[^}]*}");
    private static final Set<String> TEXTS = texts(BUNDLES);
    private static final List<Pattern> VALIDATOR_MESSAGES = templates(VALIDATOR_BUNDLES);
    private static final Set<String> REASON_PHRASES = reasonPhrases();
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private BundleTexts() {
    }

    static void requireBundleTexts(String exchange, HttpHeaders headers, byte[] body) {
        MediaType type = headers.getContentType();
        if (type == null || !MediaType.APPLICATION_PROBLEM_JSON.isCompatibleWith(type) || body.length == 0) {
            return;
        }
        JsonNode problem = JSON.readTree(body);
        for (Map.Entry<String, JsonNode> property : problem.properties()) {
            String name = property.getKey();
            JsonNode value = property.getValue();
            if (SERVER_VALUES.contains(name)) {
                continue;
            }
            switch (name) {
                case "title" -> requireText(exchange, name, value, true);
                case "errors" -> requireFieldErrors(exchange, value);
                default -> requireTexts(exchange, name, value);
            }
        }
    }

    private static void requireFieldErrors(String exchange, JsonNode errors) {
        for (int index = 0; index < errors.size(); index++) {
            for (Map.Entry<String, JsonNode> property : errors.get(index).properties()) {
                String where = "errors[" + index + "]." + property.getKey();
                if (ERROR_NAMES.contains(property.getKey())) {
                    continue;
                }
                if ("message".equals(property.getKey())) {
                    requireFieldMessage(exchange, where, property.getValue());
                } else {
                    requireTexts(exchange, where, property.getValue());
                }
            }
        }
    }

    private static void requireFieldMessage(String exchange, String where, JsonNode value) {
        String text = value.asString();
        if (!TEXTS.contains(text) && VALIDATOR_MESSAGES.stream().noneMatch(message -> message.matcher(text).matches())) {
            throw refusal(exchange, where, "no text of the message bundles or of the validator", text);
        }
    }

    private static void requireTexts(String exchange, String where, JsonNode value) {
        if (value.isString()) {
            requireText(exchange, where, value, false);
        } else if (value.isContainer()) {
            for (Map.Entry<String, JsonNode> property : value.properties()) {
                requireTexts(exchange, where + "." + property.getKey(), property.getValue());
            }
            for (int index = 0; value.isArray() && index < value.size(); index++) {
                requireTexts(exchange, where + "[" + index + "]", value.get(index));
            }
        }
    }

    private static void requireText(String exchange, String where, JsonNode value, boolean reasonPhraseAllowed) {
        if (value == null || value.isNull()) {
            return;
        }
        String text = value.asString();
        if (!TEXTS.contains(text) && !(reasonPhraseAllowed && REASON_PHRASES.contains(text))) {
            throw refusal(exchange, where, "no text of the message bundles", text);
        }
    }

    private static AssertionError refusal(String exchange, String where, String what, String text) {
        return new AssertionError("The problem answer to " + exchange + " carries a " + where + " that is " + what + " (security.md, Output): " + text);
    }

    private static Set<String> texts(List<String> bundles) {
        Set<String> texts = new HashSet<>();
        values(bundles).flatMap(text -> Stream.of(text, text.replace("''", "'"))).forEach(texts::add);
        return Set.copyOf(texts);
    }

    private static List<Pattern> templates(List<String> bundles) {
        List<Pattern> templates = new ArrayList<>();
        values(bundles).forEach(template -> templates.add(template(template)));
        return List.copyOf(templates);
    }

    private static Pattern template(String template) {
        StringBuilder pattern = new StringBuilder();
        Matcher placeholder = PLACEHOLDER.matcher(template);
        int literalStart = 0;
        while (placeholder.find()) {
            pattern.append(Pattern.quote(template.substring(literalStart, placeholder.start()))).append(".*?");
            literalStart = placeholder.end();
        }
        return Pattern.compile(pattern.append(Pattern.quote(template.substring(literalStart))).toString(), Pattern.DOTALL);
    }

    private static Stream<String> values(List<String> bundles) {
        List<String> values = new ArrayList<>();
        for (String bundle : bundles) {
            try (InputStream stream = BundleTexts.class.getClassLoader().getResourceAsStream(bundle)) {
                if (stream == null) {
                    throw new IllegalStateException("The message bundle " + bundle + " is missing");
                }
                Properties properties = new Properties();
                properties.load(new InputStreamReader(stream, StandardCharsets.UTF_8));
                properties.values().stream().map(String::valueOf).forEach(values::add);
            } catch (IOException unreadable) {
                throw new UncheckedIOException(unreadable);
            }
        }
        return values.stream();
    }

    private static Set<String> reasonPhrases() {
        Set<String> phrases = new HashSet<>();
        for (HttpStatus status : HttpStatus.values()) {
            phrases.add(status.getReasonPhrase());
        }
        return Set.copyOf(phrases);
    }
}
