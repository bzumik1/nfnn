package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.domain.ChangedMeanwhile;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.FakeBankLogoSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class BankLogoCreationConcurrencyTest {

    private static final UUID ADMIN = UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-00112233bbbb");
    private static final BankCode CSAS = new BankCode("0800");
    private static final BankLogoSource THEIRS = new BankLogoSource(CSAS, "https://is1-ssl.mzstatic.com/image/thumb/theirs/512x512bb.jpg");
    private static final BankLogoSource MINE = new BankLogoSource(CSAS, "https://www.csas.cz/content/dam/mine.png");
    private static final StoredBankLogoImage THEIR_IMAGE = new StoredBankLogoImage(
            new BankLogoImageId(UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-0011223344cc")), FetchedBankLogo.of(FakeBankLogoSource.webpOf("theirs")).sha256());

    @Autowired
    private BankLogoRepository logos;
    @Autowired
    private BankCodeRepository banks;
    @Autowired
    private BankLogoVersions versions;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private TransactionTemplate transaction;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private BankLogoAdminService service;

    @BeforeEach
    void noLogos() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        BankLogoImages mine = source -> FetchedBankLogo.of(FakeBankLogoSource.webpOf("mine"));
        service = new BankLogoAdminService(logos, banks, mine, versions, events, transaction, clock);
    }

    @Test
    @DisplayName("Given another administrator's creation of a bank's logo inserted but not committed yet, when a creation of the same bank's logo is written meanwhile, then it is refused as changed meanwhile and their address and image stay")
    void should_refuse_creation_and_keep_theirs_when_written_during_creation_given_creation_not_committed() throws Exception {
        CountDownLatch inserted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> theirs = callers.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                logos.insertIfAbsent(THEIRS);
                logos.storeImage(THEIR_IMAGE, FakeBankLogoSource.webpOf("theirs"));
                BankLogo locked = logos.lockForChange(CSAS).orElseThrow();
                logos.save(locked.fetched(THEIR_IMAGE, clock.instant()));
                inserted.countDown();
                waitFor(release);
            }));
            assertThat(inserted.await(30, TimeUnit.SECONDS)).isTrue();

            Future<BankLogoAdminRow> mine = callers.submit(() -> service.set(ADMIN, MINE, BankLogoPrecondition.absent()));
            await().until(() -> waitingForLocks() >= 1);
            release.countDown();
            theirs.get(30, TimeUnit.SECONDS);

            assertThatThrownBy(() -> mine.get(30, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(ChangedMeanwhile.class);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(jdbc.sql("select source_url from bank_logo where code = ?").param(CSAS.value()).query(String.class).single()).isEqualTo(THEIRS.url());
        assertThat(jdbc.sql("select image_id from bank_logo where code = ?").param(CSAS.value()).query(UUID.class).single())
                .isEqualTo(THEIR_IMAGE.id().value());
        assertThat(jdbc.sql("select count(*) from bank_logo_image").query(Long.class).single()).isEqualTo(1);
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
