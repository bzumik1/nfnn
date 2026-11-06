package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionSummary;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
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
    @DisplayName("Given three stored actions, when the whole trail is read newest first, then all of them come, the latest first, with their subjects")
    void should_list_whole_trail_newest_first_when_read_given_stored_actions() {
        var entries = trail.findAllSummariesNewestFirst().stream().filter(entry -> entry.adminId().equals(admin)).toList();

        assertThat(entries).extracting(AdminActionSummary::action).containsExactly("GRANT_ADMINISTRATION", "UNPAIR_PAYMENT", "PAIR_PAYMENT");
        assertThat(entries).extracting(AdminActionSummary::subjectId).containsExactly(Optional.of(subject), Optional.empty(), Optional.of(subject));
        assertThat(entries).extracting(AdminActionSummary::performedAt).containsExactly(AT.plusSeconds(120), AT.plusSeconds(60), AT);
        assertThat(entries).extracting(AdminActionSummary::id).doesNotContainNull().doesNotHaveDuplicates();
        assertThat(entries).extracting(AdminActionSummary::client).containsOnly(Optional.empty());
    }
}
