package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RateLimiterWindows;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@DonationRowsContext
class AdminDonorsSyncTest {

    private static final String MANIFEST = "/api/admin/donors/sync";
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final int TIMED_ACCOUNTS = 200;
    private static final int TIMED_ACTIONS = 1_000;
    private static final int WARM_UP_RUNS = 5;
    private static final int TIMED_RUNS = 21;
    private static final long MANIFEST_BUDGET_MILLIS = 100;
    private static final int CHUNKS_PER_REQUEST = 64;
    private static final List<String> TIMED_SHAPES = List.of("PAIR_PAYMENT", "UPDATE_NEWS", "CHANGE_REPORT_SETTINGS", "GRANT_ADMINISTRATION",
            "BACKUP_RESTORE_FAILED");
    private static final String LONGEST_TITLE = "Letní tábor u rybníka Hejtman, kde děti strávily týden plný her, výletů a táboráků s celou rodinou i přáteli z celého kraje".substring(0, 120);
    private static final String LONG_RESTORE_ERROR = "pg_restore: error: could not execute query: ERROR:  relation already exists; ".repeat(24);

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private AdminDonorsSyncRateLimiter syncRateLimiter;
    @Autowired
    private AdminActionTrail trail;

    @BeforeEach
    void administrator() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        RateLimiterWindows.reset(List.of(syncRateLimiter));
        clock.set(NOW);
        insertAccount(CaseRows.administratorId(), "3999999999", NOW);
        jdbc.sql("insert into donor_role (donor_id, role) values (:id, 'ADMIN')").param("id", CaseRows.administratorId()).update();
    }

    @AfterEach
    void truncate() {
        reset(AopTestUtils.<AdminActionTrail>getUltimateTargetObject(trail));
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given an action committed by another transaction while the backend reads the accounts and the trail, when it answers the manifest, then the answer holds the trail as it stood when its read began")
    void should_answer_the_trail_as_it_stood_when_the_read_began_when_the_backend_answers_the_manifest_given_an_action_committed_meanwhile() throws Exception {
        AdminActionTrail spy = AopTestUtils.getUltimateTargetObject(trail);
        doAnswer(call -> {
            Thread meanwhile = Thread.ofPlatform().start(() -> insertAction(UUID.randomUUID(), NOW));
            meanwhile.join();
            return call.callRealMethod();
        }).when(spy).findAllNewestFirst();

        JsonNode manifest = answer();

        assertThat(jdbc.sql("select count(*) from admin_action").query(Integer.class).single()).as("the action committed meanwhile").isEqualTo(1);
        assertThat(chunkIds(manifest)).as("the chunks of an answer whose read began before the action").containsExactly("accounts:2026-11");
    }

    @Test
    @DisplayName("Given an account registered and an action performed just after a Prague midnight that is still the previous month in UTC, when the manifest is answered, then both stand in the Prague month")
    void should_bucket_by_prague_month_when_answered_given_instants_just_after_prague_midnight() throws Exception {
        insertAccount(UUID.randomUUID(), "4999999999", Instant.parse("2026-09-30T22:30:00Z"));
        insertAction(UUID.randomUUID(), Instant.parse("2026-07-31T22:30:00Z"));

        assertThat(chunkIds(answer())).containsExactly("accounts:2026-10", "accounts:2026-11", "audit:2026-08");
    }

    @Test
    @DisplayName("Given two hundred accounts and a thousand actions, when an administration device asks for the accounts manifest, then the backend answers within 100 ms")
    void should_answer_within_100_ms_when_an_administration_device_asks_for_the_accounts_manifest_given_a_thousand_actions() throws Exception {
        List<UUID> accounts = insertTimedAccounts();
        for (int action = 0; action < TIMED_ACTIONS; action++) {
            insertAction(new UUID(0x0194_0000_0000_7000L + action, 0x8000_0000_0000_0000L + action), NOW.minus(Duration.ofHours(action)),
                    TIMED_SHAPES.get(action % TIMED_SHAPES.size()), timedDetails(action, accounts.get(action % accounts.size())));
        }
        JsonNode manifest = answer("cs");
        assertThat(manifest.get("chunks").valueStream().filter(chunk -> chunk.get("id").asString().startsWith("audit:")).mapToInt(chunk -> chunk.get("count").asInt())
                .sum()).as("the actions the manifest covers").isEqualTo(TIMED_ACTIONS);
        assertThat(summariesOf(manifest)).as("the timed actions each have a summary").hasSize(TIMED_ACTIONS).doesNotContainNull();
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            answer();
        }
        long[] millis = new long[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            long start = System.nanoTime();
            answer();
            millis[run] = Duration.ofNanos(System.nanoTime() - start).toMillis();
        }
        Arrays.sort(millis);
        assertThat(millis[0]).as("the fastest of %d manifests over %d accounts and %d actions, in ms: %s", TIMED_RUNS, TIMED_ACCOUNTS,
                TIMED_ACTIONS, Arrays.toString(millis)).isLessThan(MANIFEST_BUDGET_MILLIS);
    }

    private void insertAccount(UUID id, String variableSymbol, Instant registeredAt) {
        jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                        + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, 'PERSON', 'Dárce účtu', null, 'Dlouhá 12', "
                        + "'Ústí nad Labem', '400 01', :email, null, :symbol, 'cs', :at, :at, null)")
                .param("id", id)
                .param("email", "ucet-" + variableSymbol + "@example.cz")
                .param("symbol", variableSymbol)
                .param("at", CaseRows.timestamp(registeredAt.toString()))
                .update();
    }

    @Test
    @DisplayName("Given actions of every kind the timed trail holds, when one device asks in English and another in Czech, then both get the same digests and the Czech summaries")
    void should_answer_the_same_digests_and_czech_summaries_when_devices_ask_in_english_and_czech_given_the_trail() throws Exception {
        List<UUID> accounts = insertTimedAccounts().subList(0, TIMED_SHAPES.size());
        for (int action = 0; action < TIMED_SHAPES.size(); action++) {
            insertAction(new UUID(0x0194_0000_0000_7000L + action, 0x8000_0000_0000_0000L + action), NOW.minus(Duration.ofHours(action)),
                    TIMED_SHAPES.get(action), timedDetails(action, accounts.get(action)));
        }

        JsonNode inEnglish = answer("en");
        RateLimiterWindows.reset(List.of(syncRateLimiter));
        JsonNode inCzech = answer("cs");

        assertThat(inEnglish.get("chunks")).isEqualTo(inCzech.get("chunks"));
        assertThat(summariesOf(inEnglish)).contains("Role správce udělena dárci Dárce účtu.",
                "Změněno nastavení měsíčního přehledu: počet příjemců 2, chodí 3. den v měsíci v 7:00 a obsahuje dárce, dary.");
    }

    private List<UUID> insertTimedAccounts() {
        List<UUID> accounts = new ArrayList<>();
        for (int account = 0; account < TIMED_ACCOUNTS; account++) {
            UUID id = new UUID(0x0193_0000_0000_7000L + account, 0x8000_0000_0000_0000L + account);
            insertAccount(id, Long.toString(5_000_000_000L + account), NOW.minus(Duration.ofDays(account)));
            accounts.add(id);
        }
        return accounts;
    }

    private static String timedDetails(int action, UUID donor) {
        String other = new UUID(0x0195_0000_0000_7000L + action, 0x8000_0000_0000_0000L + action).toString();
        return switch (TIMED_SHAPES.get(action % TIMED_SHAPES.size())) {
            case "PAIR_PAYMENT" -> "Platba " + (26_683_551 + action) + " (Money[amountMinor=" + (50_000 + action) + ", currency=CZK], zaúčtována 2026-10-10)"
                    + " ručně přiřazena dárci " + donor + " jako dar " + other;
            case "UPDATE_NEWS" -> "Aktualita " + other + " „letni-tabor-" + action + "“ upravena; titulek „" + LONGEST_TITLE + "“";
            case "BACKUP_RESTORE_FAILED" -> "Obnova ze zálohy nfnn-2026-10-23_0300.dump.age (požadavek " + other + ") selhala: " + LONG_RESTORE_ERROR
                    + "; data zůstala, jak byla";
            case "CHANGE_REPORT_SETTINGS" -> "Nastavení měsíčního přehledu změněno: počet příjemců 2; odesílá se 3. den v měsíci v 7:00; části dárci, dary";
            default -> "Role správce udělena dárci " + donor;
        };
    }

    private List<String> summariesOf(JsonNode manifest) throws Exception {
        String ids = manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).filter(id -> id.startsWith("audit:"))
                .collect(Collectors.joining(","));
        List<String> summaries = new ArrayList<>();
        for (String batch : ids.isEmpty() ? List.<String>of() : batchesOf(ids)) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            JsonNode chunks = json.readTree(perform(MANIFEST + "/chunks?ids=" + batch, "en").getContentAsString(StandardCharsets.UTF_8));
            chunks.get("chunks").forEach(chunk -> chunk.get("rows").forEach(row -> summaries.add(row.get("summary").isNull() ? null : row.get("summary").asString())));
        }
        return summaries;
    }

    private static List<String> batchesOf(String ids) {
        List<String> all = Arrays.asList(ids.split(","));
        List<String> batches = new ArrayList<>();
        for (int start = 0; start < all.size(); start += CHUNKS_PER_REQUEST) {
            batches.add(String.join(",", all.subList(start, Math.min(all.size(), start + CHUNKS_PER_REQUEST))));
        }
        return batches;
    }

    private void insertAction(UUID id, Instant performedAt) {
        insertAction(id, performedAt, "CHANGE_LOG_LEVEL", "{\"logger\":\"cz.novanadeje.app\"}");
    }

    private void insertAction(UUID id, Instant performedAt, String action, String details) {
        jdbc.sql("insert into admin_action (id, admin_id, action, subject_id, details, performed_at) values (:id, :admin, :action, null, :details, :at)")
                .param("id", id)
                .param("admin", CaseRows.administratorId())
                .param("action", action)
                .param("details", details)
                .param("at", CaseRows.timestamp(performedAt.toString()))
                .update();
    }

    private static List<String> chunkIds(JsonNode manifest) {
        return manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).toList();
    }

    private JsonNode answer() throws Exception {
        return answer("cs");
    }

    private JsonNode answer(String language) throws Exception {
        return json.readTree(perform(MANIFEST, language).getContentAsString(StandardCharsets.UTF_8));
    }

    private MockHttpServletResponse perform(String path, String language) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get(path).header("Accept-Language", language)
                        .with(jwt().jwt(token -> token.subject(CaseRows.administratorId().toString()).claims(claims -> claims.remove("scope")))
                                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return response;
    }
}
