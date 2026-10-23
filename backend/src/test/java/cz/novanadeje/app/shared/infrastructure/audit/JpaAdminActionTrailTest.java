package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
class JpaAdminActionTrailTest {

    private static final Instant AT = Instant.parse("2026-10-22T10:00:00Z");

    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private AdminActionTrail trail;

    private UUID admin;
    private UUID subject;

    @BeforeEach
    void setUp() {
        admin = UUID.randomUUID();
        subject = UUID.randomUUID();
        transactions.executeWithoutResult(status -> {
            events.publishEvent(new AdminActionPerformed(admin, "PAIR_PAYMENT", Optional.of(subject), "first", AT));
            events.publishEvent(new AdminActionPerformed(admin, "UNPAIR_PAYMENT", Optional.empty(), "second", AT.plusSeconds(60)));
            events.publishEvent(new AdminActionPerformed(admin, "GRANT_ADMINISTRATION", Optional.of(subject), "third", AT.plusSeconds(120)));
        });
    }

    @Test
    @DisplayName("Given three stored actions, when the trail before a later time is read, then they come newest first with every column")
    void should_list_newest_first_when_read_given_stored_actions() {
        var entries = trail.findPerformedBefore(AT.plusSeconds(121), 10).stream().filter(entry -> entry.adminId().equals(admin)).toList();

        assertThat(entries).extracting(AdminActionEntry::details).containsExactly("third", "second", "first");
        AdminActionEntry first = entries.getLast();
        assertThat(first.id()).isNotNull();
        assertThat(first.action()).isEqualTo("PAIR_PAYMENT");
        assertThat(first.subjectId()).contains(subject);
        assertThat(first.performedAt()).isEqualTo(AT);
        assertThat(entries.get(1).subjectId()).isEmpty();
    }

    @Test
    @DisplayName("Given three stored actions, when the trail before the newest one is read with a limit, then only older ones come, at most the limit")
    void should_page_when_read_given_before_and_limit() {
        var entries = trail.findPerformedBefore(AT.plusSeconds(120), 1).stream().filter(entry -> entry.adminId().equals(admin)).toList();

        assertThat(entries).extracting(AdminActionEntry::details).containsExactly("second");
    }
}
