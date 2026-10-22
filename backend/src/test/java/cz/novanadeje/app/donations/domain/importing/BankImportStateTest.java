package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.importing.ImportCoverageTest.coverage;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankImportStateTest {

    private static final Instant CREATED = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-17T11:00:00Z");
    private static final Duration COOLDOWN = Duration.ofSeconds(30);

    @Test
    void should_have_no_coverage_and_no_attempt_when_created_given_initial_state() {
        BankImportState state = BankImportState.initial(CREATED);

        assertThat(state.coverage().isEmpty()).isTrue();
        assertThat(state.lastAttemptedAt()).isEmpty();
        assertThat(state.lastSucceededAt()).isEmpty();
        assertThat(state.lastFailureKind()).isEmpty();
        assertThat(state.lastFailureMessage()).isEmpty();
        assertThat(state.updatedAt()).isEqualTo(CREATED);
    }

    @Test
    void should_record_coverage_and_clear_failure_when_succeeded_given_previous_failure() {
        BankImportState state = BankImportState.initial(CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", CREATED);

        state.succeeded(coverage("2026-07-20", "2026-10-17"), LATER);

        assertThat(state.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(state.lastAttemptedAt()).contains(LATER);
        assertThat(state.lastSucceededAt()).contains(LATER);
        assertThat(state.lastFailureKind()).isEmpty();
        assertThat(state.lastFailureMessage()).isEmpty();
        assertThat(state.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void should_keep_coverage_and_last_success_when_failed_given_covered_state() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), CREATED);

        state.failed(ImportFailureKind.UNAUTHORIZED, "refused with HTTP 401", LATER);

        assertThat(state.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(state.lastSucceededAt()).contains(CREATED);
        assertThat(state.lastAttemptedAt()).contains(LATER);
        assertThat(state.lastFailureKind()).contains(ImportFailureKind.UNAUTHORIZED);
        assertThat(state.lastFailureMessage()).contains("refused with HTTP 401");
        assertThat(state.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void should_cut_message_when_failed_given_overlong_message() {
        BankImportState state = BankImportState.initial(CREATED);

        state.failed(ImportFailureKind.UNEXPECTED, "x".repeat(1500), LATER);

        assertThat(state.lastFailureMessage()).hasValueSatisfying(message -> assertThat(message).hasSize(BankImportState.MAX_FAILURE_MESSAGE_LENGTH));
    }

    @Test
    void should_have_no_message_when_failed_given_blank_message() {
        BankImportState state = BankImportState.initial(CREATED);

        state.failed(ImportFailureKind.UNEXPECTED, null, LATER);

        assertThat(state.lastFailureKind()).contains(ImportFailureKind.UNEXPECTED);
        assertThat(state.lastFailureMessage()).isEmpty();
    }

    @Test
    void should_keep_every_field_when_reconstituted_given_stored_state() {
        BankImportState state = BankImportState.reconstitute(coverage("2026-07-20", "2026-10-17"), Optional.of(LATER), Optional.of(CREATED),
                Optional.of(ImportFailureKind.RATE_LIMITED), Optional.of("409"), 2, Optional.of(ImportFailureKind.TRANSPORT), LATER);

        assertThat(state.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(state.lastAttemptedAt()).contains(LATER);
        assertThat(state.lastSucceededAt()).contains(CREATED);
        assertThat(state.lastFailureKind()).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(state.lastFailureMessage()).contains("409");
        assertThat(state.consecutiveFailures()).isEqualTo(2);
        assertThat(state.reportedOutage()).contains(ImportFailureKind.TRANSPORT);
        assertThat(state.updatedAt()).isEqualTo(LATER);
    }

    @Test
    void should_report_no_outage_when_failed_given_fewer_failures_than_the_threshold() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), CREATED);

        Optional<ImportOutage> first = state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER);
        Optional<ImportOutage> second = state.failed(ImportFailureKind.UNEXPECTED, "boom", LATER.plusSeconds(3600));

        assertThat(first).isEmpty();
        assertThat(second).isEmpty();
        assertThat(state.consecutiveFailures()).isEqualTo(2);
        assertThat(state.reportedOutage()).isEmpty();
    }

    @Test
    @DisplayName("Given two failures after a success, when a third one is recorded, then the outage is reported once with the count and the last success")
    void should_report_outage_once_when_failed_given_third_failure_in_a_row() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(3600));

        Optional<ImportOutage> third = state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(7200));
        Optional<ImportOutage> fourth = state.failed(ImportFailureKind.UNEXPECTED, "boom", LATER.plusSeconds(10800));

        assertThat(third).contains(new ImportOutage(ImportFailureKind.TRANSPORT, 3, Optional.of(CREATED), LATER.plusSeconds(7200)));
        assertThat(fourth).isEmpty();
        assertThat(state.consecutiveFailures()).isEqualTo(4);
        assertThat(state.reportedOutage()).contains(ImportFailureKind.TRANSPORT);
    }

    @Test
    @DisplayName("Given a state that never succeeded, when the token is rejected once, then the outage is reported at once without a last success")
    void should_report_outage_at_once_when_failed_given_rejected_token() {
        BankImportState state = BankImportState.initial(CREATED);

        Optional<ImportOutage> outage = state.failed(ImportFailureKind.UNAUTHORIZED, "refused with HTTP 401", LATER);

        assertThat(outage).contains(new ImportOutage(ImportFailureKind.UNAUTHORIZED, 1, Optional.empty(), LATER));
        assertThat(outage).hasValueSatisfying(reported -> assertThat(reported.tokenRejected()).isTrue());
        assertThat(state.failed(ImportFailureKind.UNAUTHORIZED, "refused with HTTP 401", LATER.plusSeconds(3600))).isEmpty();
    }

    @Test
    @DisplayName("Given a reported transport outage, when the token is rejected, then the outage is reported again as a token outage, but not a third time")
    void should_report_outage_again_when_token_rejected_given_outage_of_another_kind() {
        BankImportState state = BankImportState.initial(CREATED);
        for (int i = 0; i < 3; i++) {
            state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(i * 3600L));
        }

        Optional<ImportOutage> escalated = state.failed(ImportFailureKind.UNAUTHORIZED, "refused with HTTP 401", LATER.plusSeconds(4 * 3600L));
        Optional<ImportOutage> repeated = state.failed(ImportFailureKind.UNAUTHORIZED, "refused with HTTP 401", LATER.plusSeconds(5 * 3600L));
        Optional<ImportOutage> other = state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(6 * 3600L));

        assertThat(escalated).contains(new ImportOutage(ImportFailureKind.UNAUTHORIZED, 4, Optional.empty(), LATER.plusSeconds(4 * 3600L)));
        assertThat(repeated).isEmpty();
        assertThat(other).isEmpty();
        assertThat(state.reportedOutage()).contains(ImportFailureKind.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Given two failures, when a rate limit and a locked history are recorded, then they neither count nor reset the streak")
    void should_neither_count_nor_reset_when_failed_given_rate_limit_or_locked_history() {
        BankImportState state = BankImportState.initial(CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER);
        state.failed(ImportFailureKind.INVALID_RESPONSE, "garbled", LATER.plusSeconds(3600));

        Optional<ImportOutage> rateLimited = state.failed(ImportFailureKind.RATE_LIMITED, "409", LATER.plusSeconds(7200));
        Optional<ImportOutage> locked = state.failed(ImportFailureKind.HISTORY_LOCKED, "422", LATER.plusSeconds(7230));
        Optional<ImportOutage> third = state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(10800));

        assertThat(rateLimited).isEmpty();
        assertThat(locked).isEmpty();
        assertThat(state.lastFailureKind()).contains(ImportFailureKind.TRANSPORT);
        assertThat(third).hasValueSatisfying(outage -> assertThat(outage.consecutiveFailures()).isEqualTo(3));
    }

    @Test
    @DisplayName("Given a reported outage, when an import succeeds, then the recovery names the outage, its failures and the success before it, and the streak starts over")
    void should_report_recovery_when_succeeded_given_reported_outage() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), CREATED);
        for (int i = 1; i <= 3; i++) {
            state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(i * 3600L));
        }

        Optional<ImportRecovery> recovery = state.succeeded(coverage("2026-07-20", "2026-10-18"), LATER.plusSeconds(4 * 3600L));

        assertThat(recovery).contains(new ImportRecovery(ImportFailureKind.TRANSPORT, 3, Optional.of(CREATED), LATER.plusSeconds(4 * 3600L)));
        assertThat(state.consecutiveFailures()).isZero();
        assertThat(state.reportedOutage()).isEmpty();
        assertThat(state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER.plusSeconds(5 * 3600L))).isEmpty();
        assertThat(state.consecutiveFailures()).isEqualTo(1);
    }

    @Test
    void should_report_no_recovery_when_succeeded_given_failures_below_the_threshold() {
        BankImportState state = BankImportState.initial(CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER);

        Optional<ImportRecovery> recovery = state.succeeded(coverage("2026-07-20", "2026-10-17"), LATER.plusSeconds(3600));

        assertThat(recovery).isEmpty();
        assertThat(state.consecutiveFailures()).isZero();
    }

    @Test
    void should_refuse_when_reconstituted_given_negative_failure_count() {
        assertThatThrownBy(() -> BankImportState.reconstitute(ImportCoverage.none(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), -1, Optional.empty(), CREATED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void should_not_count_as_recent_when_asked_given_no_attempt() {
        assertThat(BankImportState.initial(CREATED).attemptedWithin(COOLDOWN, CREATED)).isFalse();
    }

    @Test
    void should_count_as_recent_when_asked_before_the_cooldown_ends_given_successful_attempt() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), LATER);

        assertThat(state.attemptedWithin(COOLDOWN, LATER.plusSeconds(29))).isTrue();
    }

    @Test
    void should_count_as_recent_when_asked_before_the_cooldown_ends_given_failed_attempt() {
        BankImportState state = BankImportState.initial(CREATED);
        state.failed(ImportFailureKind.TRANSPORT, "timed out", LATER);

        assertThat(state.attemptedWithin(COOLDOWN, LATER)).isTrue();
    }

    @Test
    void should_not_count_as_recent_when_asked_once_the_cooldown_ended_given_attempt() {
        BankImportState state = BankImportState.initial(CREATED);
        state.succeeded(coverage("2026-07-20", "2026-10-17"), LATER);

        assertThat(state.attemptedWithin(COOLDOWN, LATER.plusSeconds(30))).isFalse();
    }
}
