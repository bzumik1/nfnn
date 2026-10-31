package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyAlreadyWithdrawn;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.DomainException;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.ServerReceiptSigningKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class ReceiptSigningKeyWithdrawalConcurrencyTest {

    private static final byte[] EARLIER_PUBLIC_KEY = HexFormat.of().parseHex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
    private static final ReceiptSigningKeyId EARLIER = ReceiptSigningKeyId.of(EARLIER_PUBLIC_KEY);
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final FreshSecondFactorProof NO_PROOF = new FreshSecondFactorProof(Optional.of("000000"), Optional.empty());
    private static final FreshSecondFactorProof ACCEPTED_PROOF = new FreshSecondFactorProof(Optional.of("123456"), Optional.empty());

    @Autowired
    private ReceiptSigningKeyWithdrawal withdrawal;
    @Autowired
    private ReceiptSigningKeyRepository keys;
    @Autowired
    private ReceiptSigningKeys published;
    @Autowired
    private ReceiptSigningKeyWithdrawalRefusals refusals;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private Clock clock;
    @Autowired
    private RecordSeals seals;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private ApplicationContext context;

    @BeforeEach
    void anEarlierKeySealedHere() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> keys.save(ReceiptSigningKey.register(EARLIER_PUBLIC_KEY,
                Instant.parse("2026-11-01T07:00:00Z"), content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content))));
    }

    @Test
    @DisplayName("Given another withdrawal holding the row of a key, when an administrator withdraws the same key with an accepted second factor, then the withdrawal waits for it and answers that the key is already withdrawn, auditing nothing")
    void should_wait_for_the_other_and_refuse_as_already_withdrawn_when_withdrawn_given_a_withdrawal_holding_the_row() throws Exception {
        ReceiptSigningKeyWithdrawal accepting = new ReceiptSigningKeyWithdrawal(keys, published, seals, (account, proof) -> { }, refusals, events, clock);
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> other = callers.submit(() -> holdTheRow(rowHeld, release, true));
            assertThat(rowHeld.await(30, TimeUnit.SECONDS)).isTrue();

            Future<WithdrawnReceiptSigningKey> second = callers.submit(() -> new TransactionTemplate(transactionManager)
                    .execute(status -> accepting.withdraw(ADMIN, EARLIER, ACCEPTED_PROOF)));
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
        assertThat(jdbc.sql("select count(*) from admin_action where action like 'WITHDRAW_RECEIPT_SIGNING_KEY%'").query(Long.class).single()).isZero();
    }

    @Test
    @DisplayName("Given another withdrawal holding the row of a key, when an administrator withdraws the same key with a refused code, then the refusal is audited at once without waiting for the row")
    void should_audit_the_refusal_without_waiting_when_withdrawn_given_a_withdrawal_holding_the_row_and_a_refused_code() throws Exception {
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> other = callers.submit(() -> holdTheRow(rowHeld, release, false));
            assertThat(rowHeld.await(30, TimeUnit.SECONDS)).isTrue();

            Future<WithdrawnReceiptSigningKey> refused = callers.submit(() -> withdrawal.withdraw(ADMIN, EARLIER, NO_PROOF));

            assertThatThrownBy(() -> refused.get(10, TimeUnit.SECONDS)).as("the refused withdrawal answers while the other still holds the row")
                    .isInstanceOf(ExecutionException.class).cause().isInstanceOf(DomainException.class);
            assertThat(jdbc.sql("select count(*) from admin_action where action = 'WITHDRAW_RECEIPT_SIGNING_KEY_REFUSED'").query(Long.class).single())
                    .isEqualTo(1);
            release.countDown();
            other.get(30, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
    }

    private void holdTheRow(CountDownLatch rowHeld, CountDownLatch release, boolean withdraw) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.sql("select key_id from receipt_signing_key where key_id = ? for update").param(EARLIER.value()).query(String.class).single();
            if (withdraw) {
                ReceiptSigningKey row = keys.findAll().stream().filter(key -> key.id().equals(EARLIER)).findFirst().orElseThrow();
                keys.save(row.withdrawn(content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
            }
            rowHeld.countDown();
            await(release);
        });
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
