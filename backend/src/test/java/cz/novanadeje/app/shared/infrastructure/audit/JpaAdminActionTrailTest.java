package cz.novanadeje.app.shared.infrastructure.audit;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class JpaAdminActionTrailTest {

    private static final Instant AT = Instant.parse("2026-10-22T10:00:00Z");

    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private AdminActionTrail trail;
    @Autowired
    private JdbcClient jdbc;

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
        var entries = trail.findPerformedBefore(AT.plusSeconds(121), 200).stream().filter(entry -> entry.adminId().equals(admin)).toList();

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

    @Test
    @DisplayName("Given three actions stored at one moment, when they are read two at a time after the last one listed, then every one of them comes once")
    void should_list_every_action_of_one_moment_when_paged_after_the_last_one_listed_given_actions_sharing_their_time() {
        Instant moment = AT.plus(Duration.ofDays(400));
        transactions.executeWithoutResult(status -> {
            for (String details : List.of("one", "two", "three")) {
                events.publishEvent(new AdminActionPerformed(admin, "PAIR_PAYMENT", Optional.empty(), details, moment));
            }
        });

        List<AdminActionEntry> firstPage = trail.findPerformedBefore(moment.plusSeconds(1), 2);
        AdminActionEntry lastListed = firstPage.getLast();
        List<AdminActionEntry> secondPage = trail.findPerformedBefore(lastListed.performedAt(), lastListed.id(), 2);

        assertThat(firstPage).extracting(AdminActionEntry::performedAt).containsOnly(moment);
        assertThat(Stream.concat(firstPage.stream(), secondPage.stream()).filter(entry -> entry.adminId().equals(admin)))
                .extracting(AdminActionEntry::details).containsExactlyInAnyOrder("one", "two", "three");
    }

    @Test
    @DisplayName("Given three stored actions, when the actions of one kind by the administrator since a time are counted, then only those at or after it count")
    void should_count_actions_of_one_kind_when_counted_given_since() {
        transactions.executeWithoutResult(status ->
                events.publishEvent(new AdminActionPerformed(admin, "PAIR_PAYMENT", Optional.empty(), "fourth", AT.plusSeconds(180))));

        assertThat(trail.countPerformedSince(admin, "PAIR_PAYMENT", AT)).isEqualTo(2);
        assertThat(trail.countPerformedSince(admin, "PAIR_PAYMENT", AT.plusSeconds(1))).isEqualTo(1);
        assertThat(trail.countPerformedSince(admin, "UNPAIR_PAYMENT", AT.plusSeconds(61))).isZero();
        assertThat(trail.countPerformedSince(UUID.randomUUID(), "PAIR_PAYMENT", AT)).isZero();
    }

    @Test
    @DisplayName("Given stored actions of several kinds, when the actions of some kinds are read, then all of those kinds come oldest first and no other")
    void should_list_oldest_first_when_read_by_actions_given_several_kinds() {
        transactions.executeWithoutResult(status ->
                events.publishEvent(new AdminActionPerformed(admin, "PAIR_PAYMENT", Optional.empty(), "fourth", AT.plusSeconds(180))));

        var entries = trail.findByActions(Set.of("PAIR_PAYMENT", "GRANT_ADMINISTRATION")).stream()
                .filter(entry -> entry.adminId().equals(admin)).toList();

        assertThat(entries).extracting(AdminActionEntry::details).containsExactly("first", "third", "fourth");
        assertThat(trail.findByActions(Set.of("NO_SUCH_ACTION"))).isEmpty();
    }

    @Test
    @DisplayName("Given three stored actions, when the whole trail is read newest first, then all of them come, the latest first, with their subjects and details")
    void should_list_whole_trail_newest_first_when_read_given_stored_actions() {
        var entries = trail.findAllNewestFirst().stream().filter(entry -> entry.adminId().equals(admin)).toList();

        assertThat(entries).extracting(AdminActionEntry::action).containsExactly("GRANT_ADMINISTRATION", "UNPAIR_PAYMENT", "PAIR_PAYMENT");
        assertThat(entries).extracting(AdminActionEntry::subjectId).containsExactly(Optional.of(subject), Optional.empty(), Optional.of(subject));
        assertThat(entries).extracting(AdminActionEntry::performedAt).containsExactly(AT.plusSeconds(120), AT.plusSeconds(60), AT);
        assertThat(entries).extracting(AdminActionEntry::details).containsExactly("third", "second", "first");
        assertThat(entries).extracting(AdminActionEntry::id).doesNotContainNull().doesNotHaveDuplicates();
        assertThat(entries).extracting(AdminActionEntry::client).containsOnly(Optional.empty());
    }

    @Test
    @DisplayName("Given an action stored with facts beside actions without, when the trail is read by every finder, then the facts come back with their action only")
    void should_read_facts_back_when_read_by_every_finder_given_an_action_with_facts() {
        AdminActionPerformed.Facts facts = AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", Map.of("bank", "0100"));
        Instant later = AT.plusSeconds(180);
        transactions.executeWithoutResult(status ->
                events.publishEvent(new AdminActionPerformed(admin, "REMOVE_BANK_LOGO", Optional.empty(), "Logo banky 0100 odebráno", facts, later)));

        List<List<AdminActionEntry>> reads = List.of(
                trail.findPerformedBefore(later.plusSeconds(1), 200),
                trail.findPerformedBefore(later.plusSeconds(1), new UUID(-1, -1), 200),
                trail.findAllNewestFirst(),
                trail.findByActions(Set.of("REMOVE_BANK_LOGO", "PAIR_PAYMENT", "UNPAIR_PAYMENT", "GRANT_ADMINISTRATION")));

        for (List<AdminActionEntry> read : reads) {
            List<AdminActionEntry> mine = read.stream().filter(entry -> entry.adminId().equals(admin)).toList();
            assertThat(mine).hasSize(4);
            assertThat(mine).filteredOn(entry -> entry.action().equals("REMOVE_BANK_LOGO")).extracting(AdminActionEntry::facts).containsExactly(Optional.of(facts));
            assertThat(mine).filteredOn(entry -> !entry.action().equals("REMOVE_BANK_LOGO")).extracting(AdminActionEntry::facts).containsOnly(Optional.empty());
        }
    }

    @Test
    @DisplayName("Given a stored row whose facts no longer read as facts, when the trail is read, then the row comes without facts instead of failing the read")
    void should_read_no_facts_when_read_given_facts_that_do_not_read() {
        UUID id = UUID.randomUUID();
        Instant later = AT.plusSeconds(240);
        jdbc.sql("""
                        insert into admin_action (id, admin_id, action, subject_id, details, performed_at, facts)
                        values (?, ?, 'REMOVE_BANK_LOGO', null, 'Logo banky 0100 odebráno', ?, cast(? as jsonb))""")
                .params(id, admin, java.sql.Timestamp.from(later), "{\"summaryKey\": \"remove bank logo\", \"values\": {\"bank\": 100}}").update();

        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        lines.start();
        Logger logger = (Logger) LoggerFactory.getLogger(AdminActionFactsColumn.class);
        logger.addAppender(lines);
        try {
            assertThat(trail.findPerformedBefore(later.plusSeconds(1), 200)).filteredOn(entry -> entry.id().equals(id))
                    .extracting(AdminActionEntry::facts).containsExactly(Optional.empty());
            assertThat(trail.findAllNewestFirst()).filteredOn(entry -> entry.id().equals(id))
                    .extracting(AdminActionEntry::facts).containsExactly(Optional.empty());
        } finally {
            logger.detachAppender(lines);
        }

        assertThat(lines.list).filteredOn(line -> line.getFormattedMessage().contains(id.toString())).hasSize(2).allSatisfy(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The facts of admin action " + id + " could not be read: not an object of a summary key and text values")
                    .doesNotContain("remove bank logo");
        });
    }
}
