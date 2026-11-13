package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeysOverview;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptAnnouncementRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.event.YearlyReceiptsReady;
import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class YearlyReceiptAnnouncementServiceTest {

    private static final Year YEAR_2026 = Year.of(2026);
    private static final PersonReference CHAIR = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-00000000f001"));
    private static final DonorReference JANA = new DonorReference(UUID.fromString("019a0000-0000-7000-8000-00000000000a"));

    private final YearlyReceiptsService yearlyReceipts = mock(YearlyReceiptsService.class);
    private final Set<Year> announced = new HashSet<>();
    private final YearlyReceiptAnnouncementRepository announcements = (year, at) -> announced.add(year);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReceiptSigningKeys signingKeys = mock(ReceiptSigningKeys.class);
    private final ReceiptSignatoryRepository signatories = mock(ReceiptSignatoryRepository.class);

    @BeforeEach
    void receiptsCanBeIssued() {
        when(signingKeys.overview()).thenReturn(overview(true));
        when(signatories.current()).thenReturn(Optional.of(new ReceiptSignatory(CHAIR, "předsedkyně správní rady", Instant.parse("2026-01-01T00:00:00Z"))));
    }

    @Test
    @DisplayName("Given the second of January in Prague and donors who gave last year, when the announcement runs twice, then the donors are announced once and the year is marked")
    void should_announce_donors_once_when_run_twice_given_second_of_january() {
        when(yearlyReceipts.candidates(YEAR_2026)).thenReturn(candidates(JANA));
        YearlyReceiptAnnouncementService service = service("2027-01-01T23:30:00Z", "2026");

        assertThat(service.announceDue()).contains(new YearlyReceiptAnnouncement(YEAR_2026, 1));
        assertThat(service.announceDue()).isEmpty();

        verify(events).publishEvent(new YearlyReceiptsReady(Set.of(JANA.value()), Instant.parse("2027-01-01T23:30:00Z")));
        assertThat(announced).containsExactly(YEAR_2026);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2027-01-01T09:00:00Z", "2027-01-01T22:59:00Z", "2027-02-01T09:00:00Z", "2026-12-31T09:00:00Z"})
    @DisplayName("Given a day outside the second to the last of January in Prague, when the announcement runs, then nothing is marked or announced")
    void should_announce_nothing_when_run_given_day_outside_january_from_the_second(String now) {
        YearlyReceiptAnnouncementService service = service(now, "2026");

        assertThat(service.announceDue()).isEmpty();

        assertThat(announced).isEmpty();
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a year before the first year of receipts, when the announcement runs in January after it, then nothing is marked or announced")
    void should_announce_nothing_when_run_given_year_before_first_receipt_year() {
        YearlyReceiptAnnouncementService service = service("2026-01-02T09:00:00Z", "2026");

        assertThat(service.announceDue()).isEmpty();

        assertThat(announced).isEmpty();
    }

    @Test
    @DisplayName("Given nobody who gave last year, when the announcement runs, then the year is marked and nothing is announced")
    void should_mark_year_without_event_when_run_given_no_donors() {
        when(yearlyReceipts.candidates(YEAR_2026)).thenReturn(candidates());
        YearlyReceiptAnnouncementService service = service("2027-01-02T09:00:00Z", "2026");

        assertThat(service.announceDue()).contains(new YearlyReceiptAnnouncement(YEAR_2026, 0));

        assertThat(announced).containsExactly(YEAR_2026);
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given the second of January while the server's signing key is not published, when the announcement runs, then nothing is marked or announced, so the next day tries again")
    void should_wait_when_run_given_signing_key_not_published() {
        when(signingKeys.overview()).thenReturn(overview(false));
        YearlyReceiptAnnouncementService service = service("2027-01-02T09:00:00Z", "2026");

        assertThat(service.announceDue()).isEmpty();

        assertThat(announced).isEmpty();
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given the second of January while nobody is chosen to sign the receipts, when the announcement runs, then nothing is marked or announced")
    void should_wait_when_run_given_no_signatory() {
        when(signatories.current()).thenReturn(Optional.empty());
        YearlyReceiptAnnouncementService service = service("2027-01-02T09:00:00Z", "2026");

        assertThat(service.announceDue()).isEmpty();

        assertThat(announced).isEmpty();
    }

    private YearlyReceiptAnnouncementService service(String now, String firstYear) {
        return new YearlyReceiptAnnouncementService(yearlyReceipts, announcements, signingKeys, signatories, new FirstReceiptYear(Year.parse(firstYear)),
                events, Clock.fixed(Instant.parse(now), ZoneOffset.UTC));
    }

    private static ReceiptSigningKeysOverview overview(boolean currentKeyPublished) {
        return new ReceiptSigningKeysOverview(new ReceiptSigningKeyId("0a1b2c3d"), currentKeyPublished, List.of(), List.of());
    }

    private static YearlyReceiptCandidates candidates(DonorReference... donors) {
        return new YearlyReceiptCandidates(YEAR_2026, new ReceiptYears(YEAR_2026, YEAR_2026),
                List.of(donors).stream().map(donor -> new YearlyReceiptCandidate(donor, "Jana Nováková", DonorType.PERSON, 1, 50_000, Optional.empty()))
                        .toList(), 0);
    }
}
