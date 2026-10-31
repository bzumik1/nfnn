package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.application.receipt.ReceiptTextSource;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
public class BundleReceiptTextSource implements ReceiptTextSource {

    private static final String BUNDLE = "i18n/messages";
    private static final String TEXT_PREFIX = "receipt.";

    private final ReceiptTextSet czech;
    private final ReceiptTextSet bilingual;

    public BundleReceiptTextSource() {
        Properties base = properties(BUNDLE + ".properties");
        SortedMap<String, String> czechTexts = receiptTexts(base, properties(BUNDLE + "_cs.properties"));
        SortedMap<String, String> englishTexts = receiptTexts(base, properties(BUNDLE + "_en.properties"));
        this.czech = ReceiptTextSet.czechOnly(czechTexts);
        this.bilingual = ReceiptTextSet.bilingual(czechTexts, englishTexts);
    }

    @Override
    public ReceiptTextSet textsFor(LocaleCode locale) {
        return switch (locale) {
            case CS -> czech;
            case EN -> bilingual;
        };
    }

    private static SortedMap<String, String> receiptTexts(Properties base, Properties language) {
        SortedMap<String, String> texts = new TreeMap<>();
        for (Properties source : new Properties[]{base, language}) {
            source.stringPropertyNames().stream()
                    .filter(key -> key.startsWith(TEXT_PREFIX))
                    .forEach(key -> texts.put(key, source.getProperty(key)));
        }
        return texts;
    }

    private static Properties properties(String path) {
        try {
            return PropertiesLoaderUtils.loadProperties(new EncodedResource(new ClassPathResource(path), StandardCharsets.UTF_8));
        } catch (IOException missing) {
            throw new IllegalStateException("The receipt texts " + path + " are missing from the classpath", missing);
        }
    }
}
