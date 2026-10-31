package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.LocaleCode;

import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.SortedMap;
import java.util.TreeMap;

public record ReceiptTextSet(SortedMap<String, String> czech, Optional<SortedMap<String, String>> english) {

    private static final String PREFIX = "receipt.";

    public ReceiptTextSet {
        if (czech == null || english == null) {
            throw new IllegalArgumentException("Receipt texts are Czech, and English or none");
        }
        czech = frozen(czech);
        english = english.map(ReceiptTextSet::frozen);
    }

    public static ReceiptTextSet czechOnly(Map<String, String> czech) {
        return new ReceiptTextSet(new TreeMap<>(czech), Optional.empty());
    }

    public static ReceiptTextSet bilingual(Map<String, String> czech, Map<String, String> english) {
        return new ReceiptTextSet(new TreeMap<>(czech), Optional.of(new TreeMap<>(english)));
    }

    public boolean covers(LocaleCode locale) {
        return locale == LocaleCode.CS ? english.isEmpty() : english.isPresent();
    }

    private static SortedMap<String, String> frozen(SortedMap<String, String> texts) {
        if (texts.isEmpty()) {
            throw new IllegalArgumentException("A receipt's texts are not empty");
        }
        texts.forEach((key, text) -> {
            if (key == null || !key.startsWith(PREFIX) || text == null || text.isBlank()) {
                throw new IllegalArgumentException("A receipt text has a receipt.* key and a text: " + key);
            }
        });
        return Collections.unmodifiableSortedMap(new TreeMap<>(texts));
    }
}
