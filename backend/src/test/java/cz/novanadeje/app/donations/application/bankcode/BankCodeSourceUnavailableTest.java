package cz.novanadeje.app.donations.application.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeSourceUnavailableTest {

    @Test
    @DisplayName("Given a closed failure, when the source is unavailable, then its outcome is the failure's word")
    void should_name_the_word_when_unavailable_given_closed_failure() {
        BankCodeSourceUnavailable unavailable = new BankCodeSourceUnavailable(BankCodeSourceFailure.UNKNOWN_HOST);

        assertThat(unavailable.failure()).isEqualTo(BankCodeSourceFailure.UNKNOWN_HOST);
        assertThat(unavailable.outcome()).isEqualTo("unknown host");
    }

    @Test
    @DisplayName("Given an HTTP status, when the source is unavailable, then its outcome names the status")
    void should_name_the_status_when_unavailable_given_status() {
        BankCodeSourceUnavailable unavailable = BankCodeSourceUnavailable.status(503);

        assertThat(unavailable.failure()).isEqualTo(BankCodeSourceFailure.STATUS);
        assertThat(unavailable.outcome()).isEqualTo("status 503");
        assertThat(unavailable.getMessage()).isEqualTo("status 503");
    }

    @Test
    @DisplayName("Given a number that is no HTTP status, or the status failure without one, when the source is unavailable with it, then it is refused")
    void should_refuse_when_unavailable_given_no_http_status() {
        assertThatThrownBy(() -> BankCodeSourceUnavailable.status(99)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BankCodeSourceUnavailable.status(600)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BankCodeSourceUnavailable(BankCodeSourceFailure.STATUS)).isInstanceOf(IllegalArgumentException.class);
    }
}
