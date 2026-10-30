package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.application.receipt.ReceiptTextSource;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.shared.domain.LocaleCode;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;

public final class RecordedReceiptTextSource implements ReceiptTextSource {

    public static final Path HISTORY = Path.of("src/test/resources/receipts/texts");
    public static final String SUFFIX = ".json";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Map<String, String> czech;
    private final Map<String, String> english;

    private RecordedReceiptTextSource(Map<String, String> czech, Map<String, String> english) {
        this.czech = czech;
        this.english = english;
    }

    public static RecordedReceiptTextSource of(String digest) {
        Path file = HISTORY.resolve(digest + SUFFIX);
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("No recorded set of receipt texts is named " + digest);
        }
        try {
            JsonNode set = JSON.readTree(Files.readString(file, StandardCharsets.UTF_8));
            return new RecordedReceiptTextSource(texts(set.get("cs")), texts(set.get("en")));
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    @Override
    public ReceiptTextSet textsFor(LocaleCode locale) {
        return switch (locale) {
            case CS -> ReceiptTextSet.czechOnly(czech);
            case EN -> ReceiptTextSet.bilingual(czech, english);
        };
    }

    private static Map<String, String> texts(JsonNode language) {
        Map<String, String> texts = new TreeMap<>();
        language.properties().forEach(text -> texts.put(text.getKey(), text.getValue().asString()));
        return texts;
    }
}
