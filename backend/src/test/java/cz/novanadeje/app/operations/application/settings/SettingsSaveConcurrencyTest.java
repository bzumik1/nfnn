package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordCheck;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.operations.domain.settings.SetupCompleted;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@DonationRowsContext
class SettingsSaveConcurrencyTest {

    private static final UUID JANA = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final UUID PETR = UUID.fromString("01a18e56-bdb0-775a-bd0a-a6075683136a");

    @Autowired
    private SettingsService settings;
    @Autowired
    private SetupService setup;
    @Autowired
    private SettingsWriter writer;
    @Autowired
    private BackupKeySource backupKeys;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    @BeforeEach
    @AfterEach
    void emptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given a stored mail server and password, when one administrator moves the mail server with a new password while another saves only a password for the server they saw, then the second save waits, is refused at the password and the first one's server keeps its own password")
    void should_refuse_the_password_saved_for_the_old_server_when_another_save_moved_the_server_meanwhile_given_a_stored_server_and_password() throws Exception {
        inTransaction(() -> writer.apply(List.of(new SettingChange(Setting.MAIL_HOST, "localhost"),
                new SettingChange(Setting.MAIL_PASSWORD, "password-for-localhost")), List.of(), clock.instant()));
        CountDownLatch moved = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        ExecutorService administrators = Executors.newFixedThreadPool(2);
        try {
            Future<?> moving = administrators.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                settings.change(JANA, List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"),
                        new SettingChange(Setting.MAIL_PASSWORD, "password-for-smtp-example")));
                status.flush();
                moved.countDown();
                waitFor(commit);
            }));
            assertThat(moved.await(30, TimeUnit.SECONDS)).isTrue();
            Future<List<Setting>> passwordOnly = administrators.submit(() -> settings.change(PETR,
                    List.of(new SettingChange(Setting.MAIL_PASSWORD, "another-password-for-localhost"))));
            await().atMost(Duration.ofSeconds(30)).until(() -> waitingOnLocks() > 0);
            commit.countDown();
            moving.get(30, TimeUnit.SECONDS);

            assertThatThrownBy(() -> passwordOnly.get(30, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOfSatisfying(SettingsRejected.class, rejected -> assertThat(rejected.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.MAIL_SERVER_CHANGED_MEANWHILE)));
        } finally {
            commit.countDown();
            administrators.shutdownNow();
        }
        assertThat(writer.storedValues()).containsEntry(Setting.MAIL_HOST, "smtp.example.cz")
                .containsEntry(Setting.MAIL_PASSWORD, "password-for-smtp-example");
    }

    @Test
    @DisplayName("Given an open first setup, when it is completed twice at the same moment, then one completion stores the settings and the other is refused as done with the 409 of a completed setup")
    void should_refuse_the_second_as_completed_when_the_setup_is_completed_twice_at_once_given_an_open_setup() throws Exception {
        CountDownLatch tableHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(3);
        List<Future<List<Setting>>> completions = new ArrayList<>();
        try {
            Future<?> holder = callers.submit(() -> inTransaction(() -> {
                jdbc.sql("lock table operations_setup in share mode").update();
                tableHeld.countDown();
                waitFor(release);
            }));
            assertThat(tableHeld.await(30, TimeUnit.SECONDS)).isTrue();
            Callable<List<Setting>> completion = () -> setup.complete(new SetupAccess(true, null), setupSettings(), backupKeyWords());
            completions.add(callers.submit(completion));
            completions.add(callers.submit(completion));
            await().atMost(Duration.ofSeconds(30)).until(() -> waitingOnLocks() >= 2);
            release.countDown();
            holder.get(30, TimeUnit.SECONDS);

            List<Object> outcomes = new ArrayList<>();
            for (Future<List<Setting>> done : completions) {
                try {
                    outcomes.add(done.get(30, TimeUnit.SECONDS));
                } catch (ExecutionException failed) {
                    outcomes.add(failed.getCause());
                }
            }
            assertThat(outcomes).filteredOn(SetupCompleted.class::isInstance).hasSize(1);
            assertThat(outcomes).filteredOn(List.class::isInstance).hasSize(1);
        } finally {
            release.countDown();
            callers.shutdownNow();
        }
        assertThat(writer.storedValues()).containsEntry(Setting.MAIL_HOST, "smtp-relay.brevo.com");
    }

    private static List<SettingChange> setupSettings() {
        return List.of(new SettingChange(Setting.PUBLIC_URL, "https://nfnn.cz"), new SettingChange(Setting.MAIL_HOST, "smtp-relay.brevo.com"),
                new SettingChange(Setting.MAIL_PORT, "587"), new SettingChange(Setting.MAIL_FROM, "info@nfnn.cz"),
                new SettingChange(Setting.CONTACT_RECIPIENT, "info@nfnn.cz"), new SettingChange(Setting.ADMIN_EMAILS, "spravce@example.cz"));
    }

    private List<BackupKeyWordCheck> backupKeyWords() {
        List<String> words = backupKeys.current().orElseThrow().words();
        return List.of(new BackupKeyWordCheck(4, words.get(3)), new BackupKeyWordCheck(11, words.get(10)), new BackupKeyWordCheck(24, words.get(23)));
    }

    private long waitingOnLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'").query(Long.class).single();
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    private static void waitFor(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
