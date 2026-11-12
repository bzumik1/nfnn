package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

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
    private static final long PAIRING_BUDGET_MILLIS = 5_000;

    @Autowired
    private PaymentPairingService pairing;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void startFromEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void leaveEmptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given twenty thousand unpaired payments from four thousand senders, half of them with one of three thousand symbols nobody has, and a hundred accounts two donors share, when the import pairs the unpaired payments, then it leaves them all unpaired within 5 s")
    void should_leave_the_backlog_unpaired_within_5_s_when_the_import_pairs_given_twenty_thousand_unpairable_payments() {
        storeUnpairableBacklog();
        for (int run = 0; run < WARM_UP_RUNS; run++) {
            assertThat(pairing.pairUnpaired(NOW)).isEqualTo(new PairingOutcome(0, 0, 0, 0, PAYMENTS));
        }
        long[] millis = new long[TIMED_RUNS];
        for (int run = 0; run < TIMED_RUNS; run++) {
            long start = System.nanoTime();
            PairingOutcome outcome = pairing.pairUnpaired(NOW);
            millis[run] = Duration.ofNanos(System.nanoTime() - start).toMillis();
            assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, PAYMENTS));
        }
        Arrays.sort(millis);
        assertThat(millis[0]).as("the fastest of %d pairings over %d unpaired payments, in ms: %s", TIMED_RUNS, PAYMENTS, Arrays.toString(millis))
                .isLessThan(PAIRING_BUDGET_MILLIS);
        assertThat(jdbc.sql("select count(*) from donation").query(Long.class).single()).isZero();
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
}
