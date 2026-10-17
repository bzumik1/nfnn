package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.shared.application.event.DonorProfileChanged;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.Optional;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorProfileServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Mock
    private DonorRepository donors;
    @Mock
    private ApplicationEventPublisher events;

    private DonorProfileService service;

    @BeforeEach
    void setUp() {
        service = new DonorProfileService(donors, events);
    }

    @Test
    @DisplayName("Given a registered donor, when the profile is updated, then DonorProfileChanged carries the donor id, the new name, address and preferred locale")
    void should_publish_profile_changed_when_profile_updated_given_registered_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));

        service.updateProfile(DONOR, new UpdateDonorProfileCommand("Jana Malá", "Krátká 3", "Praha", "110 00", "en"));

        verify(events).publishEvent(new DonorProfileChanged(
                DONOR.value(), "Jana Malá", new PostalAddress("Krátká 3", "Praha", "110 00"), LocaleCode.EN));
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
    }
}
