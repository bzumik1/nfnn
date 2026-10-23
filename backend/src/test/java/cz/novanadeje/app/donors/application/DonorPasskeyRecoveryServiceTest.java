package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AdministratorRecoveryRefused;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasswordResetToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRequired;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
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
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorPasskeyRecoveryServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(3600));
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private PasswordResetTokenRepository tokens;
    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private ApplicationEventPublisher events;

    private DonorPasskeyRecoveryService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        DonorPasskeyService passkeyService = new DonorPasskeyService(donors, passkeys, challenges,
                new DonorConfirmations(passwordHasher, passkeys, challenges, ceremonies, clock), ceremonies,
                new PasskeyProperties(Duration.ofMinutes(5), 10, "Nová naděje"), new SecondFactorSessionGuard(secondFactors, passkeys), events,
                clock);
        service = new DonorPasskeyRecoveryService(tokens, donors, secondFactors, refreshTokens, passkeyService, clock);
    }

    @Test
    @DisplayName("Given a live link of a donor without the code from the app, when a new passkey is asked for, then a registration challenge for that donor is issued")
    void should_issue_registration_challenge_when_new_passkey_asked_for_given_live_link_and_no_code() {
        LinkSecret link = liveLinkOf(donor());
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());
        when(passkeys.findByDonor(DONOR)).thenReturn(List.of());
        when(ceremonies.relyingPartyId()).thenReturn("nfnn.cz");
        when(ceremonies.algorithms()).thenReturn(List.of(-7));

        PasskeyCreationOptions options = service.options(link.value(), null);

        assertThat(options.relyingPartyId()).isEqualTo("nfnn.cz");
        verify(challenges).save(any(PasskeyChallenge.class));
        verify(tokens, never()).markUsed(any(), any());
    }

    @Test
    @DisplayName("Given the code from the app is on, when a new passkey is asked for without a code or with a wrong one, then it is refused and no challenge is issued")
    void should_refuse_when_new_passkey_asked_for_given_code_on_and_missing_or_wrong() {
        LinkSecret link = liveLinkOf(donor());
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.reconstitute(DONOR, SECRET, NOW.minusSeconds(600),
                NOW.minusSeconds(540), null)));

        assertThatThrownBy(() -> service.options(link.value(), null)).isInstanceOf(SecondFactorCodeRequired.class);
        assertThatThrownBy(() -> service.options(link.value(), " ")).isInstanceOf(SecondFactorCodeRequired.class);
        assertThatThrownBy(() -> service.options(link.value(), wrongCode())).isInstanceOf(SecondFactorCodeRejected.class);

        verifyNoInteractions(challenges);
    }

    @Test
    @DisplayName("Given an administrator's live link, when a new passkey is asked for or added, then it is refused and the link stays unused")
    void should_refuse_when_passkey_recovered_given_administrator() {
        Donor administrator = donor();
        administrator.grantAdministration();
        LinkSecret link = liveLinkOf(administrator);

        assertThatThrownBy(() -> service.options(link.value(), null)).isInstanceOf(AdministratorRecoveryRefused.class);
        assertThatThrownBy(() -> service.recover(link.value(), LinkSecret.generate().value(), "iPhone", null))
                .isInstanceOf(AdministratorRecoveryRefused.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(challenges, secondFactors, refreshTokens);
    }

    @Test
    @DisplayName("Given an unknown or expired link, when a new passkey is asked for, then the link is invalid")
    void should_report_invalid_link_when_new_passkey_asked_for_given_unknown_or_expired_link() {
        LinkSecret unknown = LinkSecret.generate();
        when(tokens.findBySecretHash(unknown.hash())).thenReturn(Optional.empty());
        LinkSecret expired = LinkSecret.generate();
        when(tokens.findBySecretHash(expired.hash()))
                .thenReturn(Optional.of(PasswordResetToken.issue(expired, DONOR, NOW.minus(Duration.ofHours(2)), Duration.ofHours(1))));

        assertThatThrownBy(() -> service.options(unknown.value(), null)).isInstanceOf(InvalidPasswordResetToken.class);
        assertThatThrownBy(() -> service.options(expired.value(), null)).isInstanceOf(InvalidPasswordResetToken.class);

        verifyNoInteractions(donors, challenges);
    }

    private LinkSecret liveLinkOf(Donor donor) {
        LinkSecret link = LinkSecret.generate();
        when(tokens.findBySecretHash(link.hash()))
                .thenReturn(Optional.of(PasswordResetToken.issue(link, DONOR, NOW.minusSeconds(60), Duration.ofHours(1))));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        return link;
    }

    private static String wrongCode() {
        long step = Totp.stepAt(NOW);
        List<String> accepted = List.of(Totp.codeAt(SECRET, step - 1), Totp.codeAt(SECRET, step), Totp.codeAt(SECRET, step + 1));
        return IntStream.range(0, 4).mapToObj(n -> "00000" + n).filter(code -> !accepted.contains(code)).findFirst().orElseThrow();
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), null, new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(3600));
        donor.verifyEmail(NOW.minusSeconds(3000));
        return donor;
    }
}
