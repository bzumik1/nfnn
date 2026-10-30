package cz.novanadeje.app.regression;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWords;
import cz.novanadeje.app.operations.domain.settings.SetupCode;
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
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import java.util.regex.MatchResult;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
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
    private static final Set<String> DENIED_ADDRESSES = Set.of("ucetni@stavby.cz");
    private static final Pattern TOTP_SECRET = Pattern.compile("(?<![A-Za-z0-9])[A-Z2-7]{32}(?![A-Za-z0-9])");
    private static final Pattern SECRET_PARAMETER = Pattern.compile("(?i)secret=(?!<)");
    private static final Pattern SECRET_SETTING = Pattern.compile("[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|KEY)");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern ANY_WHITESPACE = Pattern.compile("\\s+");
    private static final List<String> REAL_SURNAME_FAMILIES = List.of("znamenac");
    private static final String MASKED = "<secret>";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Pattern BACKUP_KEY_SHAPE = Pattern.compile("(?i)(?<![A-Za-z0-9])age-secret-key-1[0-9a-z]{58}(?![A-Za-z0-9])");
    private static final String WORD_FIELD = "word";
    private static final String WORDS_FIELD = "words";
    private static final Pattern FEATURE_WORD = Pattern.compile("\"(\\p{L}{3," + BackupKeyWords.MAX_WORD_LENGTH + "})\"");
    private static final String FEATURE_FILE = ".feature";
    private static final Pattern BCRYPT = Pattern.compile("\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}");
    private static final Pattern HEX = Pattern.compile("(?<![A-Za-z0-9_-])[0-9a-fA-F]{32,}(?![A-Za-z0-9_-])");
    private static final Pattern DIGIT = Pattern.compile("[0-9]");
    private static final Pattern HEX_LETTER = Pattern.compile("[a-fA-F]");
    private static final Pattern LABELLED_DIGEST = Pattern.compile("(?:\"[A-Za-z]*(?:sha256|Sha256)\"\\s*:\\s*\"|sha256=)$");
    private static final int LABEL_WINDOW = 40;
    static final Path BASELINE_COMMIT = Path.of("v2", "BASELINE_COMMIT");
    private static final Path REGRESSION_FOLDER = Path.of("regression");
    private static final Pattern COMMIT_ID = Pattern.compile("[0-9a-f]{40}");
    private static final Pattern STANDARD_BASE64 = Pattern.compile("(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/=_-])");
    private static final Pattern BASE64_ONLY_CHARACTER = Pattern.compile("[+/=]");
    private static final Pattern RECOVERY_CODE = Pattern.compile("(?<![A-Z0-9])OBNOVA[\\s:-]*([A-HJ-NP-Z2-9]{4}[\\s-]?[A-HJ-NP-Z2-9]{4})(?![A-Z0-9])");
    private static final Pattern CODE_SEPARATOR = Pattern.compile("[\\s-]");
    private static final String SETUP_CHARACTER = "[" + SetupCode.ALPHABET + "]";
    private static final Pattern SETUP_CODE = Pattern.compile("(?<![A-Za-z0-9-])(?:" + SETUP_CHARACTER + "{4}-" + SETUP_CHARACTER + "{4}-" + SETUP_CHARACTER + "{4}|"
            + SETUP_CHARACTER + "{" + SetupCode.LENGTH + "})(?![A-Za-z0-9-])");
    private static final Pattern LETTER = Pattern.compile("[A-Z]");
    private static final Pattern IBAN = Pattern.compile("(?<![A-Za-z0-9])[A-Z]{2}[0-9]{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){3,7}(?: [A-Z0-9]{1,3})?)(?![A-Za-z0-9])");
    private static final int IBAN_MINIMUM_DIGITS = 10;
    private static final Pattern ACCOUNT = Pattern.compile("(?<![A-Za-z0-9_/.-])(?:[0-9]{1,6}-)?[0-9]{6,10}/[0-9]{4}(?![A-Za-z0-9_/])");
    private static final Pattern FEATURE_TABLE_ACCOUNT = Pattern.compile("\\|\\s*((?:[0-9]{1,6}-)?[0-9]{6,10})\\s*\\|\\s*([0-9]{4})\\s*(?=\\|)");
    private static final Set<String> ISO_EXAMPLE_IBANS = Set.of("CZ6508000000192000145399", "CZ9455000000001011038930", "DE89370400440532013000",
            "GB29NWBK60161331926819", "GB82WEST12345698765432", "SK3112000000198742637541");
    static final String DEV_BACKUP_KEY = "AGE-SECRET-KEY-1CZSEH9JWJ74WWUA7EFSLLS5DFA24G5NE59ZHTVN0505ACQH8CSYQVPZ2PD";
    static final String FOUNDATION_IBAN = "CZ2620100000005544332217";
    static final String FOUNDATION_ACCOUNT = "5544332217/2010";

    private BaselineHygiene() {
    }

    static Report scan(Path root, Fixtures fixtures) throws IOException {
        if (!Files.isDirectory(root)) {
            return new Report(0, List.of());
        }
        List<Path> paths;
        try (Stream<Path> files = Files.walk(root)) {
            paths = files.filter(Files::isRegularFile).sorted().toList();
        }
        boolean anchored = REGRESSION_FOLDER.equals(root.getFileName()) && Files.isRegularFile(root.resolve(BASELINE_COMMIT));
        Fixtures withBaselineCommit = anchored ? withBaselineCommit(fixtures, root.resolve(BASELINE_COMMIT)) : fixtures;
        List<String> findings = new ArrayList<>();
        for (Path file : paths) {
            Path relative = root.relativize(file);
            findings.addAll(findings(relative.toString(), Files.readString(file, StandardCharsets.UTF_8), withBaselineCommit, anchored && relative.equals(BASELINE_COMMIT)));
        }
        return new Report(paths.size(), findings);
    }

    private static Fixtures withBaselineCommit(Fixtures fixtures, Path baselineCommit) throws IOException {
        String commit = Files.readString(baselineCommit, StandardCharsets.UTF_8).strip();
        if (!COMMIT_ID.matcher(commit).matches()) {
            return fixtures;
        }
        Set<String> values = new TreeSet<>(fixtures.values());
        values.add(commit);
        return new Fixtures(fixtures.addresses(), values, fixtures.words());
    }

    static List<String> findings(String file, String text, Fixtures fixtures) {
        return findings(file, text, fixtures, Path.of(file).equals(BASELINE_COMMIT));
    }

    private static List<String> findings(String file, String text, Fixtures fixtures, boolean baselineCommit) {
        List<String> findings = new ArrayList<>();
        UUID_TEXT.matcher(text).results().forEach(match -> findings.add(file + ": an id " + match.group()));
        BASE64URL_ID_FIELD.matcher(text).results().map(match -> match.group(1)).filter(BaselineHygiene::isBase64UrlId)
                .forEach(candidate -> findings.add(file + ": an id in base64url " + candidate.substring(0, 8)));
        JWT.matcher(text).results().forEach(match -> findings.add(file + ": a JWT starting " + match.group()));
        List<MatchResult> otherShapes = Stream.concat(BCRYPT.matcher(text).results(), STANDARD_BASE64.matcher(text).results().filter(BaselineHygiene::isStandardBase64)).toList();
        TOKEN.matcher(text).results().filter(match -> otherShapes.stream().noneMatch(shape -> shape.start() <= match.start() && match.end() <= shape.end()))
                .map(match -> match.group())
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
        secretShapes(file, text, fixtures, baselineCommit, findings);
        if (file.endsWith(JSON_FILE)) {
            try {
                JsonNode json = JSON.readTree(text);
                unmaskedSecretSettings(json, findings, file);
                unmaskedBackupKeyWords(json, allowedBackupKeyWords(fixtures), fixtures, findings, file);
            } catch (RuntimeException unparsable) {
                findings.add(file + ": not valid JSON, so the secret-setting rule cannot run");
            }
        }
        Matcher addresses = EMAIL.matcher(text);
        while (addresses.find()) {
            String address = addresses.group().toLowerCase(Locale.ROOT);
            if (DENIED_ADDRESSES.contains(address)) {
                findings.add(file + ": a denied address " + address);
            } else if (!fixtures.addresses().contains(address) && !isFixtureDomain(address.substring(address.indexOf('@') + 1))) {
                findings.add(file + ": an address no fixture uses " + address);
            }
        }
        return findings;
    }

    private static void secretShapes(String file, String text, Fixtures fixtures, boolean baselineCommit, List<String> findings) {
        Predicate<String> spelled = candidate -> fixtures.values().contains(candidate);
        BACKUP_KEY_SHAPE.matcher(text).results().map(MatchResult::group)
                .filter(key -> !key.equalsIgnoreCase(DEV_BACKUP_KEY) && fixtures.values().stream().noneMatch(key::equalsIgnoreCase))
                .forEach(key -> findings.add(file + ": a backup key starting " + key.substring(0, 8).toUpperCase(Locale.ROOT)));
        BCRYPT.matcher(text).results().forEach(match -> findings.add(file + ": a BCrypt hash"));
        if (!baselineCommit) {
            HEX.matcher(text).results()
                    .filter(match -> DIGIT.matcher(match.group()).find() && HEX_LETTER.matcher(match.group()).find())
                    .filter(match -> !LABELLED_DIGEST.matcher(text.substring(Math.max(0, match.start() - LABEL_WINDOW), match.start())).find())
                    .map(MatchResult::group).filter(spelled.negate())
                    .forEach(hex -> findings.add(file + ": a hex secret starting " + hex.substring(0, 8)));
        }
        STANDARD_BASE64.matcher(text).results().filter(BaselineHygiene::isStandardBase64).map(MatchResult::group).filter(spelled.negate())
                .forEach(base64 -> findings.add(file + ": a base64 secret starting " + base64.substring(0, 8)));
        RECOVERY_CODE.matcher(text).results().map(BaselineHygiene::recoveryCode).filter(spelled.negate())
                .forEach(code -> findings.add(file + ": a recovery code outside its <recovery-code> slot"));
        SETUP_CODE.matcher(text).results().filter(match -> LETTER.matcher(match.group()).find())
                .forEach(match -> findings.add(file + ": a setup code outside its <setup-code> slot"));
        IBAN.matcher(text).results().map(match -> match.group().replace(" ", ""))
                .filter(iban -> DIGIT.matcher(iban.substring(4)).results().count() >= IBAN_MINIMUM_DIGITS)
                .filter(iban -> !iban.equals(FOUNDATION_IBAN) && !ISO_EXAMPLE_IBANS.contains(iban)).filter(spelled.negate())
                .forEach(iban -> findings.add(file + ": an IBAN starting " + iban.substring(0, 8)));
        ACCOUNT.matcher(text).results().map(MatchResult::group).filter(account -> !account.equals(FOUNDATION_ACCOUNT)).filter(spelled.negate())
                .forEach(account -> findings.add(file + ": an account number ending " + account.substring(account.indexOf('/'))));
    }

    private static String recoveryCode(MatchResult match) {
        return CODE_SEPARATOR.matcher(match.group(1)).replaceAll("");
    }

    private static boolean isStandardBase64(MatchResult match) {
        String candidate = match.group();
        return BASE64_ONLY_CHARACTER.matcher(candidate).find() && UPPERCASE.matcher(candidate).find() && LOWERCASE.matcher(candidate).find()
                && DIGIT.matcher(candidate).find();
    }

    private static Set<String> allowedBackupKeyWords(Fixtures fixtures) {
        return Stream.concat(Stream.of(DEV_BACKUP_KEY), fixtures.values().stream().filter(value -> BACKUP_KEY_SHAPE.matcher(value).matches()))
                .flatMap(key -> backupKey(key).stream()).flatMap(key -> key.words().stream()).collect(Collectors.toUnmodifiableSet());
    }

    private static Optional<BackupKey> backupKey(String value) {
        try {
            return Optional.of(new BackupKey(value));
        } catch (RuntimeException notAKey) {
            return Optional.empty();
        }
    }

    private static void unmaskedBackupKeyWords(JsonNode node, Set<String> allowed, Fixtures fixtures, List<String> findings, String file) {
        if (node.isObject()) {
            for (var field : node.properties()) {
                if (WORD_FIELD.equals(field.getKey()) && field.getValue().isString()) {
                    unmaskedBackupKeyWord(field.getValue().asString(), allowed, fixtures, findings, file);
                } else if (WORDS_FIELD.equals(field.getKey()) && field.getValue().isArray()) {
                    field.getValue().values().stream().filter(JsonNode::isString)
                            .forEach(word -> unmaskedBackupKeyWord(word.asString(), allowed, fixtures, findings, file));
                }
                unmaskedBackupKeyWords(field.getValue(), allowed, fixtures, findings, file);
            }
        } else if (node.isArray()) {
            node.values().forEach(child -> unmaskedBackupKeyWords(child, allowed, fixtures, findings, file));
        }
    }

    private static void unmaskedBackupKeyWord(String word, Set<String> allowed, Fixtures fixtures, List<String> findings, String file) {
        boolean known = MASKED.equals(word) || fixtures.words().contains(word.toLowerCase(Locale.ROOT))
                || BackupKeyWords.canonical(word).filter(allowed::contains).isPresent();
        if (!known) {
            findings.add(file + ": an unmasked backup key word");
        }
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

    static Fixtures fixtures(Path... testSources) throws IOException {
        Set<String> addresses = new TreeSet<>(EXPLICIT_ADDRESSES);
        Set<String> values = new TreeSet<>();
        Set<String> words = new TreeSet<>();
        for (Path testSource : testSources) {
            try (Stream<Path> files = Files.walk(testSource)) {
                for (Path file : files.filter(Files::isRegularFile).filter(BaselineHygiene::isText).toList()) {
                    String text = Files.readString(file, StandardCharsets.UTF_8);
                    EMAIL.matcher(text).results().map(match -> match.group().toLowerCase(Locale.ROOT)).forEach(addresses::add);
                    Stream.of(TOKEN, STANDARD_BASE64, ACCOUNT).flatMap(shape -> shape.matcher(text).results()).map(MatchResult::group).forEach(values::add);
                    IBAN.matcher(text).results().map(match -> match.group().replace(" ", "")).forEach(values::add);
                    RECOVERY_CODE.matcher(text).results().map(BaselineHygiene::recoveryCode).forEach(values::add);
                    if (file.getFileName().toString().endsWith(FEATURE_FILE)) {
                        FEATURE_WORD.matcher(text).results().map(match -> match.group(1).toLowerCase(Locale.ROOT)).forEach(words::add);
                        FEATURE_TABLE_ACCOUNT.matcher(text).results().map(match -> match.group(1) + "/" + match.group(2)).forEach(values::add);
                    }
                }
            }
        }
        return new Fixtures(addresses, values, words);
    }

    private static boolean isText(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot >= 0 && TEXT_FILES.contains(name.substring(dot));
    }

    record Report(int filesScanned, List<String> findings) {
    }

    record Fixtures(Set<String> addresses, Set<String> values, Set<String> words) {

        Fixtures(Set<String> addresses, Set<String> values) {
            this(addresses, values, Set.of());
        }
    }
}
