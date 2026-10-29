package cz.novanadeje.app.regression;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

final class BaselineHygiene {

    private static final Pattern UUID_TEXT = Pattern.compile("(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b");
    private static final Pattern BASE64URL_ID_FIELD = Pattern.compile("\"(?:userHandle|id)\"\\s*:\\s*\"([A-Za-z0-9_-]{22})\"");
    private static final int UUID_BYTES = 16;
    private static final Pattern JWT = Pattern.compile("eyJ[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}\\.");
    private static final Pattern TOKEN = Pattern.compile("(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])");
    private static final Pattern UPPERCASE = Pattern.compile("[A-Z]");
    private static final Pattern LOWERCASE = Pattern.compile("[a-z]");
    private static final Pattern CAMEL_CASE_NAME = Pattern.compile("[a-z]*(?:[A-Z][a-z]+)+");
    private static final Pattern UNMASKED_COOKIE = Pattern.compile("(?i)(refresh_token[a-z_]*)=(?!<secret>)[^;\"\\s]+");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}");
    private static final Set<String> FIXTURE_DOMAINS = Set.of("example.cz", "example.com", "example.org", "example.net");
    private static final String RESERVED_EXAMPLE_TLD = ".example";
    private static final String JSON_FILE = ".json";
    private static final Set<String> TEXT_FILES = Set.of(".json", ".txt", ".md", ".java", ".feature", ".properties", ".yml", ".yaml", ".html", ".xml", ".sql", ".ts");

    static final Set<String> TEST_TOTP_SECRETS = Set.of("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U", "KRUGKIDROVUWG2ZAMJZG653OEBTG66BA", "ONSWG4TFOQQGC3TEEBZWK4TWMVZCAMZS");
    private static final Set<String> EXPLICIT_ADDRESSES = Set.of("info@nfnn.cz");
    private static final Pattern TOTP_SECRET = Pattern.compile("(?<![A-Za-z0-9])[A-Z2-7]{32}(?![A-Za-z0-9])");
    private static final Pattern SECRET_PARAMETER = Pattern.compile("(?i)secret=(?!<)");
    private static final Pattern SECRET_SETTING = Pattern.compile("[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|KEY)");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern ANY_WHITESPACE = Pattern.compile("\\s+");
    private static final List<String> REAL_SURNAME_FAMILIES = List.of("znamenac");
    private static final String MASKED = "<secret>";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private BaselineHygiene() {
    }

    static Report scan(Path root, Fixtures fixtures) throws IOException {
        if (!Files.isDirectory(root)) {
            return new Report(0, List.of());
        }
        List<String> findings = new ArrayList<>();
        int scanned = 0;
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).sorted().toList()) {
                scanned++;
                findings.addAll(findings(root.relativize(file).toString(), Files.readString(file, StandardCharsets.UTF_8), fixtures));
            }
        }
        return new Report(scanned, findings);
    }

    static List<String> findings(String file, String text, Fixtures fixtures) {
        List<String> findings = new ArrayList<>();
        UUID_TEXT.matcher(text).results().forEach(match -> findings.add(file + ": an id " + match.group()));
        BASE64URL_ID_FIELD.matcher(text).results().map(match -> match.group(1)).filter(BaselineHygiene::isBase64UrlId)
                .forEach(candidate -> findings.add(file + ": an id in base64url " + candidate.substring(0, 8)));
        JWT.matcher(text).results().forEach(match -> findings.add(file + ": a JWT starting " + match.group()));
        TOKEN.matcher(text).results().map(match -> match.group())
                .filter(candidate -> UPPERCASE.matcher(candidate).find() && LOWERCASE.matcher(candidate).find() && !CAMEL_CASE_NAME.matcher(candidate).matches())
                .filter(candidate -> !fixtures.values().contains(candidate))
                .forEach(candidate -> findings.add(file + ": a random secret starting " + candidate.substring(0, 8)));
        UNMASKED_COOKIE.matcher(text).results().forEach(match -> findings.add(file + ": an unmasked cookie " + match.group(1)));
        TOTP_SECRET.matcher(text).results().map(match -> match.group()).filter(candidate -> !TEST_TOTP_SECRETS.contains(candidate))
                .forEach(candidate -> findings.add(file + ": a TOTP secret starting " + candidate.substring(0, 8)));
        SECRET_PARAMETER.matcher(text).results()
                .filter(match -> TEST_TOTP_SECRETS.stream().noneMatch(secret -> text.startsWith(secret, match.end())))
                .forEach(match -> findings.add(file + ": an unmasked secret parameter"));
        String folded = ANY_WHITESPACE.matcher(DIACRITICS.matcher(Normalizer.normalize(text, Normalizer.Form.NFD)).replaceAll("")).replaceAll("").toLowerCase(Locale.ROOT);
        for (String family : REAL_SURNAME_FAMILIES) {
            for (int at = folded.indexOf(family); at >= 0; at = folded.indexOf(family, at + family.length())) {
                findings.add(file + ": a real surname of the family " + family + "*");
            }
        }
        if (file.endsWith(JSON_FILE)) {
            try {
                unmaskedSecretSettings(JSON.readTree(text), findings, file);
            } catch (RuntimeException unparsable) {
                findings.add(file + ": not valid JSON, so the secret-setting rule cannot run");
            }
        }
        Matcher addresses = EMAIL.matcher(text);
        while (addresses.find()) {
            String address = addresses.group().toLowerCase(Locale.ROOT);
            if (!fixtures.addresses().contains(address) && !isFixtureDomain(address.substring(address.indexOf('@') + 1))) {
                findings.add(file + ": an address no fixture uses " + address);
            }
        }
        return findings;
    }

    private static void unmaskedSecretSettings(JsonNode node, List<String> findings, String file) {
        if (node.isObject()) {
            JsonNode name = node.path("name");
            JsonNode value = node.path("value");
            if (name.isString() && SECRET_SETTING.matcher(name.asString()).matches() && value.isString()
                    && !value.asString().isEmpty() && !MASKED.equals(value.asString())) {
                findings.add(file + ": an unmasked value of the secret setting " + name.asString());
            }
            node.values().forEach(child -> unmaskedSecretSettings(child, findings, file));
        } else if (node.isArray()) {
            node.values().forEach(child -> unmaskedSecretSettings(child, findings, file));
        }
    }

    private static boolean isFixtureDomain(String domain) {
        return FIXTURE_DOMAINS.contains(domain) || domain.endsWith(RESERVED_EXAMPLE_TLD);
    }

    private static boolean isBase64UrlId(String candidate) {
        try {
            return Base64.getUrlDecoder().decode(candidate).length == UUID_BYTES;
        } catch (IllegalArgumentException notBase64) {
            return false;
        }
    }

    static Fixtures fixtures(Path testSources) throws IOException {
        Set<String> addresses = new TreeSet<>(EXPLICIT_ADDRESSES);
        Set<String> values = new TreeSet<>();
        try (Stream<Path> files = Files.walk(testSources)) {
            for (Path file : files.filter(Files::isRegularFile).filter(BaselineHygiene::isText).toList()) {
                String text = Files.readString(file, StandardCharsets.UTF_8);
                EMAIL.matcher(text).results().map(match -> match.group().toLowerCase(Locale.ROOT)).forEach(addresses::add);
                TOKEN.matcher(text).results().map(match -> match.group()).forEach(values::add);
            }
        }
        return new Fixtures(addresses, values);
    }

    private static boolean isText(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot >= 0 && TEXT_FILES.contains(name.substring(dot));
    }

    record Report(int filesScanned, List<String> findings) {
    }

    record Fixtures(Set<String> addresses, Set<String> values) {
    }
}
