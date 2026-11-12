package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorAlreadyErased;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.ProfileChangedMeanwhile;
import cz.novanadeje.app.shared.application.event.DonorProfileChanged;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorProfileServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private EmailVerificationTokenRepository verificationTokens;
    @Mock
    private ApplicationEventPublisher events;

    private static final ProfileVersions PROFILES = new ProfileVersions(RowVersionsFixture.canonical());

    private DonorProfileService service;

    @BeforeEach
    void setUp() {
        service = new DonorProfileService(donors, new DonorViews(secondFactors, verificationTokens, Clock.fixed(NOW, ZoneOffset.UTC), new ProfileVersions(RowVersionsFixture.canonical())), events, PROFILES);
    }

    @Test
    @DisplayName("Given a registered donor, when the profile is updated, then DonorProfileChanged carries the donor id, the new name, address and preferred locale")
    void should_publish_profile_changed_when_profile_updated_given_registered_donor() {
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor()));

        service.updateProfile(DONOR, Set.of(Role.DONOR), new UpdateDonorProfileCommand("Jana Malá", "Krátká 3", "Praha", "110 00", "en"), ExpectedVersion.none());

        verify(events).publishEvent(new DonorProfileChanged(
                DONOR.value(), "Jana Malá", new PostalAddress("Krátká 3", "Praha", "110 00"), LocaleCode.EN));
    }

    @Test
    @DisplayName("Given a registered donor, when the profile is read, then it carries the version of the stored name, address and language, which the next change names")
    void should_carry_the_profile_version_when_read_given_a_registered_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));

        DonorView profile = service.profile(DONOR, Set.of(Role.DONOR));

        assertThat(profile.version()).isEqualTo(PROFILES.of(donor())).matches("[0-9a-f]{16}");
    }

    @Test
    @DisplayName("Given a profile changed since it was read, when a change names the older version, then it is refused with the version and the stored profile now, and nothing is saved or published")
    void should_refuse_with_the_current_version_and_profile_when_changed_from_an_older_version_given_a_profile_changed_since() {
        Donor stored = donor();
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.updateProfile(DONOR, Set.of(Role.DONOR), new UpdateDonorProfileCommand("Jana Malá", null, null, null, null),
                ExpectedVersion.of("0000000000000000")))
                .isInstanceOfSatisfying(ProfileChangedMeanwhile.class, refused -> {
                    assertThat(refused.code()).isEqualTo("donors/changed-meanwhile");
                    assertThat(refused.extensions()).containsEntry("version", PROFILES.of(stored))
                            .containsEntry("current", new ProfileVersions.StoredProfile("Jana Nováková", "Dlouhá 12", "Ústí nad Labem", "400 01", "cs"));
                });
        verify(donors, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given the current version, when the profile is changed from it, then it is saved and answers the version of the new profile")
    void should_answer_the_new_version_when_changed_from_the_current_version_given_the_current_version() {
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor()));

        DonorView changed = service.updateProfile(DONOR, Set.of(Role.DONOR), new UpdateDonorProfileCommand("Jana Malá", null, null, null, null),
                ExpectedVersion.of(PROFILES.of(donor())));

        assertThat(changed.name()).isEqualTo("Jana Malá");
        assertThat(changed.version()).isNotEqualTo(PROFILES.of(donor()));
    }

    @Test
    @DisplayName("Given an erased donor whose tab still holds the version read before the erasure, when the profile is changed from it, then it is refused as erased rather than as changed meanwhile, and nothing is saved or published")
    void should_refuse_as_erased_when_changed_from_the_version_read_before_the_erasure_given_an_erased_donor() {
        String readBefore = PROFILES.of(donor());
        Donor erased = donor();
        erased.erase(NOW);
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(erased));

        assertThatThrownBy(() -> service.updateProfile(DONOR, Set.of(Role.DONOR), new UpdateDonorProfileCommand("Petr Svoboda", null, null, null, null),
                ExpectedVersion.of(readBefore)))
                .isInstanceOf(DonorAlreadyErased.class);
        verify(donors, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
    }
}
