package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.donors.infrastructure.config.CommonPasswords;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministrationDeviceServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-13T10:00:00Z");
    private static final DonorId ADMIN = DonorId.newId(NOW.minusSeconds(3600));
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String PASSWORD = "correct horse battery";
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;
    @Mock
    private WrongSecondFactorCodeCount wrongCodes;
    @Mock
    private ApplicationEventPublisher events;

    private final OpenTransactions transactions = new OpenTransactions();
    private AdministrationDeviceService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        service = new AdministrationDeviceService(donors, secondFactors,
                new DonorConfirmations(passwordHasher, CommonPasswords.POLICY, passkeys, challenges, ceremonies, transactions, clock),
                new SecondFactorCodes(secondFactors, wrongCodes), events, clock, transactions);
    }

    @Test
    @DisplayName("Given the right password and code, when the device copy is unlocked, then the password is compared with no transaction open and the code is checked in one")
    void should_compare_outside_transaction_and_check_code_inside_when_unlocked_given_right_password_and_code() {
        when(donors.findById(ADMIN)).thenReturn(Optional.of(administrator(HASH)));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenAnswer(invocation -> transactions.recordingHashing(true));
        when(secondFactors.findByDonor(ADMIN)).thenAnswer(invocation -> {
            assertThat(transactions.open()).isEqualTo(1);
            return Optional.of(enabledFactor());
        });
        when(secondFactors.recordUse(any())).thenReturn(true);

        service.unlock(ADMIN, PASSWORD, codeAt(NOW));

        assertThat(transactions.openWhenHashing()).containsExactly(0);
        assertThat(transactions.open()).isZero();
        assertThat(transactions.rolledBack()).isZero();
    }

    @Test
    @DisplayName("Given the right password and a wrong code, when the device copy is unlocked, then the code is rejected and the refusal commits, so it stays counted")
    void should_reject_and_commit_when_unlocked_given_wrong_code() {
        when(donors.findById(ADMIN)).thenReturn(Optional.of(administrator(HASH)));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(ADMIN)).thenReturn(Optional.of(enabledFactor()));

        assertThatThrownBy(() -> service.unlock(ADMIN, PASSWORD, "000000")).isInstanceOf(SecondFactorCodeRejected.class);

        verify(wrongCodes).reserve(ADMIN, NOW);
        assertThat(transactions.rolledBack()).isZero();
        assertThat(transactions.committed()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a password changed by another request after it was compared, when the device copy is unlocked, then it is refused as a wrong password before the code is checked")
    void should_refuse_before_code_when_unlocked_given_hash_changed_since_comparison() {
        when(donors.findById(ADMIN)).thenReturn(Optional.of(administrator(HASH)), Optional.of(administrator(new PasswordHash("$meanwhile"))));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.unlock(ADMIN, PASSWORD, codeAt(NOW))).isInstanceOf(WrongPassword.class);

        verifyNoInteractions(secondFactors, wrongCodes);
    }

    private static SecondFactor enabledFactor() {
        return SecondFactor.reconstitute(ADMIN, SECRET, NOW.minusSeconds(600), NOW.minusSeconds(600), Totp.stepAt(NOW.minusSeconds(600)));
    }

    private static String codeAt(Instant at) {
        return Totp.codeAt(SECRET, Totp.stepAt(at));
    }

    private static Donor administrator(PasswordHash hash) {
        Donor administrator = Donor.register(ADMIN, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), hash, new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(3600));
        administrator.verifyEmail(NOW.minusSeconds(3000));
        administrator.grantAdministration(true);
        return administrator;
    }
}
