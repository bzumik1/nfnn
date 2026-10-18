package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.SortedMap;
import java.util.TreeMap;

public record ReceiptTemplate(String html, SortedMap<String, String> czech, SortedMap<String, String> english) {

    static final String HTML_PATH = "templates/pdf/donation-receipt.html";
    private static final String BUNDLE = "i18n/messages";
    private static final String TEXT_PREFIX = "receipt.";
    private static final String FILE_NAME_PREFIX = "receipt.fileName.";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<Map<String, Object>> STORED = new TypeReference<>() {
    };

    public ReceiptTemplate {
        if (html == null || html.isBlank()) {
            throw new IllegalArgumentException("A receipt template has its markup");
        }
        if (czech == null || czech.isEmpty() || english == null || english.isEmpty()) {
            throw new IllegalArgumentException("A receipt template has its Czech and English texts");
        }
        czech = new TreeMap<>(czech);
        english = new TreeMap<>(english);
    }

    public static ReceiptTemplate fromClasspath() {
        Properties base = properties(BUNDLE + ".properties");
        return new ReceiptTemplate(classpathText(HTML_PATH),
                receiptTexts(base, properties(BUNDLE + "_cs.properties")),
                receiptTexts(base, properties(BUNDLE + "_en.properties")));
    }

    @SuppressWarnings("unchecked")
    public static ReceiptTemplate fromContent(String content) {
        Map<String, Object> stored = JSON.readValue(content, STORED);
        Map<String, Object> texts = (Map<String, Object>) stored.get("texts");
        return new ReceiptTemplate((String) stored.get("html"), new TreeMap<>((Map<String, String>) texts.get("cs")),
                new TreeMap<>((Map<String, String>) texts.get("en")));
    }

    public String content() {
        Map<String, Object> texts = new LinkedHashMap<>();
        texts.put("cs", czech);
        texts.put("en", english);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("html", html);
        content.put("texts", texts);
        return JSON.writeValueAsString(content);
    }

    public ContentDigest digest() {
        return ContentDigest.of(content().getBytes(StandardCharsets.UTF_8));
    }

    ReceiptTexts texts(LocaleCode locale) {
        return switch (locale) {
            case CS -> new ReceiptTexts(czech, LocaleCode.CS.toLocale());
            case EN -> new ReceiptTexts(english, LocaleCode.EN.toLocale());
        };
    }

    private static SortedMap<String, String> receiptTexts(Properties base, Properties language) {
        SortedMap<String, String> texts = new TreeMap<>();
        for (Properties source : new Properties[]{base, language}) {
            source.stringPropertyNames().stream()
                    .filter(key -> key.startsWith(TEXT_PREFIX) && !key.startsWith(FILE_NAME_PREFIX))
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

    private static String classpathText(String path) {
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException missing) {
            throw new IllegalStateException("The receipt template " + path + " is missing from the classpath", missing);
        }
    }
}
