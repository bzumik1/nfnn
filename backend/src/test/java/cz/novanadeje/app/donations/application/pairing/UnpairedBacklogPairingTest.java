package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.support.DatabaseCleaner;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class UnpairedBacklogPairingTest {

    private static final Instant NOW = Instant.parse("2026-11-06T07:00:00Z");
    private static final int PAYMENTS = 20_000;
    private static final int SENDER_ACCOUNTS = 4_001;
    private static final int UNKNOWN_SYMBOLS = 3_001;
    private static final int SHARED_ACCOUNTS = 100;
    private static final int WARM_UP_RUNS = 1;
    private static final int TIMED_RUNS = 3;
    private static final long STATEMENTS_PER_PAIRING = 1 + 1 + UNKNOWN_SYMBOLS + SENDER_ACCOUNTS + 2L * SHARED_ACCOUNTS + 1;
    private static final long MANAGED_ENTITIES_BUDGET = 2L * 2 * SHARED_ACCOUNTS;
    private static final long PAIRING_CPU_BUDGET_MILLIS = 5_000;

    @Autowired
    private PaymentPairingService pairing;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Statistics statistics;

    @BeforeEach
    void startFromEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
    }

    @AfterEach
    void leaveEmptyTables() {
        statistics.setStatisticsEnabled(false);
        statistics.clear();
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given twenty thousand unpaired payments from four thousand senders, half of them with one of three thousand symbols nobody has, and a hundred accounts two donors share, when the import pairs the unpaired payments, then it leaves them all unpaired with one statement per symbol and account it looks up, at most four hundred entities held and within 5 s of CPU time")
    void should_leave_the_backlog_unpaired_with_counted_statements_entities_and_cpu_when_the_import_pairs_given_twenty_thousand_unpairable_payments() {
        storeUnpairableBacklog();
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            assertThat(pairing.pairUnpaired(NOW)).isEqualTo(new PairingOutcome(0, 0, 0, 0, PAYMENTS));
        }
        Measured[] runs = new Measured[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            runs[run] = measuredPairing();
            assertThat(runs[run].outcome()).isEqualTo(new PairingOutcome(0, 0, 0, 0, PAYMENTS));
        }
        long[] cpuMillis = Arrays.stream(runs).mapToLong(Measured::cpuMillis).sorted().toArray();
        long[] wallMillis = Arrays.stream(runs).mapToLong(Measured::wallMillis).sorted().toArray();
        String measured = "%d pairings over %d unpaired payments, CPU of the calling thread in ms: %s, wall time in ms: %s"
                .formatted(TIMED_RUNS, PAYMENTS, Arrays.toString(cpuMillis), Arrays.toString(wallMillis));
        assertThat(runs).as(measured).allSatisfy(run -> {
            assertThat(run.statements()).as("statements of one pairing").isEqualTo(STATEMENTS_PER_PAIRING);
            assertThat(run.managedEntities()).as("entities the persistence context holds at the end of a pairing").isLessThanOrEqualTo(MANAGED_ENTITIES_BUDGET);
        });
        assertThat(cpuMillis[0]).as("the fastest of %s", measured).isLessThan(PAIRING_CPU_BUDGET_MILLIS);
        assertThat(jdbc.sql("select count(*) from donation").query(Long.class).single()).isZero();
    }

    private Measured measuredPairing() {
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        statistics.clear();
        long cpuStart = threads.getCurrentThreadCpuTime();
        long wallStart = System.nanoTime();
        Measured measured = transactions.execute(status -> {
            PairingOutcome outcome = pairing.pairUnpaired(NOW);
            long managedEntities = entityManager.unwrap(Session.class).getStatistics().getEntityCount();
            return new Measured(outcome, statistics.getPrepareStatementCount(), managedEntities, 0, 0);
        });
        return new Measured(measured.outcome(), measured.statements(), measured.managedEntities(),
                Duration.ofNanos(threads.getCurrentThreadCpuTime() - cpuStart).toMillis(), Duration.ofNanos(System.nanoTime() - wallStart).toMillis());
    }

    private void storeUnpairableBacklog() {
        jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                        + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                        + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) "
                        + "select gen_random_uuid(), n, date '2020-01-01' + n % 2000, 10000 + n, 'CZK', "
                        + "case when n % 10 = 0 then null else (100000 + n * 7 % :accounts)::text end, case when n % 10 = 0 then null else '0800' end, "
                        + "null, null, null, "
                        + "case when n % 2 = 0 then (1000000000 + n * 13 % :symbols)::text end, case when n % 2 = 0 then (1000000000 + n * 13 % :symbols)::text end, "
                        + "null, null, null, 'Bezhotovostní příjem', :imported, null from generate_series(1, :payments) n")
                .param("accounts", SENDER_ACCOUNTS)
                .param("symbols", UNKNOWN_SYMBOLS)
                .param("payments", PAYMENTS)
                .param("imported", Timestamp.from(NOW))
                .update();
        jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, "
                        + "registered_at, updated_at, erased_at) select gen_random_uuid(), 'PERSON', 'Dárce', null, 'Dlouhá 12', 'Ústí nad Labem', "
                        + "'400 01', (9000000000 + n)::text, 'cs', :at, :at, null from generate_series(0, :donors - 1) n")
                .param("donors", 2 * SHARED_ACCOUNTS)
                .param("at", Timestamp.from(NOW))
                .update();
        jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, "
                        + "valid_to, created_at, disconnected_at) "
                        + "select gen_random_uuid(), d.donor_id, (100000 + (d.variable_symbol::bigint - 9000000000) % :shared)::text, '0800', "
                        + "(select p.id from bank_payment p where p.sender_account_number = (100000 + (d.variable_symbol::bigint - 9000000000) % :shared)::text "
                        + "and p.matching_variable_symbol is null order by p.bank_transaction_id limit 1), :at, 'ACTIVE', null, null, :at, null "
                        + "from donor_record d")
                .param("shared", SHARED_ACCOUNTS)
                .param("at", Timestamp.from(NOW))
                .update();
    }

    private record Measured(PairingOutcome outcome, long statements, long managedEntities, long cpuMillis, long wallMillis) {
    }
}
