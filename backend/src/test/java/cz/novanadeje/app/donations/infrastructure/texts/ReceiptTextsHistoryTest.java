package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

class ReceiptTextsHistoryTest {

    private static final Path HISTORY = RecordedReceiptTextSource.HISTORY;
    private static final Path CANDIDATE = Path.of("build/receipt-texts");
    private static final String SUFFIX = RecordedReceiptTextSource.SUFFIX;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    @DisplayName("Given the receipt texts of the bundle, when the history is read, then they are its newest set, recorded under their digest")
    void should_be_recorded_when_history_is_read_given_current_receipt_texts() throws IOException {
        String current = recorded(new BundleReceiptTextSource().textsFor(LocaleCode.EN));
        String digest = ContentDigest.of(current.getBytes(StandardCharsets.UTF_8)).value();
        if (Files.isRegularFile(HISTORY.resolve(digest + SUFFIX))) {
            return;
        }
        Files.createDirectories(CANDIDATE);
        Path candidate = CANDIDATE.resolve(digest + SUFFIX);
        Files.writeString(candidate, current, StandardCharsets.UTF_8);
        fail("The receipt texts changed, and every receipt issued from now on freezes them for good."
                + " Review " + candidate.toAbsolutePath() + " word for word, then copy it into backend/" + HISTORY
                + " and commit it; the frozen receipt cases keep the set they name (input.textsSha256), so none of them changes.");
    }

    @TestFactory
    @DisplayName("Given every recorded set of receipt texts, when it is read, then it is named by its digest and holds the same Czech and English keys")
    Stream<DynamicTest> should_be_named_by_digest_with_same_keys_when_read_given_every_recorded_set() throws IOException {
        List<DynamicTest> tests = new ArrayList<>();
        try (Stream<Path> files = Files.list(HISTORY)) {
            for (Path file : files.sorted().toList()) {
                String content = Files.readString(file, StandardCharsets.UTF_8);
                tests.add(DynamicTest.dynamicTest("Given the recorded receipt texts " + file.getFileName()
                        + ", when they are read, then they are named by their digest and hold the same Czech and English keys", () -> {
                    assertThat(ContentDigest.of(content.getBytes(StandardCharsets.UTF_8)).value() + SUFFIX).isEqualTo(file.getFileName().toString());
                    Map<String, Map<String, String>> texts = JSON.readValue(content, JSON.getTypeFactory().constructMapType(LinkedHashMap.class,
                            JSON.getTypeFactory().constructType(String.class), JSON.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, String.class)));
                    assertThat(texts.keySet()).containsExactly("cs", "en");
                    assertThat(recorded(ReceiptTextSet.bilingual(texts.get("cs"), texts.get("en")))).isEqualTo(content);
                    assertThat(texts.get("en").keySet()).isEqualTo(texts.get("cs").keySet());
                }));
            }
        }
        assertThat(tests).as("recorded receipt texts").isNotEmpty();
        return tests.stream();
    }

    private static String recorded(ReceiptTextSet texts) {
        Map<String, Object> both = new LinkedHashMap<>();
        both.put("cs", texts.czech());
        both.put("en", texts.english().orElseThrow());
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(both) + "\n";
    }
}
