package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

class ReceiptReplacementCapsTest {

    private static final Instant ISSUED_AT = Instant.parse("2026-11-15T09:20:00Z");

    @Test
    @DisplayName("Given an issue, when the daily cap asks since when replacements count, then it is 24 hours earlier")
    void should_count_the_last_24_hours_when_the_daily_window_is_asked_given_an_issue() {
        assertThat(ReceiptReplacementCaps.dayCountedSince(ISSUED_AT)).isEqualTo(Instant.parse("2026-11-14T09:20:00Z"));
    }

    @Test
    @DisplayName("Given a donor issued 19 replacements in the last 24 hours, when the daily cap is checked, then another is numbered")
    void should_admit_a_replacement_when_checked_given_19_in_a_day() {
        assertThatCode(() -> ReceiptReplacementCaps.refuseBeyondDay(JANA, 19)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a donor issued 20 replacements in the last 24 hours, when the daily cap is checked, then it refuses another")
    void should_refuse_a_replacement_when_checked_given_20_in_a_day() {
        assertThatThrownBy(() -> ReceiptReplacementCaps.refuseBeyondDay(JANA, 20))
                .isInstanceOfSatisfying(ReceiptIssueLimitReached.class, refused -> {
                    assertThat(refused.code()).isEqualTo(ReceiptIssueLimitReached.CODE);
                    assertThat(refused.getMessage()).contains("20 replacement receipts in the last 24 hours");
                });
    }

    @Test
    @DisplayName("Given a donor issued 59 replacements this Prague calendar year, when the yearly cap is checked, then another is numbered")
    void should_admit_a_replacement_when_checked_given_59_in_a_year() {
        assertThatCode(() -> ReceiptReplacementCaps.refuseBeyondYear(JANA, 59)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given a donor issued 60 replacements this Prague calendar year, when the yearly cap is checked, then it refuses another")
    void should_refuse_a_replacement_when_checked_given_60_in_a_year() {
        assertThatThrownBy(() -> ReceiptReplacementCaps.refuseBeyondYear(JANA, 60))
                .isInstanceOfSatisfying(ReceiptIssueLimitReached.class, refused -> {
                    assertThat(refused.code()).isEqualTo(ReceiptIssueLimitReached.CODE);
                    assertThat(refused.getMessage()).contains("60 replacement receipts this calendar year");
                });
    }
}
