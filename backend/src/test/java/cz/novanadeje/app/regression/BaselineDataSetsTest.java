package cz.novanadeje.app.regression;

import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.FieldSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineDataSetsTest {

    static final List<String> SHARED_CASE_TOPICS = List.of("shared-cases/admin-overview", "shared-cases/donor-summary", "shared-cases/monthly-report",
            "shared-cases/receipts");
    static final Set<String> REAL_LOOKING_TOKEN_DIGESTS = Set.of(
            "dfea280e2e6a6ad8bbeffc4309acabbd9437f8dbb882ed547149439c4e8c2b6f",
            "ad1fe375c28a8a829c83918892923d9ac5dfb4c11cbd12f57558afd8c492399c",
            "135d9d4fbb41478fcc20d0252ab5731885d5216a1408e82d541b1c9320970b43",
            "e2a4f96eabc4b89488f83967f4d878f9e7a0214e8815540d984c0a39eb732f87");
    static final String SCREENS_SPEC = "frontend/e2e/baseline/screens.spec.ts";
    static final String SCREENS_MANIFEST = "regression/v2/screens/manifest.json";
    private static final Pattern TOKEN = Pattern.compile("[\\p{L}\\p{N}][\\p{L}\\p{N}._@+-]*[\\p{L}\\p{N}]");
    static final String ADDITIONS_FOLDER = "regression/v2/additions";
    private static final Pattern SCREEN_NAME = Pattern.compile("^  (?:publicPage|donorPage|adminPage)\\('([^']+)'|^    name: '([^']+)'", Pattern.MULTILINE);
    private static final Pattern ELEMENT_SHOT_NAME = Pattern.compile("\\belement\\('([^']+)'");
    private static final Pattern ELEMENTS_ONLY = Pattern.compile("^    name: '([^']+)',\\n    elementsOnly: true,", Pattern.MULTILINE);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @ParameterizedTest
    @FieldSource("SHARED_CASE_TOPICS")
    @DisplayName("Given a topic of shared cases, when its files are read, then each holds the source, the logic and named cases with an input and an expected value")
    void should_hold_source_logic_and_named_cases_when_the_files_of_a_shared_case_topic_are_read(String topic) throws IOException {
        List<Path> files = jsonFiles(topic);
        assertThat(files).as("case files in %s", topic).isNotEmpty();

        for (Path file : files) {
            JsonNode cases = JSON.readTree(Files.readString(file, StandardCharsets.UTF_8));
            assertThat(cases.properties().stream().map(java.util.Map.Entry::getKey).toList()).as("%s", file).containsExactly("source", "logic", "cases");
            assertThat(cases.get("source").asString()).as("%s", file).isIn(SharedCases.SOURCES);
            assertThat(cases.get("logic").asString()).as("%s", file).isNotBlank();
            assertThat(cases.get("cases").isArray() && !cases.get("cases").isEmpty()).as("%s has cases", file).isTrue();
            Set<String> names = new HashSet<>();
            for (JsonNode entry : cases.get("cases")) {
                assertThat(entry.properties().stream().map(java.util.Map.Entry::getKey).toList()).as("%s", file).containsExactly("name", "input", "expected");
                assertThat(names.add(entry.get("name").asString())).as("%s names %s once", file, entry.get("name").asString()).isTrue();
            }
        }
    }

    @Test
    @DisplayName("Given the receipt corpus, the data sets and the screens manifest, when they are read, then none carries a real-looking fixture value")
    void should_carry_no_real_looking_fixture_value_when_the_new_baseline_files_are_read() throws IOException {
        List<Path> files = Stream.concat(SHARED_CASE_TOPICS.stream(), Stream.of("regression/v2/receipts", "regression/v2/screens"))
                .flatMap(folder -> jsonFiles(folder).stream()).toList();
        assertThat(files).isNotEmpty();

        for (Path file : files) {
            assertThat(realLookingTokens(Files.readString(file, StandardCharsets.UTF_8), REAL_LOOKING_TOKEN_DIGESTS)).as("real-looking values in %s", file).isEmpty();
        }
    }

    @Test
    @DisplayName("Given text with an address, a domain and a name whose digests are listed, when its tokens are checked, then each is reported whatever its case")
    void should_report_each_listed_token_whatever_its_case_when_text_is_checked_given_listed_digests() {
        String text = "Psal Zkušební.Člověk@Dvůr.example; doména Pokus-Mail.invalid, jméno Zkušebníková, ale ne zkušební.";
        Set<String> listed = Set.of(sha256("zkušební.člověk@dvůr.example"), sha256("pokus-mail.invalid"), sha256("zkušebníková"));

        assertThat(realLookingTokens(text, listed)).containsExactlyInAnyOrder("zkušební.člověk@dvůr.example", "pokus-mail.invalid", "zkušebníková");
    }

    @Test
    @DisplayName("Given the screens spec and the manifest, when their states are compared, then the manifest has a shot of every state of the spec and no other")
    void should_list_exactly_the_states_of_the_spec_when_the_screens_manifest_is_compared_with_the_spec() throws IOException {
        String spec = Files.readString(GoldenFiles.repositoryRoot().resolve(SCREENS_SPEC), StandardCharsets.UTF_8);
        String screens = spec.substring(spec.indexOf("const SCREENS: Screen[] = ["), spec.indexOf("\n];", spec.indexOf("const SCREENS: Screen[] = [")));
        Set<String> specStates = new TreeSet<>();
        Matcher name = SCREEN_NAME.matcher(screens);
        while (name.find()) {
            specStates.add(name.group(1) != null ? name.group(1) : name.group(2));
        }
        Set<String> elementShots = new TreeSet<>();
        Matcher element = ELEMENT_SHOT_NAME.matcher(screens);
        while (element.find()) {
            elementShots.add(element.group(1));
        }
        Set<String> expected = new TreeSet<>(specStates);
        ELEMENTS_ONLY.matcher(screens).results().map(only -> only.group(1)).forEach(expected::remove);
        expected.addAll(elementShots);

        assertThat(specStates).as("states in %s", SCREENS_SPEC).hasSizeGreaterThan(30);
        assertThat(elementShots).as("element shots in %s", SCREENS_SPEC).isNotEmpty()
                .allSatisfy(shot -> assertThat(specStates).as("the state of %s", shot).contains(shot.substring(0, shot.indexOf("--"))));
        assertThat(new TreeSet<>(screenShots().stream().map(shot -> shot.get("state").asString()).toList())).isEqualTo(expected);
    }

    @Test
    @DisplayName("Given the screens manifest, when the shots added after the baseline are read, then each names its slice, whose patch of the screens spec lies beside the baseline, and follows every shot of the baseline")
    void should_name_the_slice_and_its_spec_patch_when_screens_are_added_after_the_baseline() throws IOException {
        List<JsonNode> shots = screenShots();
        List<JsonNode> added = shots.stream().filter(shot -> shot.has("addedIn")).toList();

        assertThat(added).isNotEmpty();
        assertThat(shots.subList(shots.size() - added.size(), shots.size())).as("shots added after the baseline come last").isEqualTo(added);
        for (JsonNode shot : added) {
            String slice = shot.get("addedIn").asString();
            assertThat(GoldenFiles.repositoryRoot().resolve(ADDITIONS_FOLDER).resolve(slice + ".patch")).as("the spec patch of %s", shot.get("file").asString()).isRegularFile();
        }
    }

    static Set<String> realLookingTokens(String text, Set<String> digests) {
        Set<String> found = new TreeSet<>();
        Matcher token = TOKEN.matcher(Normalizer.normalize(text, Normalizer.Form.NFC).toLowerCase(Locale.ROOT));
        while (token.find()) {
            List<String> candidates = new ArrayList<>(List.of(token.group()));
            candidates.addAll(List.of(token.group().split("@")));
            candidates.stream().filter(candidate -> digests.contains(sha256(candidate))).forEach(found::add);
        }
        return found;
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException(missing);
        }
    }

    @Test
    @DisplayName("Given the screens manifest, when it is read, then every route and state has a shot at 390 and at 1280 px with the digest of its pixels")
    void should_list_every_state_at_both_widths_when_the_screens_manifest_is_read() throws IOException {
        JsonNode manifest = JSON.readTree(Files.readString(GoldenFiles.repositoryRoot().resolve(SCREENS_MANIFEST), StandardCharsets.UTF_8));

        assertThat(manifest.get("source").asString()).isEqualTo(ApiTranscripts.SOURCE);
        List<JsonNode> shots = screenShots();
        assertThat(shots.size()).as("shots").isGreaterThanOrEqualTo(60);
        Set<String> states = new HashSet<>();
        Set<String> files = new HashSet<>();
        for (JsonNode shot : shots) {
            states.add(shot.get("state").asString());
            assertThat(files.add(shot.get("file").asString())).as("%s is listed once", shot.get("file").asString()).isTrue();
            assertThat(shot.get("pixelsSha256").asString()).matches("[0-9a-f]{64}");
            assertThat(shot.get("width").asInt()).isIn(390, 1280);
        }
        for (String state : states) {
            assertThat(shots.stream().filter(shot -> shot.get("state").asString().equals(state)).map(shot -> shot.get("width").asInt()).toList())
                    .as("widths of %s", state).containsExactlyInAnyOrder(390, 1280);
        }
    }

    private static List<JsonNode> screenShots() throws IOException {
        return JSON.readTree(Files.readString(GoldenFiles.repositoryRoot().resolve(SCREENS_MANIFEST), StandardCharsets.UTF_8)).get("shots").valueStream().toList();
    }

    private static List<Path> jsonFiles(String folder) {
        Path root = GoldenFiles.repositoryRoot().resolve(folder);
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(file -> file.toString().endsWith(".json")).sorted().toList();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}
