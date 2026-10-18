package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class BankCalendarTest {

    @Test
    @DisplayName("Given a UTC clock after 22:00 in summer time, when today is asked, then it is already the next Prague day")
    void should_be_next_prague_day_when_today_asked_given_utc_instant_after_ten_pm() {
        Clock utc = Clock.fixed(Instant.parse("2026-10-16T22:30:00Z"), ZoneOffset.UTC);

        assertThat(BankCalendar.today(utc)).isEqualTo(LocalDate.of(2026, 10, 17));
    }

    @Test
    @DisplayName("Given a UTC clock after 23:00 in winter time, when today is asked, then it is already the next Prague day")
    void should_be_next_prague_day_when_today_asked_given_utc_instant_after_eleven_pm_in_winter() {
        Clock utc = Clock.fixed(Instant.parse("2026-12-31T23:15:00Z"), ZoneOffset.UTC);

        assertThat(BankCalendar.today(utc)).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    void should_be_same_day_when_today_asked_given_utc_afternoon() {
        Clock utc = Clock.fixed(Instant.parse("2026-10-16T12:00:00Z"), ZoneOffset.UTC);

        assertThat(BankCalendar.today(utc)).isEqualTo(LocalDate.of(2026, 10, 16));
    }
}
