package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HistoryImportStartTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 5);

    @Test
    @DisplayName("Given today, when a history start of today is asked, then it is accepted")
    void should_accept_when_start_asked_given_today() {
        assertThat(HistoryImportStart.of(TODAY, TODAY).from()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("Given the earliest day, when a history start on it is asked, then it is accepted")
    void should_accept_when_start_asked_given_earliest_day() {
        assertThat(HistoryImportStart.of(LocalDate.of(2000, 1, 1), TODAY).from()).isEqualTo(LocalDate.of(2000, 1, 1));
    }

    @Test
    @DisplayName("Given today, when a history start of tomorrow is asked, then it is refused as a start in the future")
    void should_refuse_when_start_asked_given_tomorrow() {
        assertThatThrownBy(() -> HistoryImportStart.of(TODAY.plusDays(1), TODAY))
                .isInstanceOf(HistoryStartInFuture.class)
                .extracting("code").isEqualTo("donations/history-start-in-future");
    }

    @Test
    @DisplayName("Given the earliest day, when a history start the day before is asked, then it is refused as too early")
    void should_refuse_when_start_asked_given_day_before_earliest() {
        assertThatThrownBy(() -> HistoryImportStart.of(LocalDate.of(1999, 12, 31), TODAY))
                .isInstanceOf(HistoryStartTooEarly.class)
                .extracting("code").isEqualTo("donations/history-start-too-early");
    }
}
