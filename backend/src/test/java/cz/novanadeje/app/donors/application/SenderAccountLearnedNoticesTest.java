package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorSenderAccountLearned;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SenderAccountLearnedNoticesTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId JANA = new DonorId(UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369"));

    @Mock
    private DonorRepository donors;
    @Mock
    private ApplicationEventPublisher events;

    @Test
    @DisplayName("Given a donor with a confirmed e-mail, when a sender account is learned for the donor, then the donor is told in their language")
    void should_tell_the_donor_when_an_account_is_learned_given_a_confirmed_email() {
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(NOW.minusSeconds(60), null)));

        new SenderAccountLearnedNotices(donors, events).tell(JANA.value(), "3333");

        verify(events).publishEvent(new DonorSenderAccountLearned(JANA.value(), new EmailAddress("jana@example.cz"), LocaleCode.EN, "3333"));
    }

    @Test
    @DisplayName("Given an unconfirmed, an erased or an unknown donor, when a sender account is learned, then nobody is told")
    void should_tell_nobody_when_an_account_is_learned_given_no_confirmed_account() {
        SenderAccountLearnedNotices notices = new SenderAccountLearnedNotices(donors, events);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(null, null)), Optional.of(donor(null, NOW.minusSeconds(30))), Optional.empty());

        notices.tell(JANA.value(), "3333");
        notices.tell(JANA.value(), "3333");
        notices.tell(JANA.value(), "3333");

        verifyNoInteractions(events);
    }

    private static Donor donor(Instant emailVerifiedAt, Instant erasedAt) {
        return Donor.reconstitute(JANA, DonorType.PERSON, new DonorName("Jana Nováková"), null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.EN,
                Set.of(Role.DONOR), NOW.minusSeconds(1000), emailVerifiedAt, erasedAt);
    }
}
