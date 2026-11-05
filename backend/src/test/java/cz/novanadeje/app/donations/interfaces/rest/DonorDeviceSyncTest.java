package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.support.CanonicalRowsDigest;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RateLimiterWindows;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@DonationRowsContext
class DonorDeviceSyncTest {

    private static final String SEEDS_VARIABLE = "SYNC_CONVERGENCE_SEEDS";
    private static final int DEFAULT_SEEDS = 30;
    private static final int OPERATIONS = 24;
    private static final int DEVICES = 3;
    private static final int TIMED_DONATIONS = 1_000;
    private static final int TIMED_RUNS = 21;
    private static final long MANIFEST_BUDGET_MILLIS = 50;
    private static final String MANIFEST = "/api/donations/me/sync";
    private static final String CHUNKS = "/api/donations/me/sync/chunks";

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private DonorSyncRateLimiter syncRateLimiter;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @TestFactory
    @DisplayName("Given seeded random changes to the gifts of two donors, when three devices of one donor sync at random moments, then each device ends with what a fresh download gives")
    Stream<DynamicTest> should_hold_what_a_fresh_download_gives_when_three_devices_sync_at_random_moments_given_seeded_random_changes() {
        int seeds = Optional.ofNullable(System.getenv(SEEDS_VARIABLE)).map(Integer::parseInt).orElse(DEFAULT_SEEDS);
        return IntStream.rangeClosed(1, seeds).mapToObj(seed -> DynamicTest.dynamicTest(
                "Given seed " + seed + ", when three devices sync between random changes, then each device ends with a fresh download", () -> converge(seed)));
    }

    @Test
    @DisplayName("Given a device synced before a restore from a backup, when it syncs after the restore, then the changed chunks carry other digests and the device ends with the restored rows")
    void should_download_the_restored_chunks_when_a_device_syncs_after_a_restore_given_it_synced_before() throws Exception {
        CaseRows backup = CaseRows.fromJson(json.readTree(STATE_AT_BACKUP));
        backup.write(jdbc, clock);
        UUID jana = backup.donorId("jana");
        Map<String, String> atBackup = digests(answer(jana, get(MANIFEST)));

        Instant later = clock.instant().plus(Duration.ofDays(3));
        clock.set(later);
        jdbc.sql("update donation set status = 'REFUNDED' where id = :id").param("id", backup.donationId(2)).update();
        insertManualGift(UUID.randomUUID(), jana, LocalDate.parse("2026-10-21"), 70_000);
        Device device = new Device(jana);
        device.sync();
        Map<String, String> beforeRestore = digests(device.manifest);
        assertThat(beforeRestore).as("the chunks after the changes").isNotEqualTo(atBackup);

        backup.write(jdbc, clock);
        clock.set(later);
        List<String> downloaded = device.sync();

        Map<String, String> afterRestore = digests(device.manifest);
        assertThat(afterRestore).as("the chunks after the restore are the chunks of the backup").isEqualTo(atBackup);
        assertThat(downloaded).as("the chunks the device downloads again").containsExactlyElementsOf(afterRestore.keySet().stream()
                .filter(id -> !afterRestore.get(id).equals(beforeRestore.get(id))).toList());
        assertThat(downloaded).isNotEmpty();
        assertThat(device.copy()).isEqualTo(fresh(jana).copy());
    }

    @Test
    @DisplayName("Given a donor with a thousand gifts, when the device asks for the manifest, then the backend answers within 50 ms")
    void should_answer_within_50_ms_when_the_device_asks_for_the_manifest_given_a_donor_with_a_thousand_gifts() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(TWO_DONORS));
        rows.write(jdbc, clock);
        UUID jana = rows.donorId("jana");
        Random random = new Random(20261105L);
        for (int gift = 0; gift < TIMED_DONATIONS; gift++) {
            insertManualGift(new UUID(random.nextLong(), random.nextLong()), jana, LocalDate.of(2016 + random.nextInt(11), 1 + random.nextInt(12), 1 + random.nextInt(28)),
                    100 + random.nextInt(1_000_000));
        }
        answer(jana, get(MANIFEST));
        long[] millis = new long[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            long start = System.nanoTime();
            answer(jana, get(MANIFEST));
            millis[run] = Duration.ofNanos(System.nanoTime() - start).toMillis();
        }
        Arrays.sort(millis);
        assertThat(millis[TIMED_RUNS / 2]).as("the median of %d manifests over %d gifts, in ms: %s", TIMED_RUNS, TIMED_DONATIONS, Arrays.toString(millis))
                .isLessThan(MANIFEST_BUDGET_MILLIS);
    }

    private void converge(int seed) throws Exception {
        new DatabaseCleaner(jdbc).emptyAllTables();
        CaseRows rows = CaseRows.fromJson(json.readTree(TWO_DONORS));
        rows.write(jdbc, clock);
        UUID jana = rows.donorId("jana");
        UUID petr = rows.donorId("petr");
        Random random = new Random(seed);
        List<Device> devices = IntStream.range(0, DEVICES).mapToObj(index -> new Device(jana)).toList();
        List<String> operations = new ArrayList<>();
        for (int step = 0; step < OPERATIONS; step++) {
            operations.add(change(random, jana, petr));
            for (Device device : devices) {
                if (random.nextInt(10) < 4) {
                    device.sync();
                    assertThat(device.sync()).as("a second sync right after the first, seed %d after %s", seed, operations).isEmpty();
                }
            }
        }
        Device fresh = fresh(jana);
        for (Device device : devices) {
            device.sync();
            assertThat(device.copy()).as("a device after seed %d and %s", seed, operations).isEqualTo(fresh.copy());
        }
    }

    private String change(Random random, UUID jana, UUID petr) {
        List<UUID> janasGifts = jdbc.sql("select id from donation where donor_id = :donor order by id").param("donor", jana).query(UUID.class).list();
        int kind = random.nextInt(janasGifts.isEmpty() ? 2 : 7);
        UUID id = new UUID(random.nextLong(), random.nextLong());
        LocalDate day = LocalDate.of(2024 + random.nextInt(3), 1 + random.nextInt(12), 1 + random.nextInt(28));
        long amount = 100 + random.nextInt(100_000);
        switch (kind) {
            case 0 -> insertBankGift(id, jana, day, amount, random.nextLong(1, Long.MAX_VALUE));
            case 1 -> insertManualGift(id, random.nextBoolean() ? jana : petr, day, amount);
            case 2 -> unpair(janasGifts.get(random.nextInt(janasGifts.size())));
            case 3 -> jdbc.sql("update donation set status = 'REFUNDED' where id = :id").param("id", janasGifts.get(random.nextInt(janasGifts.size()))).update();
            case 4 -> jdbc.sql("update donation set amount_minor = :amount where id = :id and source = 'MANUAL'")
                    .param("amount", amount).param("id", janasGifts.get(random.nextInt(janasGifts.size()))).update();
            case 5 -> recordBankImport();
            default -> clock.advance(Duration.ofHours(1 + random.nextInt(24 * 60)));
        }
        return switch (kind) {
            case 0 -> "a bank gift";
            case 1 -> "a gift recorded by hand";
            case 2 -> "an unpairing";
            case 3 -> "a refund";
            case 4 -> "a corrected amount";
            case 5 -> "a bank import";
            default -> "time passing";
        };
    }

    private void insertBankGift(UUID id, UUID donor, LocalDate day, long amount, long transaction) {
        UUID payment = UUID.randomUUID();
        jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                        + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                        + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) values (:id, :transaction, :booked, "
                        + ":amount, 'CZK', '2900233333', '2010', '2900233333', '2010', null, null, null, null, null, null, 'Bezhotovostní příjem', :imported, null)")
                .param("id", payment)
                .param("transaction", transaction)
                .param("booked", day)
                .param("amount", amount)
                .param("imported", Timestamp.from(clock.instant()))
                .update();
        insertGift(id, donor, Optional.of(payment), day, amount);
    }

    private void insertManualGift(UUID id, UUID donor, LocalDate day, long amount) {
        insertGift(id, donor, Optional.empty(), day, amount);
    }

    private void insertGift(UUID id, UUID donor, Optional<UUID> payment, LocalDate day, long amount) {
        jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by, "
                        + "recorded_at, sender_account_id, purpose, symbol_claim_id) values (:id, :donor, :payment, :received, :amount, 'CZK', :source, "
                        + "'RECEIVED', :pairedBy, :recorded, null, 'GENERAL', null)")
                .param("id", id)
                .param("donor", donor)
                .param("payment", payment.orElse(null))
                .param("received", day)
                .param("amount", amount)
                .param("source", payment.isPresent() ? "BANK_TRANSFER" : "MANUAL")
                .param("pairedBy", payment.isPresent() ? "VARIABLE_SYMBOL" : null)
                .param("recorded", Timestamp.from(clock.instant()))
                .update();
    }

    private void unpair(UUID donation) {
        Optional<UUID> payment = jdbc.sql("select bank_payment_id from donation where id = :id").param("id", donation).query(UUID.class).optional();
        jdbc.sql("delete from donation where id = :id").param("id", donation).update();
        payment.ifPresent(paid -> jdbc.sql("update bank_payment set unpaired_by_admin_at = :at where id = :id")
                .param("at", Timestamp.from(clock.instant())).param("id", paid).update());
    }

    private void recordBankImport() {
        jdbc.sql("insert into bank_import_state (id, last_attempted_at, last_succeeded_at, updated_at) values (1, :at, :at, :at) "
                        + "on conflict (id) do update set last_attempted_at = :at, last_succeeded_at = :at, updated_at = :at")
                .param("at", Timestamp.from(clock.instant()))
                .update();
    }

    private Device fresh(UUID donor) throws Exception {
        Device fresh = new Device(donor);
        fresh.sync();
        return fresh;
    }

    private static Map<String, String> digests(JsonNode manifest) {
        Map<String, String> digests = new TreeMap<>();
        manifest.get("chunks").forEach(chunk -> digests.put(chunk.get("id").asString(), chunk.get("rowsSha256").asString()));
        return digests;
    }

    private JsonNode answer(UUID donor, MockHttpServletRequestBuilder call) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(call.header("Accept-Language", "cs")
                        .with(jwt().jwt(token -> token.subject(donor.toString()).claims(claims -> claims.remove("scope"))).authorities(new SimpleGrantedAuthority("ROLE_DONOR"))))
                .andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }

    private final class Device {

        private final UUID donor;
        private final Map<String, JsonNode> chunks = new TreeMap<>();
        private JsonNode manifest;

        private Device(UUID donor) {
            this.donor = donor;
        }

        private List<String> sync() throws Exception {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            manifest = answer(donor, get(MANIFEST));
            Map<String, String> listed = new LinkedHashMap<>();
            manifest.get("chunks").forEach(chunk -> listed.put(chunk.get("id").asString(), chunk.get("rowsSha256").asString()));
            chunks.keySet().retainAll(listed.keySet());
            List<String> wanted = listed.entrySet().stream()
                    .filter(entry -> !chunks.containsKey(entry.getKey()) || !chunks.get(entry.getKey()).get("rowsSha256").asString().equals(entry.getValue()))
                    .map(Map.Entry::getKey)
                    .toList();
            if (!wanted.isEmpty()) {
                JsonNode bodies = answer(donor, get(CHUNKS).param("ids", String.join(",", wanted)));
                assertThat(bodies.get("missing").isEmpty()).isTrue();
                bodies.get("chunks").forEach(body -> {
                    String id = body.get("id").asString();
                    assertThat(body.get("rowsSha256").asString()).as("the chunk %s and its manifest entry", id).isEqualTo(listed.get(id));
                    assertThat(CanonicalRowsDigest.sha256(body.get("rows"))).as("the digest of the rows of %s", id).isEqualTo(listed.get(id));
                    assertThat(body.get("count").asInt()).isEqualTo(body.get("rows").size());
                    chunks.put(id, body);
                });
            }
            return wanted;
        }

        private Map<String, Object> copy() {
            Map<String, Object> copy = new LinkedHashMap<>();
            copy.put("subject", manifest.get("subject"));
            copy.put("summary", manifest.get("summary"));
            copy.put("chunks", new TreeMap<>(chunks));
            return copy;
        }
    }

    private static final String TWO_DONORS = """
            {"now": "2026-10-01T10:00:00Z",
             "donors": [{"alias": "jana", "registeredAt": "2024-01-15T10:00:00Z", "erasedAt": null},
                        {"alias": "petr", "registeredAt": "2024-01-15T10:00:00Z", "erasedAt": null}],
             "payments": [], "donations": []}
            """;

    private static final String STATE_AT_BACKUP = """
            {"now": "2026-10-20T10:00:00Z",
             "donors": [{"alias": "jana", "registeredAt": "2024-01-15T10:00:00Z", "erasedAt": null}],
             "payments": [{"alias": "p1", "bookedOn": "2025-06-30", "amountMinor": 30000, "unpairedByAdminAt": null},
                          {"alias": "p2", "bookedOn": "2026-03-15", "amountMinor": 50000, "unpairedByAdminAt": null}],
             "donations": [{"donor": "jana", "payment": "p1", "receivedOn": "2025-06-30", "amountMinor": 30000, "status": "RECEIVED", "source": "BANK_TRANSFER", "purpose": "GENERAL"},
                           {"donor": "jana", "payment": "p2", "receivedOn": "2026-03-15", "amountMinor": 50000, "status": "RECEIVED", "source": "BANK_TRANSFER", "purpose": "GENERAL"}]}
            """;
}
