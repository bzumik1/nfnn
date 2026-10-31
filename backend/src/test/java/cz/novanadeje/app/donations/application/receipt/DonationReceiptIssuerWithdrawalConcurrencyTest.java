package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
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

import java.time.LocalDate;
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
class DonationReceiptIssuerWithdrawalConcurrencyTest {

    private static final DonorReference DONOR = new DonorReference(UUID.fromString("019a1c00-0000-7000-8000-00000000d001"));
    private static final DonationId DONATION = new DonationId(UUID.fromString("019a1c00-0000-7000-8000-00000000e001"));

    @Autowired
    private DonationReceiptIssuer issuer;
    @Autowired
    private ReceiptSigningKeyRepository keys;
    @Autowired
    private ReceiptSigner signer;
    @Autowired
    private RecordSeals seals;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private ApplicationContext context;

    @BeforeEach
    void theServersOwnKey() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
    }

    @Test
    @DisplayName("Given a withdrawal of the server's own key holding its row, when a receipt is issued meanwhile, then the issue waits for the withdrawal to commit and is refused as paused, so no receipt is signed with a key whose withdrawal is committing")
    void should_wait_for_the_withdrawal_and_refuse_as_paused_when_issued_given_a_withdrawal_of_the_own_key_holding_its_row() throws Exception {
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> withdrawal = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("select key_id from receipt_signing_key where key_id = ? for update").param(signer.keyId().value()).query(String.class).single();
                ReceiptSigningKey own = keys.findAll().stream().filter(key -> key.id().equals(signer.keyId())).findFirst().orElseThrow();
                keys.save(own.withdrawn(content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
                rowHeld.countDown();
                await(release);
            }));
            assertThat(rowHeld.await(30, TimeUnit.SECONDS)).isTrue();

            Future<DonationReceipt> issue = callers.submit(() -> issuer.issueForDonation(DONOR, DONATION, LocalDate.of(2026, 11, 20)));
            Thread.sleep(500);
            boolean waited = !issue.isDone();
            release.countDown();
            withdrawal.get(30, TimeUnit.SECONDS);

            assertThat(waited).as("the issue waits while the withdrawal holds the row of the server's own key").isTrue();
            assertThatThrownBy(() -> issue.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOf(ReceiptSigningPaused.class);
        } finally {
            release.countDown();
            callers.shutdownNow();
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
