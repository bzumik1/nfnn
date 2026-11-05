package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import cz.novanadeje.app.sharedcases.CaseRows;
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
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
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
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@DonationRowsContext
class AdminDeviceSyncTest {

    private static final String SEEDS_VARIABLE = "SYNC_CONVERGENCE_SEEDS";
    private static final int DEFAULT_SEEDS = 30;
    private static final int OPERATIONS = 24;
    private static final int DEVICES = 3;
    private static final int SYNC_ATTEMPTS = 3;
    private static final int TIMED_DONORS = 200;
    private static final int TIMED_DONATIONS = 1_000;
    private static final int WARM_UP_RUNS = 5;
    private static final int TIMED_RUNS = 21;
    private static final long MANIFEST_BUDGET_MILLIS = 50;
    private static final String MANIFEST = "/api/admin/donations/sync";
    private static final String CHUNKS = "/api/admin/donations/sync/chunks";
    private static final List<List<String>> ACCOUNTS = List.of(List.of("2900233333", "2010"), List.of("2900244444", "0800"),
            List.of("1234567", "0800"), List.of("7654321", "0800"));
    private static final List<String> SYMBOLS = List.of("6123456789", "7012345678", "8123456780");
    private static final Runnable NOTHING_MEANWHILE = () -> {
    };

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;
    @Autowired
    private AdminDonationsSyncRateLimiter syncRateLimiter;
    @Autowired
    private SymbolClaimRepository symbolClaims;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @TestFactory
    @DisplayName("Given seeded random changes to the payments, gifts, donor records, bank accounts and symbol answers of three donors, when three administration devices sync at random moments, some while a change lands between the manifest and the chunks, then each device ends with what a fresh download gives")
    Stream<DynamicTest> should_hold_what_a_fresh_download_gives_when_three_administration_devices_sync_at_random_moments_given_seeded_random_changes() {
        int seeds = Optional.ofNullable(System.getenv(SEEDS_VARIABLE)).map(Integer::parseInt).orElse(DEFAULT_SEEDS);
        return IntStream.rangeClosed(1, seeds).mapToObj(seed -> DynamicTest.dynamicTest(
                "Given seed " + seed + ", when three administration devices sync between random changes, then each device ends with a fresh download",
                () -> converge(seed)));
    }

    @Test
    @DisplayName("Given a symbol answer committed by another transaction while the backend reads the administration's rows, when it answers the manifest, then the answer holds the rows as they stood when its read began")
    void should_answer_the_rows_as_they_stood_when_the_read_began_when_the_backend_answers_the_manifest_given_a_change_committed_meanwhile() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(THREE_DONORS));
        rows.write(jdbc, clock);
        rows.writeAdministrator(jdbc);
        UUID jana = rows.donorId("jana");
        SymbolClaimRepository spy = AopTestUtils.getUltimateTargetObject(symbolClaims);
        doAnswer(call -> {
            Thread meanwhile = Thread.ofPlatform().start(() -> answerSymbol(UUID.randomUUID(), jana, ACCOUNTS.getFirst(), SYMBOLS.getFirst(), "CONFIRMED"));
            meanwhile.join();
            return call.callRealMethod();
        }).when(spy).findAllNewestFirst();

        Map<String, String> answered = digests(answer(get(MANIFEST)));

        assertThat(jdbc.sql("select count(*) from donor_symbol_claim").query(Integer.class).single()).as("the answer committed meanwhile").isEqualTo(1);
        assertThat(answered.keySet()).as("the chunks of an answer whose read began before the symbol answer").doesNotContain("symbol-claims");
    }

    @Test
    @DisplayName("Given two hundred donors with a thousand gifts and payments, when an administration device asks for the manifest, then the backend answers within 50 ms")
    void should_answer_within_50_ms_when_an_administration_device_asks_for_the_manifest_given_a_thousand_gifts() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(THREE_DONORS));
        rows.write(jdbc, clock);
        rows.writeAdministrator(jdbc);
        Random random = new Random(20261105L);
        List<UUID> donors = new ArrayList<>();
        for (int donor = 0; donor < TIMED_DONORS; donor++) {
            donors.add(insertDonorRecord(new UUID(random.nextLong(), random.nextLong()), 5_000_000_000L + donor));
        }
        for (int gift = 0; gift < TIMED_DONATIONS; gift++) {
            LocalDate day = LocalDate.of(2016 + random.nextInt(11), 1 + random.nextInt(12), 1 + random.nextInt(28));
            UUID id = new UUID(random.nextLong(), random.nextLong());
            UUID donor = donors.get(random.nextInt(donors.size()));
            if (random.nextInt(4) == 0) {
                insertPayment(ACCOUNTS.get(random.nextInt(ACCOUNTS.size())), day, 100 + random.nextInt(1_000_000), random.nextLong(1, Long.MAX_VALUE));
            } else if (random.nextBoolean()) {
                insertBankGift(id, donor, day, 100 + random.nextInt(1_000_000), random.nextLong(1, Long.MAX_VALUE));
            } else {
                insertManualGift(id, donor, day, 100 + random.nextInt(1_000_000));
            }
        }
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            answer(get(MANIFEST));
        }
        long[] millis = new long[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            long start = System.nanoTime();
            answer(get(MANIFEST));
            millis[run] = Duration.ofNanos(System.nanoTime() - start).toMillis();
        }
        Arrays.sort(millis);
        assertThat(millis[TIMED_RUNS / 2]).as("the median of %d manifests over %d donors and %d gifts and payments, in ms: %s", TIMED_RUNS, TIMED_DONORS,
                TIMED_DONATIONS, Arrays.toString(millis)).isLessThan(MANIFEST_BUDGET_MILLIS);
    }

    private void converge(int seed) throws Exception {
        new DatabaseCleaner(jdbc).emptyAllTables();
        CaseRows rows = CaseRows.fromJson(json.readTree(THREE_DONORS));
        rows.write(jdbc, clock);
        rows.writeAdministrator(jdbc);
        List<UUID> donors = List.of(rows.donorId("jana"), rows.donorId("petr"), rows.donorId("eva"));
        Random random = new Random(seed);
        List<Device> devices = IntStream.range(0, DEVICES).mapToObj(index -> new Device()).toList();
        List<String> operations = new ArrayList<>();
        for (int step = 0; step < OPERATIONS; step++) {
            operations.add(change(random, donors));
            for (Device device : devices) {
                if (random.nextInt(10) < 4) {
                    if (random.nextInt(4) == 0) {
                        device.sync(() -> operations.add("meanwhile " + change(random, donors)));
                    } else {
                        device.sync();
                        assertThat(device.sync()).as("a second sync right after the first, seed %d after %s", seed, operations).isEmpty();
                    }
                }
            }
        }
        Device fresh = new Device();
        fresh.sync();
        for (Device device : devices) {
            device.sync();
            assertThat(device.copy()).as("a device after seed %d and %s", seed, operations).isEqualTo(fresh.copy());
        }
    }

    private String change(Random random, List<UUID> donors) {
        List<UUID> gifts = jdbc.sql("select id from donation order by id").query(UUID.class).list();
        List<UUID> links = jdbc.sql("select id from donor_sender_account where status <> 'DISCONNECTED' order by id").query(UUID.class).list();
        List<UUID> claims = jdbc.sql("select id from donor_symbol_claim order by id").query(UUID.class).list();
        List<UUID> living = jdbc.sql("select donor_id from donor_record where erased_at is null order by donor_id").query(UUID.class).list();
        List<String> possible = new ArrayList<>(List.of("a bank gift", "a gift recorded by hand", "an unpaired payment", "a bank import", "time passing",
                "a linked account", "a symbol answer", "a changed profile"));
        if (!gifts.isEmpty()) {
            possible.addAll(List.of("an unpairing", "a refund", "a corrected amount"));
        }
        if (!links.isEmpty()) {
            possible.add("a disconnected account");
        }
        if (!claims.isEmpty()) {
            possible.add("a reset symbol answer");
        }
        if (living.size() > 1) {
            possible.add("an erasure");
        }
        String operation = possible.get(random.nextInt(possible.size()));
        UUID id = new UUID(random.nextLong(), random.nextLong());
        UUID donor = donors.get(random.nextInt(donors.size()));
        LocalDate day = LocalDate.of(2024 + random.nextInt(3), 1 + random.nextInt(12), 1 + random.nextInt(28));
        long amount = 100 + random.nextInt(100_000);
        List<String> account = ACCOUNTS.get(random.nextInt(ACCOUNTS.size()));
        switch (operation) {
            case "a bank gift" -> insertBankGift(id, donor, day, amount, random.nextLong(1, Long.MAX_VALUE));
            case "a gift recorded by hand" -> insertManualGift(id, donor, day, amount);
            case "an unpaired payment" -> insertPayment(account, day, amount, random.nextLong(1, Long.MAX_VALUE));
            case "a bank import" -> recordBankImport();
            case "time passing" -> clock.advance(Duration.ofHours(1 + random.nextInt(24 * 60)));
            case "a linked account" -> linkAccount(id, donor, account, random.nextBoolean() ? "ACTIVE" : "AWAITING_PAYMENT", day);
            case "a symbol answer" -> answerSymbol(id, donor, account, SYMBOLS.get(random.nextInt(SYMBOLS.size())), random.nextBoolean() ? "CONFIRMED" : "DECLINED");
            case "a changed profile" -> jdbc.sql("update donor_record set street = :street, updated_at = :at where donor_id = :donor and erased_at is null")
                    .param("street", "Nová " + (1 + random.nextInt(99))).param("at", Timestamp.from(clock.instant())).param("donor", donor).update();
            case "an unpairing" -> unpair(pick(random, gifts));
            case "a refund" -> jdbc.sql("update donation set status = 'REFUNDED' where id = :id").param("id", pick(random, gifts)).update();
            case "a corrected amount" -> jdbc.sql("update donation set amount_minor = :amount where id = :id and source = 'MANUAL'")
                    .param("amount", amount).param("id", pick(random, gifts)).update();
            case "a disconnected account" -> jdbc.sql("update donor_sender_account set status = 'DISCONNECTED', valid_to = greatest(coalesce(valid_from, :day), :day), disconnected_at = :at where id = :id")
                    .param("day", LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE)).param("at", Timestamp.from(clock.instant())).param("id", pick(random, links)).update();
            case "a reset symbol answer" -> jdbc.sql("delete from donor_symbol_claim where id = :id").param("id", pick(random, claims)).update();
            case "an erasure" -> erase(pick(random, living));
            default -> throw new IllegalStateException("Unknown operation " + operation);
        }
        return operation;
    }

    private void erase(UUID donor) {
        jdbc.sql("update donation set sender_account_id = null, symbol_claim_id = null where donor_id = :donor").param("donor", donor).update();
        jdbc.sql("delete from donor_sender_account where donor_id = :donor").param("donor", donor).update();
        jdbc.sql("delete from donor_symbol_claim where donor_id = :donor").param("donor", donor).update();
        jdbc.sql("update donor_record set name = 'Vymazaný dárce', street = 'Vymazáno', city = 'Vymazáno', postal_code = 'Vymazáno', erased_at = :at, "
                        + "updated_at = :at where donor_id = :donor")
                .param("at", Timestamp.from(clock.instant())).param("donor", donor).update();
    }

    private static UUID pick(Random random, List<UUID> ids) {
        return ids.get(random.nextInt(ids.size()));
    }

    private UUID insertDonorRecord(UUID id, long symbol) {
        jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, "
                        + "registered_at, updated_at, erased_at) values (:id, 'PERSON', 'Dárce', null, 'Dlouhá 12', 'Ústí nad Labem', '400 01', :symbol, "
                        + "'cs', :at, :at, null)")
                .param("id", id)
                .param("symbol", Long.toString(symbol))
                .param("at", Timestamp.from(clock.instant()))
                .update();
        return id;
    }

    private void linkAccount(UUID id, UUID donor, List<String> account, String status, LocalDate from) {
        Optional<UUID> proof = status.equals("ACTIVE") ? Optional.of(insertPayment(account, from, 100, Math.abs(id.getLeastSignificantBits()) + 1)) : Optional.empty();
        jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, valid_to, "
                        + "created_at, disconnected_at) select :id, :donor, :number, :bank, :proof, :provedAt, :status, :from, null, :created, null "
                        + "where exists (select 1 from donor_record where donor_id = :donor and erased_at is null) on conflict do nothing")
                .param("id", id)
                .param("donor", donor)
                .param("number", account.get(0))
                .param("bank", account.get(1))
                .param("proof", proof.orElse(null))
                .param("provedAt", proof.map(ignored -> Timestamp.from(clock.instant())).orElse(null))
                .param("status", status)
                .param("from", from)
                .param("created", Timestamp.from(clock.instant()))
                .update();
    }

    private void answerSymbol(UUID id, UUID donor, List<String> account, String symbol, String answer) {
        jdbc.sql("insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at) "
                        + "select :id, :donor, :number, :bank, :symbol, :answer, :at "
                        + "where exists (select 1 from donor_record where donor_id = :donor and erased_at is null) on conflict do nothing")
                .param("id", id)
                .param("donor", donor)
                .param("number", account.get(0))
                .param("bank", account.get(1))
                .param("symbol", symbol)
                .param("answer", answer)
                .param("at", Timestamp.from(clock.instant()))
                .update();
    }

    private void insertBankGift(UUID id, UUID donor, LocalDate day, long amount, long transaction) {
        insertGift(id, donor, Optional.of(insertPayment(ACCOUNTS.getFirst(), day, amount, transaction)), day, amount);
    }

    private UUID insertPayment(List<String> account, LocalDate day, long amount, long transaction) {
        UUID payment = UUID.randomUUID();
        jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                        + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                        + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) values (:id, :transaction, :booked, "
                        + ":amount, 'CZK', :number, :bank, :number, :bank, null, null, null, null, null, null, 'Bezhotovostní příjem', :imported, null) "
                        + "on conflict do nothing")
                .param("id", payment)
                .param("transaction", transaction)
                .param("booked", day)
                .param("amount", amount)
                .param("number", account.get(0))
                .param("bank", account.get(1))
                .param("imported", Timestamp.from(clock.instant()))
                .update();
        return payment;
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

    private static Map<String, String> digests(JsonNode manifest) {
        Map<String, String> digests = new TreeMap<>();
        manifest.get("chunks").forEach(chunk -> digests.put(chunk.get("id").asString(), chunk.get("rowsSha256").asString()));
        return digests;
    }

    private JsonNode answer(MockHttpServletRequestBuilder call) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(call.header("Accept-Language", "cs")
                        .with(jwt().jwt(token -> token.subject(CaseRows.administratorId().toString()).claims(claims -> claims.remove("scope")))
                                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andReturn().getResponse();
        assertThat(response.getStatus()).as(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }

    private final class Device {

        private final Map<String, JsonNode> chunks = new TreeMap<>();
        private JsonNode manifest;

        private List<String> sync() throws Exception {
            return sync(NOTHING_MEANWHILE);
        }

        private List<String> sync(Runnable meanwhile) throws Exception {
            List<String> downloaded = new ArrayList<>();
            Runnable beforeChunks = meanwhile;
            for (int attempt = 0; attempt < SYNC_ATTEMPTS; attempt++) {
                RateLimiterWindows.reset(List.of(syncRateLimiter));
                manifest = answer(get(MANIFEST));
                assertThat(manifest.get("administrator").asBoolean()).isTrue();
                Map<String, String> listed = new LinkedHashMap<>();
                manifest.get("chunks").forEach(chunk -> listed.put(chunk.get("id").asString(), chunk.get("rowsSha256").asString()));
                chunks.keySet().retainAll(listed.keySet());
                List<String> wanted = listed.entrySet().stream()
                        .filter(entry -> !chunks.containsKey(entry.getKey()) || !chunks.get(entry.getKey()).get("rowsSha256").asString().equals(entry.getValue()))
                        .map(Map.Entry::getKey)
                        .toList();
                if (wanted.isEmpty()) {
                    return downloaded;
                }
                beforeChunks.run();
                beforeChunks = NOTHING_MEANWHILE;
                JsonNode bodies = answer(get(CHUNKS).param("ids", String.join(",", wanted)));
                boolean asListed = bodies.get("missing").isEmpty() && bodies.get("summary").equals(manifest.get("summary"));
                for (JsonNode body : bodies.get("chunks")) {
                    String id = body.get("id").asString();
                    assertThat(CanonicalRows.sha256(body.get("rows"))).as("the digest of the rows of %s", id).isEqualTo(body.get("rowsSha256").asString());
                    assertThat(body.get("count").asInt()).isEqualTo(body.get("rows").size());
                    chunks.put(id, body);
                    downloaded.add(id);
                    asListed = asListed && body.get("rowsSha256").asString().equals(listed.get(id));
                }
                if (asListed) {
                    return downloaded;
                }
            }
            throw new AssertionError("The administration device found its copy changed meanwhile in " + SYNC_ATTEMPTS + " syncs in a row");
        }

        private Map<String, Object> copy() {
            Map<String, Object> copy = new LinkedHashMap<>();
            copy.put("subject", manifest.get("subject"));
            copy.put("summary", manifest.get("summary"));
            copy.put("chunks", new TreeMap<>(chunks));
            return copy;
        }
    }

    private static final String THREE_DONORS = """
            {"now": "2026-10-01T10:00:00Z",
             "donors": [{"alias": "jana", "registeredAt": "2024-01-15T10:00:00Z", "erasedAt": null},
                        {"alias": "petr", "registeredAt": "2024-03-02T10:00:00Z", "erasedAt": null},
                        {"alias": "eva", "registeredAt": "2025-06-30T22:30:00Z", "erasedAt": null}],
             "payments": [], "donations": []}
            """;
}
