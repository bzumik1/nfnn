package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class FoundationCalendarTest {

    @Test
    @DisplayName("Given a UTC clock at 23:30 on New Year's Eve, when today is asked, then it is already the first of January in Prague")
    void should_be_new_year_in_prague_when_today_asked_given_utc_new_years_eve_late_evening() {
        Clock utc = Clock.fixed(Instant.parse("2026-12-31T23:30:00Z"), ZoneOffset.UTC);

        assertThat(FoundationCalendar.today(utc)).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    @DisplayName("Given a UTC clock at noon, when today is asked, then it is the same Prague day")
    void should_be_same_day_when_today_asked_given_utc_noon() {
        Clock utc = Clock.fixed(Instant.parse("2026-10-16T12:00:00Z"), ZoneOffset.UTC);

        assertThat(FoundationCalendar.today(utc)).isEqualTo(LocalDate.of(2026, 10, 16));
    }

    @Test
    @DisplayName("Given the foundation calendar, when the bank calendar is asked, then it uses the same Prague zone and day")
    void should_share_zone_and_day_with_bank_calendar_when_asked_given_any_clock() {
        Clock utc = Clock.fixed(Instant.parse("2026-10-16T22:30:00Z"), ZoneOffset.UTC);

        assertThat(FoundationCalendar.ZONE).isEqualTo(ZoneId.of("Europe/Prague"));
        assertThat(BankCalendar.ZONE).isEqualTo(FoundationCalendar.ZONE);
        assertThat(BankCalendar.today(utc)).isEqualTo(FoundationCalendar.today(utc));
    }
}
