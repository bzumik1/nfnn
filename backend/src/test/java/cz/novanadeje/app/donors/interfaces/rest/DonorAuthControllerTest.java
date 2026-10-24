package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorAuthenticationService;
import cz.novanadeje.app.donors.application.DonorPasskeySignInService;
import cz.novanadeje.app.donors.application.DonorRegistrationService;
import cz.novanadeje.app.donors.application.SecondFactorRecoveryService;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class DonorAuthControllerTest {

    private static final String ADDRESS = "203.0.113.7";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final DonorRegistrationService registration = mock(DonorRegistrationService.class);
    private final DonorAuthenticationService authentication = mock(DonorAuthenticationService.class);
    private final SignInRateLimiter signInLimiter = new SignInRateLimiter(clock);
    private final SecondFactorRateLimiter secondFactorLimiter = new SecondFactorRateLimiter(clock);
    private final RegistrationRateLimiter registrationLimiter = new RegistrationRateLimiter(clock);
    private final DonorPasskeySignInService passkeySignIn = mock(DonorPasskeySignInService.class);
    private final PasskeySignInRateLimiter passkeySignInLimiter = new PasskeySignInRateLimiter(clock);
    private final SecondFactorRecoveryService recoveries = mock(SecondFactorRecoveryService.class);
    private final DonorAuthController controller = new DonorAuthController(registration, authentication, passkeySignIn, recoveries, signInLimiter,
            secondFactorLimiter, registrationLimiter, passkeySignInLimiter, clock);

    @Test
    @DisplayName("Given the address used up its sign-ins, when it signs in again, then it is refused before any password is hashed")
    void should_refuse_without_authenticating_when_signing_in_given_sign_ins_used_up() {
        for (int i = 0; i < 10; i++) {
            signInLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.login(new LoginRequest("jana@example.cz", "correct horse battery"), requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(authentication, registration);
    }

    @Test
    @DisplayName("Given the address used up its second-factor attempts, when it sends a code again, then it is refused before the challenge is looked at")
    void should_refuse_without_authenticating_when_completing_second_factor_given_attempts_used_up() {
        for (int i = 0; i < 10; i++) {
            secondFactorLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.completeSecondFactor(new SecondFactorLoginRequest("c".repeat(43), "123456"), requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(authentication, registration);
    }

    @Test
    @DisplayName("Given the address used up its second-factor attempts, when it starts a recovery by payment, then it is refused before the challenge is looked at")
    void should_refuse_without_opening_a_recovery_when_starting_it_given_attempts_used_up() {
        for (int i = 0; i < 10; i++) {
            secondFactorLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.startSecondFactorRecovery(new SecondFactorRecoveryRequest("c".repeat(43)), requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(recoveries, authentication);
    }

    @Test
    @DisplayName("Given the address used up its registrations, when it registers again, then it is refused before any registration work")
    void should_refuse_without_registering_when_registering_given_registrations_used_up() {
        for (int i = 0; i < 5; i++) {
            registrationLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.register(registrationRequest(), requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(registration, authentication);
    }

    private static RegisterDonorRequest registrationRequest() {
        return new RegisterDonorRequest(DonorType.PERSON, "Jana Nováková", null, new AddressRequest("Dlouhá 12", "Ústí nad Labem", "400 01"),
                "jana@example.cz", "correct horse battery", "cs", null);
    }

    private static MockHttpServletRequest requestFrom(String address) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(address);
        return request;
    }
}
