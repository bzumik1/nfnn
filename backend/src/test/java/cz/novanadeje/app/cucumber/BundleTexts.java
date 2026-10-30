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
import java.util.HashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Stream;

final class BundleTexts {

    private static final List<String> BUNDLES = List.of("i18n/messages.properties", "i18n/messages_cs.properties", "i18n/messages_en.properties");
    private static final Set<String> TEXTS = bundleTexts();
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
        requireText(exchange, "title", problem.get("title"), true);
        requireText(exchange, "detail", problem.get("detail"), false);
    }

    private static void requireText(String exchange, String field, JsonNode value, boolean reasonPhraseAllowed) {
        if (value == null || value.isNull()) {
            return;
        }
        String text = value.asString();
        if (!TEXTS.contains(text) && !(reasonPhraseAllowed && REASON_PHRASES.contains(text))) {
            throw new AssertionError("The problem answer to " + exchange + " carries a " + field
                    + " that is no text of the message bundles (security.md, Output): " + text);
        }
    }

    private static Set<String> bundleTexts() {
        Set<String> texts = new HashSet<>();
        for (String bundle : BUNDLES) {
            try (InputStream stream = BundleTexts.class.getClassLoader().getResourceAsStream(bundle)) {
                if (stream == null) {
                    throw new IllegalStateException("The message bundle " + bundle + " is missing");
                }
                Properties properties = new Properties();
                properties.load(new InputStreamReader(stream, StandardCharsets.UTF_8));
                properties.values().stream().map(String::valueOf)
                        .flatMap(text -> Stream.of(text, text.replace("''", "'")))
                        .forEach(texts::add);
            } catch (IOException unreadable) {
                throw new UncheckedIOException(unreadable);
            }
        }
        return Set.copyOf(texts);
    }

    private static Set<String> reasonPhrases() {
        Set<String> phrases = new HashSet<>();
        for (HttpStatus status : HttpStatus.values()) {
            phrases.add(status.getReasonPhrase());
        }
        return Set.copyOf(phrases);
    }
}
