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
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

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
        for (int account = 0; account < TIMED_ACCOUNTS; account++) {
            insertAccount(new UUID(0x0193_0000_0000_7000L + account, 0x8000_0000_0000_0000L + account), Long.toString(5_000_000_000L + account),
                    NOW.minus(Duration.ofDays(account)));
        }
        for (int action = 0; action < TIMED_ACTIONS; action++) {
            insertAction(new UUID(0x0194_0000_0000_7000L + action, 0x8000_0000_0000_0000L + action), NOW.minus(Duration.ofHours(action)));
        }
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
        assertThat(millis[TIMED_RUNS / 2]).as("the median of %d manifests over %d accounts and %d actions, in ms: %s", TIMED_RUNS, TIMED_ACCOUNTS,
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

    private void insertAction(UUID id, Instant performedAt) {
        jdbc.sql("insert into admin_action (id, admin_id, action, subject_id, details, performed_at) values (:id, :admin, 'CHANGE_LOG_LEVEL', null, "
                        + "'{\"logger\":\"cz.novanadeje.app\"}', :at)")
                .param("id", id)
                .param("admin", CaseRows.administratorId())
                .param("at", CaseRows.timestamp(performedAt.toString()))
                .update();
    }

    private static List<String> chunkIds(JsonNode manifest) {
        return manifest.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).toList();
    }

    private JsonNode answer() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get(MANIFEST).header("Accept-Language", "cs")
                        .with(jwt().jwt(token -> token.subject(CaseRows.administratorId().toString()).claims(claims -> claims.remove("scope")))
                                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }
}
