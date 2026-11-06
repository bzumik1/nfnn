package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
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
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@DonationRowsContext
class DonorDeviceSyncTest {

    private static final String SEEDS_VARIABLE = "SYNC_CONVERGENCE_SEEDS";
    private static final int DEFAULT_SEEDS = 30;
    private static final int OPERATIONS = 24;
    private static final int DEVICES = 3;
    private static final int SYNC_ATTEMPTS = 3;
    private static final int TIMED_DONATIONS = 1_000;
    private static final int WARM_UP_RUNS = 5;
    private static final int TIMED_RUNS = 21;
    private static final long MANIFEST_BUDGET_MILLIS = 50;
    private static final String MANIFEST = "/api/donations/me/sync";
    private static final String CHUNKS = "/api/donations/me/sync/chunks";
    private static final List<List<String>> ACCOUNTS = List.of(List.of("2900233333", "2010"), List.of("2900244444", "0800"),
            List.of("1234567", "0800"), List.of("7654321", "0800"));
    private static final List<String> SYMBOLS = List.of("6123456789", "7012345678", "8123456780");
    private static final List<String> EXERCISED = List.of("a bank gift", "a gift recorded by hand", "a bank import", "time passing", "a linked account",
            "a symbol answer", "an unpairing", "a refund", "a corrected amount", "a gift from a linked account", "a disconnected account",
            "a reset symbol answer", "a reversed symbol answer", "meanwhile", "chunk donations", "chunk bank-accounts", "chunk symbol-claims");
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
    private DonorSyncRateLimiter syncRateLimiter;
    @Autowired
    private SymbolClaimRepository symbolClaims;

    @AfterEach
    void truncate() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @TestFactory
    @DisplayName("Given seeded random changes to the gifts, bank accounts and symbol answers of two donors, when three devices of one donor sync at random moments, some while a change lands between the manifest and the chunks, then each device ends with what a fresh download gives")
    Stream<DynamicTest> should_hold_what_a_fresh_download_gives_when_three_devices_sync_at_random_moments_given_seeded_random_changes() {
        int seeds = Optional.ofNullable(System.getenv(SEEDS_VARIABLE)).map(Integer::parseInt).orElse(DEFAULT_SEEDS);
        Set<String> exercised = new TreeSet<>();
        Stream<DynamicTest> runs = IntStream.rangeClosed(1, seeds).mapToObj(seed -> DynamicTest.dynamicTest(
                "Given seed " + seed + ", when three devices sync between random changes, then each device ends with a fresh download", () -> converge(seed, exercised)));
        return Stream.concat(runs, Stream.of(DynamicTest.dynamicTest(
                "Given every seed run, when their changes and chunks are counted, then every kind of change and of chunk was exercised, also between the manifest and the chunks",
                () -> assertThat(exercised).containsAll(EXERCISED))));
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
    @DisplayName("Given a symbol answer committed by another transaction while the backend reads the donor's rows, when it answers the manifest, then the answer holds the rows as they stood when its read began")
    void should_answer_the_rows_as_they_stood_when_the_read_began_when_the_backend_answers_the_manifest_given_a_change_committed_meanwhile() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(TWO_DONORS));
        rows.write(jdbc, clock);
        UUID jana = rows.donorId("jana");
        insertManualGift(UUID.randomUUID(), jana, LocalDate.parse("2026-03-10"), 50_000);
        SymbolClaimRepository spy = AopTestUtils.getUltimateTargetObject(symbolClaims);
        doAnswer(call -> {
            Thread meanwhile = Thread.ofPlatform().start(() -> answerSymbol(UUID.randomUUID(), jana, ACCOUNTS.getFirst(), SYMBOLS.getFirst(), "CONFIRMED"));
            meanwhile.join();
            return call.callRealMethod();
        }).when(spy).findByDonor(any(DonorReference.class));

        Map<String, String> answered = digests(answer(jana, get(MANIFEST)));

        assertThat(jdbc.sql("select count(*) from donor_symbol_claim").query(Integer.class).single()).as("the answer committed meanwhile").isEqualTo(1);
        assertThat(answered.keySet()).as("the chunks of an answer whose read began before the symbol answer").containsExactly("donations:2026");
    }

    @Test
    @DisplayName("Given bank accounts and symbol answers whose ids sort against their numbers, when the device asks for the chunks, then their rows come by account number and symbol, not by id")
    void should_list_rows_by_account_number_and_symbol_when_the_device_asks_for_the_chunks_given_ids_that_sort_against_them() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(TWO_DONORS));
        rows.write(jdbc, clock);
        UUID jana = rows.donorId("jana");
        linkAccount(new UUID(0, 2), jana, ACCOUNTS.get(2), "ACTIVE", LocalDate.parse("2026-05-01"));
        linkAccount(new UUID(0, 1), jana, ACCOUNTS.get(3), "ACTIVE", LocalDate.parse("2026-05-01"));
        answerSymbol(new UUID(0, 4), jana, ACCOUNTS.get(2), SYMBOLS.get(0), "CONFIRMED");
        answerSymbol(new UUID(0, 3), jana, ACCOUNTS.get(2), SYMBOLS.get(1), "DECLINED");

        JsonNode bodies = answer(jana, get(CHUNKS).param("ids", "bank-accounts,symbol-claims"));

        assertThat(bodies.get("chunks").get(0).get("rows").valueStream().map(row -> row.get("accountNumber").asString()).toList())
                .containsExactly("1234567/0800", "7654321/0800");
        assertThat(bodies.get("chunks").get(1).get("rows").valueStream().map(row -> row.get("variableSymbol").asString()).toList())
                .containsExactly(SYMBOLS.get(0), SYMBOLS.get(1));
    }

    @Test
    @DisplayName("Given a donor with a thousand gifts, when the device asks for the manifest, then the backend answers within 50 ms")
    void should_answer_within_50_ms_when_the_device_asks_for_the_manifest_given_a_donor_with_a_thousand_gifts() throws Exception {
        CaseRows rows = CaseRows.fromJson(json.readTree(TWO_DONORS));
        rows.write(jdbc, clock);
        UUID jana = rows.donorId("jana");
        Random random = new Random(20261105L);
        for (int gift = 0; gift < TIMED_DONATIONS; gift++) {
            LocalDate day = LocalDate.of(2016 + random.nextInt(11), 1 + random.nextInt(12), 1 + random.nextInt(28));
            UUID id = new UUID(random.nextLong(), random.nextLong());
            if (random.nextBoolean()) {
                insertBankGift(id, jana, day, 100 + random.nextInt(1_000_000), random.nextLong(1, Long.MAX_VALUE));
            } else {
                insertManualGift(id, jana, day, 100 + random.nextInt(1_000_000));
            }
        }
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            RateLimiterWindows.reset(List.of(syncRateLimiter));
            answer(jana, get(MANIFEST));
        }
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

    private void converge(int seed, Set<String> exercised) throws Exception {
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
                    if (random.nextInt(4) == 0) {
                        device.sync(() -> operations.add("meanwhile " + change(random, jana, petr)));
                    } else {
                        device.sync();
                        assertThat(device.sync()).as("a second sync right after the first, seed %d after %s", seed, operations).isEmpty();
                    }
                }
            }
        }
        Device fresh = fresh(jana);
        for (Device device : devices) {
            device.sync();
            assertThat(device.copy()).as("a device after seed %d and %s", seed, operations).isEqualTo(fresh.copy());
        }
        operations.forEach(operation -> exercised.add(operation.startsWith("meanwhile ") ? "meanwhile" : operation));
        digests(fresh.manifest).keySet().forEach(id -> exercised.add("chunk " + id.split(":")[0]));
    }

    private String change(Random random, UUID jana, UUID petr) {
        List<UUID> gifts = idsOf("select id from donation where donor_id = :donor order by id", jana);
        List<UUID> links = idsOf("select id from donor_sender_account where donor_id = :donor and status <> 'DISCONNECTED' order by id", jana);
        List<UUID> declined = idsOf("select id from donor_symbol_claim where donor_id = :donor and answer = 'DECLINED' order by id", jana);
        List<UUID> confirmed = idsOf("select id from donor_symbol_claim where donor_id = :donor and answer = 'CONFIRMED' order by id", jana);
        List<String> possible = new ArrayList<>(List.of("a bank gift", "a gift recorded by hand", "a bank import", "time passing", "a linked account",
                "a symbol answer"));
        if (!gifts.isEmpty()) {
            possible.addAll(List.of("an unpairing", "a refund", "a corrected amount", "a gift from a linked account"));
        }
        if (!links.isEmpty()) {
            possible.add("a disconnected account");
        }
        if (!declined.isEmpty()) {
            possible.add("a reset symbol answer");
        }
        if (!confirmed.isEmpty()) {
            possible.add("a reversed symbol answer");
        }
        String operation = possible.get(random.nextInt(possible.size()));
        UUID id = new UUID(random.nextLong(), random.nextLong());
        LocalDate day = LocalDate.of(2024 + random.nextInt(3), 1 + random.nextInt(12), 1 + random.nextInt(28));
        long amount = 100 + random.nextInt(100_000);
        List<String> account = ACCOUNTS.get(random.nextInt(ACCOUNTS.size()));
        switch (operation) {
            case "a bank gift" -> insertBankGift(id, jana, day, amount, random.nextLong(1, Long.MAX_VALUE));
            case "a gift recorded by hand" -> insertManualGift(id, random.nextBoolean() ? jana : petr, day, amount);
            case "a bank import" -> recordBankImport();
            case "time passing" -> clock.advance(Duration.ofHours(1 + random.nextInt(24 * 60)));
            case "a linked account" -> linkAccount(id, random.nextBoolean() ? jana : petr, account, random.nextBoolean() ? "ACTIVE" : "AWAITING_PAYMENT", day);
            case "a symbol answer" -> answerSymbol(id, jana, account, SYMBOLS.get(random.nextInt(SYMBOLS.size())), random.nextBoolean() ? "CONFIRMED" : "DECLINED");
            case "an unpairing" -> unpair(pick(random, gifts));
            case "a refund" -> jdbc.sql("update donation set status = 'REFUNDED' where id = :id").param("id", pick(random, gifts)).update();
            case "a corrected amount" -> jdbc.sql("update donation set amount_minor = :amount where id = :id and source = 'MANUAL'")
                    .param("amount", amount).param("id", pick(random, gifts)).update();
            case "a gift from a linked account" -> pointAtLinkAndClaim(pick(random, gifts), jana, random);
            case "a disconnected account" -> jdbc.sql("update donor_sender_account set status = 'DISCONNECTED', valid_to = greatest(coalesce(valid_from, :day), :day), disconnected_at = :at where id = :id")
                    .param("day", LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE)).param("at", Timestamp.from(clock.instant())).param("id", pick(random, links)).update();
            case "a reset symbol answer" -> jdbc.sql("delete from donor_symbol_claim where id = :id").param("id", pick(random, declined)).update();
            case "a reversed symbol answer" -> reverseSymbolAnswer(pick(random, confirmed));
            default -> throw new IllegalStateException("Unknown operation " + operation);
        }
        return operation;
    }

    private void reverseSymbolAnswer(UUID claim) {
        jdbc.sql("delete from donation where symbol_claim_id = :claim").param("claim", claim).update();
        jdbc.sql("update donor_symbol_claim set answer = 'DECLINED', answered_at = :at where id = :claim")
                .param("at", Timestamp.from(clock.instant())).param("claim", claim).update();
    }

    private static UUID pick(Random random, List<UUID> ids) {
        return ids.get(random.nextInt(ids.size()));
    }

    private List<UUID> idsOf(String query, UUID donor) {
        return jdbc.sql(query).param("donor", donor).query(UUID.class).list();
    }

    private void linkAccount(UUID id, UUID donor, List<String> account, String status, LocalDate from) {
        Optional<UUID> proof = status.equals("ACTIVE") ? Optional.of(insertPayment(account, from, 100, Math.abs(id.getLeastSignificantBits()) + 1)) : Optional.empty();
        jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, valid_to, "
                        + "created_at, disconnected_at) values (:id, :donor, :number, :bank, :proof, :provedAt, :status, :from, null, :created, null) on conflict do nothing")
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

    private void pointAtLinkAndClaim(UUID gift, UUID donor, Random random) {
        List<UUID> links = idsOf("select id from donor_sender_account where donor_id = :donor order by id", donor);
        List<UUID> confirmed = idsOf("select id from donor_symbol_claim where donor_id = :donor and answer = 'CONFIRMED' order by id", donor);
        if (links.isEmpty()) {
            return;
        }
        boolean bySymbol = !confirmed.isEmpty() && random.nextBoolean();
        jdbc.sql("update donation set paired_by = :pairedBy, sender_account_id = :link, symbol_claim_id = :claim where id = :id and source = 'BANK_TRANSFER'")
                .param("pairedBy", bySymbol ? "CONFIRMED_SYMBOL" : "SENDER_ACCOUNT")
                .param("link", pick(random, links))
                .param("claim", bySymbol ? pick(random, confirmed) : null)
                .param("id", gift)
                .update();
    }

    private void answerSymbol(UUID id, UUID donor, List<String> account, String symbol, String answer) {
        jdbc.sql("insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at) "
                        + "values (:id, :donor, :number, :bank, :symbol, :answer, :at) on conflict do nothing")
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
                        + ":amount, 'CZK', :number, :bank, :number, :bank, null, null, null, null, null, null, 'Bezhotovostní příjem', :imported, null)")
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
            return sync(NOTHING_MEANWHILE);
        }

        private List<String> sync(Runnable meanwhile) throws Exception {
            List<String> downloaded = new ArrayList<>();
            Runnable beforeChunks = meanwhile;
            for (int attempt = 0; attempt < SYNC_ATTEMPTS; attempt++) {
                RateLimiterWindows.reset(List.of(syncRateLimiter));
                manifest = answer(donor, get(MANIFEST));
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
                JsonNode bodies = answer(donor, get(CHUNKS).param("ids", String.join(",", wanted)));
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
            throw new AssertionError("The device found its copy changed meanwhile in " + SYNC_ATTEMPTS + " syncs in a row");
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
