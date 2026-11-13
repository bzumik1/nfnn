package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyRegistryUnavailableTest {

    @Test
    @DisplayName("Given a closed failure, when the register is unavailable, then its outcome is the failure's word and it carries no pause")
    void should_name_the_word_when_unavailable_given_closed_failure() {
        CompanyRegistryUnavailable unavailable = new CompanyRegistryUnavailable(CompanyRegistryFailure.NON_PUBLIC_ADDRESS);

        assertThat(unavailable.failure()).isEqualTo(CompanyRegistryFailure.NON_PUBLIC_ADDRESS);
        assertThat(unavailable.outcome()).isEqualTo("non-public address");
        assertThat(unavailable.pause()).isEmpty();
    }

    @Test
    @DisplayName("Given an HTTP status, when the register is unavailable, then its outcome names the status")
    void should_name_the_status_when_unavailable_given_status() {
        CompanyRegistryUnavailable unavailable = CompanyRegistryUnavailable.status(429);

        assertThat(unavailable.failure()).isEqualTo(CompanyRegistryFailure.STATUS);
        assertThat(unavailable.outcome()).isEqualTo("status 429");
    }

    @Test
    @DisplayName("Given a number that is no HTTP status, when the register is unavailable with it, then it is refused")
    void should_refuse_when_unavailable_given_no_http_status() {
        assertThatThrownBy(() -> CompanyRegistryUnavailable.status(99)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CompanyRegistryUnavailable.status(600)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given the failures that carry a status or an exception class, when they are built without it, then they are refused")
    void should_refuse_when_built_without_detail_given_status_or_unexpected_exception() {
        assertThatThrownBy(() -> new CompanyRegistryUnavailable(CompanyRegistryFailure.STATUS)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CompanyRegistryUnavailable(CompanyRegistryFailure.UNEXPECTED_EXCEPTION)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given an unexpected exception with a message, when the register is unavailable for it, then the outcome names only its class")
    void should_name_only_the_class_when_unavailable_given_unexpected_exception() {
        CompanyRegistryUnavailable unavailable = CompanyRegistryUnavailable.unexpected(new IllegalStateException("45274649 broke"));

        assertThat(unavailable.outcome()).isEqualTo("IllegalStateException");
        assertThat(unavailable.getMessage()).isEqualTo("IllegalStateException");
    }

    @Test
    @DisplayName("Given a failure, when it starts a pause, then the pausing failure keeps the outcome and carries the pause")
    void should_keep_outcome_and_carry_pause_when_pausing() {
        CompanyRegistryPause pause = new CompanyRegistryPause(3, Duration.ofMinutes(5));

        CompanyRegistryUnavailable pausing = CompanyRegistryUnavailable.status(503).pausing(pause);

        assertThat(pausing.outcome()).isEqualTo("status 503");
        assertThat(pausing.pause()).contains(pause);
    }
}
