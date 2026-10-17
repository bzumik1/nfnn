package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.importing.ImportCoverageTest.coverage;
import static org.assertj.core.api.Assertions.assertThat;

class BankImportStateTest {

    private static final Instant CREATED = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-17T11:00:00Z");

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
    void should_keep_every_field_when_reconstituted() {
        BankImportState state = BankImportState.reconstitute(coverage("2026-07-20", "2026-10-17"), Optional.of(LATER), Optional.of(CREATED),
                Optional.of(ImportFailureKind.RATE_LIMITED), Optional.of("409"), LATER);

        assertThat(state.coverage()).isEqualTo(coverage("2026-07-20", "2026-10-17"));
        assertThat(state.lastAttemptedAt()).contains(LATER);
        assertThat(state.lastSucceededAt()).contains(CREATED);
        assertThat(state.lastFailureKind()).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(state.lastFailureMessage()).contains("409");
        assertThat(state.updatedAt()).isEqualTo(LATER);
    }
}
