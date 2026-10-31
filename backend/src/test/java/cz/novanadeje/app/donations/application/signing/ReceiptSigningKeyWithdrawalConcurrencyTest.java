package cz.novanadeje.app.donations.application.signing;

import com.zaxxer.hikari.HikariDataSource;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyAlreadyWithdrawn;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyWithdrawalPaused;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.DomainException;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.ServerReceiptSigningKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class ReceiptSigningKeyWithdrawalConcurrencyTest {

    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final ReceiptSigningKeyId EARLIER = ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY);
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final UUID OTHER_ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a002");
    private static final TotpSecret ADMIN_SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final TotpSecret OTHER_ADMIN_SECRET = new TotpSecret("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
    private static final String REJECTED_CODE = "donors/second-factor-code-rejected";
    private static final Duration WELL_WITHIN_THE_POOL_TIMEOUT = Duration.ofSeconds(15);

    @Autowired
    private ReceiptSigningKeyWithdrawal withdrawal;
    @Autowired
    private FreshSecondFactor freshSecondFactor;
    @Autowired
    private ReceiptSigningKeyRepository keys;
    @Autowired
    private Clock clock;
    @Autowired
    private RecordSeals seals;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private ApplicationContext context;

    @BeforeEach
    void anEarlierKeySealedHereAndTwoAdministratorsWithSecondFactors() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> keys.save(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY,
                Instant.parse("2026-11-01T07:00:00Z"), content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content))));
        administratorWithSecondFactor(ADMIN, "spravce@example.cz", "4821937560", ADMIN_SECRET);
        administratorWithSecondFactor(OTHER_ADMIN, "spravkyne@example.cz", "4821937561", OTHER_ADMIN_SECRET);
    }

    @Test
    @DisplayName("Given another administrator's withdrawal holding the row of a key, when an administrator withdraws the same key with an accepted code, then the withdrawal waits for it and answers that the key is already withdrawn, auditing nothing")
    void should_wait_for_the_other_and_refuse_as_already_withdrawn_when_withdrawn_given_another_administrators_withdrawal_holding_the_row() throws Exception {
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> other = callers.submit(() -> holdTheRow(rowHeld, release, Optional.of(OTHER_ADMIN), true));
            awaitHeld(rowHeld, other);

            Future<WithdrawnReceiptSigningKey> second = callers.submit(() -> withdrawal.withdraw(ADMIN, EARLIER, codeOf(ADMIN_SECRET)));
            Thread.sleep(500);
            boolean waited = !second.isDone();
            release.countDown();
            other.get(30, TimeUnit.SECONDS);

            assertThat(waited).as("the second withdrawal waits while the other holds the row").isTrue();
            assertThatThrownBy(() -> second.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOf(ReceiptSigningKeyAlreadyWithdrawn.class);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(auditedWithdrawalEntries()).isZero();
    }

    @Test
    @DisplayName("Given the administrator's own withdrawal that used their code and holds the row of a key, when they withdraw the same key with the same code at once, then the second waits for the first and answers that the key is already withdrawn, recording no refusal")
    void should_refuse_as_already_withdrawn_without_a_refusal_when_withdrawn_given_the_same_administrators_withdrawal_with_the_same_code() throws Exception {
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = callers.submit(() -> holdTheRow(rowHeld, release, Optional.of(ADMIN), true));
            awaitHeld(rowHeld, first);

            Future<WithdrawnReceiptSigningKey> second = callers.submit(() -> withdrawal.withdraw(ADMIN, EARLIER, codeOf(ADMIN_SECRET)));
            Thread.sleep(500);
            boolean waited = !second.isDone();
            release.countDown();
            first.get(30, TimeUnit.SECONDS);

            assertThat(waited).as("the second withdrawal waits while the first holds the code and the row").isTrue();
            assertThatThrownBy(() -> second.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOf(ReceiptSigningKeyAlreadyWithdrawn.class);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(auditedWithdrawalEntries()).isZero();
    }

    @Test
    @DisplayName("Given another withdrawal holding the row of a key, when an administrator withdraws the same key with a refused code, then the refusal is audited at once without waiting for the row")
    void should_audit_the_refusal_without_waiting_when_withdrawn_given_a_withdrawal_holding_the_row_and_a_refused_code() throws Exception {
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> other = callers.submit(() -> holdTheRow(rowHeld, release, Optional.empty(), false));
            awaitHeld(rowHeld, other);

            Future<WithdrawnReceiptSigningKey> refused = callers.submit(() -> withdrawal.withdraw(ADMIN, EARLIER, wrongCodeOf(ADMIN_SECRET)));

            assertThatThrownBy(() -> refused.get(10, TimeUnit.SECONDS)).as("the refused withdrawal answers while the other still holds the row")
                    .isInstanceOf(ExecutionException.class).cause().isInstanceOf(DomainException.class).hasFieldOrPropertyWithValue("code", REJECTED_CODE);
            assertThat(recordedRefusals()).isEqualTo(1);
            release.countDown();
            other.get(30, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    @DisplayName("Given more wrong codes of an administrator arriving at once than the pool has connections, when they all withdraw a key, then every one answers a refusal well within the pool's timeout and every rejected code is recorded")
    void should_refuse_each_and_record_every_rejected_code_when_withdrawn_given_more_wrong_codes_at_once_than_pool_connections() throws Exception {
        int burst = maximumPoolSize() + 5;
        CyclicBarrier together = new CyclicBarrier(burst);
        FreshSecondFactorProof wrongCode = wrongCodeOf(ADMIN_SECRET);
        ExecutorService callers = Executors.newFixedThreadPool(burst);
        List<String> outcomes = new ArrayList<>();
        long started = System.nanoTime();
        try {
            List<Future<String>> answers = IntStream.range(0, burst).mapToObj(caller -> callers.submit(() -> {
                together.await(30, TimeUnit.SECONDS);
                try {
                    withdrawal.withdraw(ADMIN, EARLIER, wrongCode);
                    return "withdrawn";
                } catch (DomainException refused) {
                    return refused.code();
                } catch (RuntimeException failure) {
                    return failure.getClass().getName();
                }
            })).toList();
            for (Future<String> answer : answers) {
                outcomes.add(answer.get(WELL_WITHIN_THE_POOL_TIMEOUT.toSeconds() * 2, TimeUnit.SECONDS));
            }
        } finally {
            callers.shutdownNow();
        }
        Duration took = Duration.ofNanos(System.nanoTime() - started);

        assertThat(outcomes).hasSize(burst).allSatisfy(outcome -> assertThat(outcome).isIn(REJECTED_CODE, ReceiptSigningKeyWithdrawalPaused.CODE));
        long rejected = outcomes.stream().filter(REJECTED_CODE::equals).count();
        assertThat(rejected).isGreaterThanOrEqualTo(ReceiptSigningKeyWithdrawalRefusals.REFUSALS_BEFORE_PAUSE);
        assertThat(recordedRefusals()).as("every rejected code is recorded").isEqualTo(rejected);
        assertThat(took).isLessThan(WELL_WITHIN_THE_POOL_TIMEOUT);
    }

    private void holdTheRow(CountDownLatch rowHeld, CountDownLatch release, Optional<UUID> usingTheCodeOf, boolean withdraw) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            usingTheCodeOf.ifPresent(admin -> freshSecondFactor.require(admin, codeOf(admin.equals(ADMIN) ? ADMIN_SECRET : OTHER_ADMIN_SECRET)));
            jdbc.sql("select key_id from receipt_signing_key where key_id = ? for update").param(EARLIER.value()).query(String.class).single();
            if (withdraw) {
                ReceiptSigningKey row = keys.findAll().stream().filter(key -> key.id().equals(EARLIER)).findFirst().orElseThrow();
                keys.save(row.withdrawn(content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
            }
            rowHeld.countDown();
            await(release);
        });
    }

    private void administratorWithSecondFactor(UUID id, String email, String variableSymbol, TotpSecret secret) {
        OffsetDateTime registered = OffsetDateTime.parse("2026-10-01T09:00:00Z");
        jdbc.sql("""
                        insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol,
                                           preferred_locale, registered_at, email_verified_at, erased_at)
                        values (?, 'PERSON', 'Testovací Správce', null, 'Ulice 1', 'Město', '110 00', ?, null, ?, 'cs', ?, ?, null)""")
                .params(id, email, variableSymbol, registered, registered).update();
        jdbc.sql("insert into donor_role (donor_id, role) values (?, 'ADMIN')").param(id).update();
        jdbc.sql("insert into donor_second_factor (donor_id, secret, created_at, confirmed_at, last_used_step) values (?, ?, ?, ?, ?)")
                .params(id, secret.value(), registered, registered, Totp.stepAt(registered.toInstant())).update();
    }

    private FreshSecondFactorProof codeOf(TotpSecret secret) {
        return new FreshSecondFactorProof(Optional.of(Totp.codeAt(secret, Totp.stepAt(clock.instant()))), Optional.empty());
    }

    private FreshSecondFactorProof wrongCodeOf(TotpSecret secret) {
        return new FreshSecondFactorProof(Optional.of(wrongCodeFor(secret)), Optional.empty());
    }

    private String wrongCodeFor(TotpSecret secret) {
        return IntStream.rangeClosed(0, 9).mapToObj(digit -> String.valueOf(digit).repeat(Totp.DIGITS))
                .filter(candidate -> Totp.matchingStep(secret, candidate, clock.instant()).isEmpty()).findFirst().orElseThrow();
    }

    private int maximumPoolSize() throws SQLException {
        return dataSource.unwrap(HikariDataSource.class).getMaximumPoolSize();
    }

    private long recordedRefusals() {
        return jdbc.sql("select count(*) from admin_action where action = 'WITHDRAW_RECEIPT_SIGNING_KEY_REFUSED'").query(Long.class).single();
    }

    private long auditedWithdrawalEntries() {
        return jdbc.sql("select count(*) from admin_action where action like 'WITHDRAW_RECEIPT_SIGNING_KEY%'").query(Long.class).single();
    }

    private static void awaitHeld(CountDownLatch rowHeld, Future<?> holder) throws Exception {
        if (!rowHeld.await(30, TimeUnit.SECONDS)) {
            holder.get(1, TimeUnit.SECONDS);
            throw new AssertionError("the other withdrawal never held the row");
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
