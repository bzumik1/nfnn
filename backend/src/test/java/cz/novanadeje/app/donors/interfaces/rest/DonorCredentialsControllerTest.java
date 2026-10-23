package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorCredentialsService;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class DonorCredentialsControllerTest {

    private static final String ADDRESS = "203.0.113.7";
    private static final Jwt JWT = Jwt.withTokenValue("token").header("alg", "HS256").subject("01a18e56-bdb0-775a-bd0a-a60756831369")
            .claim("roles", "DONOR").build();

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-22T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final DonorCredentialsService credentials = mock(DonorCredentialsService.class);
    private final PasswordChangeRateLimiter passwordLimiter = new PasswordChangeRateLimiter(clock);
    private final EmailChangeRateLimiter emailLimiter = new EmailChangeRateLimiter(clock);
    private final DonorCredentialsController controller = new DonorCredentialsController(credentials, passwordLimiter, emailLimiter, clock);

    @Test
    @DisplayName("Given the address used up its password changes, when it tries again, then it is refused before any hashing")
    void should_refuse_without_hashing_when_changing_password_given_attempts_used_up() {
        for (int i = 0; i < 10; i++) {
            passwordLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.changePassword(JWT, new ChangePasswordRequest("correct horse battery", null, "a brand new passphrase"),
                requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(credentials);
    }

    @Test
    @DisplayName("Given the address used up its e-mail change requests, when it asks again, then it is refused before any work")
    void should_refuse_without_work_when_requesting_email_change_given_requests_used_up() {
        for (int i = 0; i < 5; i++) {
            emailLimiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.requestEmailChange(JWT, new EmailChangeRequest("jana.nova@example.cz", "correct horse battery", null),
                requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(credentials);
    }

    private static MockHttpServletRequest requestFrom(String address) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(address);
        return request;
    }
}
