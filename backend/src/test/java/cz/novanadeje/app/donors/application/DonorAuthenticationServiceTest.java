package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotVerified;
import cz.novanadeje.app.donors.domain.InvalidCredentials;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorChallenge;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorCode;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRequired;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorAuthenticationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String BCRYPT_COST_12 = "\\$2[aby]\\$12\\$[./0-9A-Za-z]{53}";
    private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    private static final int CHALLENGE_ATTEMPTS = 5;
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final IssuedTokens TOKENS = new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14)),
            Set.of(Role.DONOR));

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private SecondFactorChallengeRepository challenges;

    private DonorAuthenticationService service;
    private Donor donor;

    @BeforeEach
    void setUp() {
        service = new DonorAuthenticationService(donors, passwordHasher, sessions, new DonorViews(secondFactors), secondFactors, challenges,
                new DonorSecondFactorProperties(CHALLENGE_TTL, CHALLENGE_ATTEMPTS, "Nová naděje", Duration.ofDays(14)), Clock.fixed(NOW, ZoneOffset.UTC));
        donor = Donor.register(DonorId.newId(NOW), DonorType.COMPANY, "Stavby Novák s.r.o.", new CompanyIdentifier("45274649"),
                new PostalAddress("Průmyslová 5", "Teplice", "415 01"), EMAIL, HASH, new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
        donor.verifyEmail(NOW);
    }

    @Test
    @DisplayName("Given a donor whose e-mail is not verified, when signing in with the right password, then it is refused as not verified and no session opens")
    void should_refuse_as_not_verified_when_logged_in_given_unverified_donor_and_matching_password() {
        Donor unverified = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL, HASH, new VariableSymbol("1234567891"), LocaleCode.CS, NOW);
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverified));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOfSatisfying(EmailNotVerified.class, refused -> assertThat(refused.code()).isEqualTo("auth/email-not-verified"));

        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a donor whose e-mail is not verified, when signing in with a wrong password, then it is refused as wrong credentials, not as unverified")
    void should_refuse_as_wrong_credentials_when_logged_in_given_unverified_donor_and_wrong_password() {
        Donor unverified = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL, HASH, new VariableSymbol("1234567891"), LocaleCode.CS, NOW);
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverified));
        when(passwordHasher.matches(any(), any())).thenReturn(false);

        assertThatThrownBy(() -> service.login("jana@example.cz", "wrong horse battery")).isInstanceOf(InvalidCredentials.class);
    }

    @Test
    @DisplayName("Given an erased donor whose placeholder address is used, when signing in, then it is refused as wrong credentials without comparing the password")
    void should_refuse_as_wrong_credentials_when_logged_in_given_erased_donor() {
        Donor erased = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL, HASH, new VariableSymbol("1234567891"), LocaleCode.CS, NOW);
        erased.verifyEmail(NOW);
        erased.erase(NOW.plusSeconds(5));
        when(donors.findByEmail(erased.email())).thenReturn(Optional.of(erased));

        assertThatThrownBy(() -> service.login(erased.email().value(), "correct horse battery")).isInstanceOf(InvalidCredentials.class);

        verify(passwordHasher, never()).matches(any(), eq(HASH));
        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given the matching password, when a donor signs in, then a session opens")
    void should_open_session_when_logged_in_given_matching_password() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);
        when(sessions.open(donor, false)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.login("jana@example.cz", "correct horse battery");

        assertThat(result.donor().companyIdentifier()).isEqualTo("45274649");
        assertThat(result.tokens().refreshToken()).isEqualTo("refresh");
    }

    @Test
    @DisplayName("Given a wrong password, when a donor signs in, then it is refused")
    void should_refuse_when_logged_in_given_wrong_password() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(any(), any())).thenReturn(false);

        assertThatThrownBy(() -> service.login("jana@example.cz", "wrong horse battery"))
                .isInstanceOf(InvalidCredentials.class);

        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given an unknown e-mail, when a donor signs in, then it is refused")
    void should_refuse_when_logged_in_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);
    }

    @Test
    @DisplayName("Given an unknown email, when signing in, then the password is still compared against a cost-12 BCrypt hash that no password matches")
    void should_compare_against_real_bcrypt_hash_when_logged_in_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());
        ArgumentCaptor<PasswordHash> compared = ArgumentCaptor.forClass(PasswordHash.class);

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);

        verify(passwordHasher).matches(eq(new RawPassword("correct horse battery")), compared.capture());
        String unknownDonorHash = compared.getValue().value();
        assertThat(unknownDonorHash).matches(BCRYPT_COST_12);
        BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
        assertThat(bcrypt.matches("correct horse battery", unknownDonorHash)).isFalse();
        assertThat(bcrypt.matches(UUID.randomUUID().toString(), unknownDonorHash)).isFalse();
        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a malformed e-mail, when a donor signs in, then it is refused")
    void should_refuse_when_logged_in_given_malformed_email() {
        assertThatThrownBy(() -> service.login("not an email", "correct horse battery"))
                .isInstanceOf(InvalidCredentials.class);
    }

    @Test
    @DisplayName("Given a donor with an enabled second factor, when signing in with the right password, then a challenge is stored and returned instead of a session")
    void should_issue_challenge_instead_of_session_when_logged_in_given_enabled_second_factor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(enabledFactor()));

        assertThatThrownBy(() -> service.login("jana@example.cz", "correct horse battery"))
                .isInstanceOfSatisfying(SecondFactorRequired.class, required -> {
                    ArgumentCaptor<SecondFactorChallenge> stored = ArgumentCaptor.forClass(SecondFactorChallenge.class);
                    verify(challenges).save(stored.capture());
                    assertThat(stored.getValue().secretHash()).isEqualTo(new LinkSecret(required.challenge()).hash());
                    assertThat(stored.getValue().donorId()).isEqualTo(donor.id());
                    assertThat(stored.getValue().expiresAt()).isEqualTo(NOW.plus(CHALLENGE_TTL)).isEqualTo(required.challengeExpiresAt());
                    assertThat(required.code()).isEqualTo("auth/second-factor-required");
                    assertThat(required.extensions()).containsEntry("challenge", required.challenge());
                });

        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a donor whose second factor is only pending, when signing in, then a plain session opens")
    void should_open_session_when_logged_in_given_pending_second_factor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword("correct horse battery"), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(SecondFactor.enrol(donor.id(), SECRET, NOW)));
        when(sessions.open(donor, false)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.login("jana@example.cz", "correct horse battery");

        assertThat(result.donor().secondFactor().enabled()).isFalse();
        verifyNoInteractions(challenges);
    }

    @Test
    @DisplayName("Given a live challenge and the current code, when the second factor is completed, then the challenge is spent, the step is remembered and a verified session opens")
    void should_open_verified_session_when_second_factor_completed_given_live_challenge_and_right_code() {
        LinkSecret secret = LinkSecret.generate();
        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        SecondFactor factor = enabledFactor();
        when(challenges.findBySecretHash(secret.hash())).thenReturn(Optional.of(challenge));
        when(donors.findById(donor.id())).thenReturn(Optional.of(donor));
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(factor));
        when(sessions.open(donor, true)).thenReturn(TOKENS);
        when(challenges.reserveAttempt(challenge.id(), NOW, CHALLENGE_ATTEMPTS)).thenReturn(true);
        when(challenges.markUsed(challenge.id(), NOW)).thenReturn(true);

        AuthenticatedDonor result = service.completeSecondFactor(secret.value(), codeAt(NOW));

        assertThat(result.tokens()).isEqualTo(TOKENS);
        assertThat(factor.lastUsedStep()).hasValue(Totp.stepAt(NOW));
        verify(challenges).markUsed(challenge.id(), NOW);
        verify(secondFactors).save(factor);
    }

    @Test
    @DisplayName("Given a challenge whose attempts other requests used up at the same moment, when the second factor is completed, then the challenge is refused before the code is checked")
    void should_refuse_challenge_when_second_factor_completed_given_attempts_used_up_concurrently() {
        LinkSecret secret = LinkSecret.generate();
        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        SecondFactor factor = enabledFactor();
        when(challenges.findBySecretHash(secret.hash())).thenReturn(Optional.of(challenge));
        when(donors.findById(donor.id())).thenReturn(Optional.of(donor));
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(factor));
        when(challenges.reserveAttempt(challenge.id(), NOW, CHALLENGE_ATTEMPTS)).thenReturn(false);

        assertThatThrownBy(() -> service.completeSecondFactor(secret.value(), codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);

        assertThat(factor.lastUsedStep()).isNotEqualTo(OptionalLong.of(Totp.stepAt(NOW)));
        verify(secondFactors, never()).save(any());
        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a challenge another request completes at the same moment, when the second factor is completed with the right code, then no second session opens")
    void should_refuse_challenge_when_second_factor_completed_given_challenge_spent_concurrently() {
        LinkSecret secret = LinkSecret.generate();
        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        when(challenges.findBySecretHash(secret.hash())).thenReturn(Optional.of(challenge));
        when(donors.findById(donor.id())).thenReturn(Optional.of(donor));
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(enabledFactor()));
        when(challenges.reserveAttempt(challenge.id(), NOW, CHALLENGE_ATTEMPTS)).thenReturn(true);
        when(challenges.markUsed(challenge.id(), NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.completeSecondFactor(secret.value(), codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);

        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a live challenge and a wrong code, when the second factor is completed, then the attempt is counted on the challenge and no session opens")
    void should_count_attempt_and_refuse_when_second_factor_completed_given_wrong_code() {
        LinkSecret secret = LinkSecret.generate();
        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        when(challenges.findBySecretHash(secret.hash())).thenReturn(Optional.of(challenge));
        when(donors.findById(donor.id())).thenReturn(Optional.of(donor));
        when(secondFactors.findByDonor(donor.id())).thenReturn(Optional.of(enabledFactor()));
        when(challenges.reserveAttempt(challenge.id(), NOW, CHALLENGE_ATTEMPTS)).thenReturn(true);

        assertThatThrownBy(() -> service.completeSecondFactor(secret.value(), "000000")).isInstanceOf(InvalidSecondFactorCode.class);

        verify(challenges).reserveAttempt(challenge.id(), NOW, CHALLENGE_ATTEMPTS);
        verify(challenges, never()).markUsed(any(), any());
        verify(secondFactors, never()).save(any());
        verify(sessions, never()).open(any(), anyBoolean());
    }

    @Test
    @DisplayName("Given a challenge that is expired, spent or out of attempts, when the second factor is completed, then the challenge is refused before any code is checked")
    void should_refuse_challenge_when_second_factor_completed_given_unusable_challenge() {
        LinkSecret expired = LinkSecret.generate();
        when(challenges.findBySecretHash(expired.hash()))
                .thenReturn(Optional.of(SecondFactorChallenge.issue(expired, donor.id(), NOW.minus(CHALLENGE_TTL), CHALLENGE_TTL)));
        LinkSecret spent = LinkSecret.generate();
        SecondFactorChallenge used = SecondFactorChallenge.issue(spent, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        used.markUsed(NOW.minusSeconds(30));
        when(challenges.findBySecretHash(spent.hash())).thenReturn(Optional.of(used));
        LinkSecret exhausted = LinkSecret.generate();
        SecondFactorChallenge failed = SecondFactorChallenge.issue(exhausted, donor.id(), NOW.minusSeconds(60), CHALLENGE_TTL);
        for (int attempt = 0; attempt < CHALLENGE_ATTEMPTS; attempt++) {
            failed.recordFailedAttempt();
        }
        when(challenges.findBySecretHash(exhausted.hash())).thenReturn(Optional.of(failed));

        assertThatThrownBy(() -> service.completeSecondFactor(expired.value(), codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);
        assertThatThrownBy(() -> service.completeSecondFactor(spent.value(), codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);
        assertThatThrownBy(() -> service.completeSecondFactor(exhausted.value(), codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);
        assertThatThrownBy(() -> service.completeSecondFactor("not a challenge", codeAt(NOW))).isInstanceOf(InvalidSecondFactorChallenge.class);

        verifyNoInteractions(secondFactors, sessions);
    }

    private SecondFactor enabledFactor() {
        return SecondFactor.reconstitute(donor.id(), SECRET, NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofDays(1)), Totp.stepAt(NOW.minus(Duration.ofDays(1))));
    }

    private static String codeAt(Instant at) {
        return Totp.codeAt(SECRET, Totp.stepAt(at));
    }
}
