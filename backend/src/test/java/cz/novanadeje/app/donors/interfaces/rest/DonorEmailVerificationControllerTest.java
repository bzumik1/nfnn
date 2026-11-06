package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorEmailVerificationService;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

class DonorEmailVerificationControllerTest {

    private static final String ADDRESS = "203.0.113.7";

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"), ZoneId.of("Europe/Prague"));
    private final DonorEmailVerificationService emailVerification = mock(DonorEmailVerificationService.class);
    private final EmailVerificationRateLimiter limiter = new EmailVerificationRateLimiter(clock);
    private final DonorEmailVerificationController controller = new DonorEmailVerificationController(emailVerification, limiter, clock);

    @Test
    @DisplayName("Given the address used up its verification requests, when it asks again, then it is refused before any lookup")
    void should_refuse_without_lookup_when_requesting_given_requests_used_up() {
        for (int i = 0; i < 5; i++) {
            limiter.check(ADDRESS);
        }

        assertThatThrownBy(() -> controller.request(new EmailVerificationRequest("jana@example.cz", null), requestFrom(ADDRESS)))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(emailVerification);
    }

    @Test
    @DisplayName("Given a confirmation link opened in a browser tab, when it is confirmed for this browser session, then the session it opens is a browser session")
    void should_open_a_browser_session_when_confirming_given_the_browser_session_kind() {
        String token = "t".repeat(43);
        when(emailVerification.confirm(any(), any(), any())).thenThrow(new IllegalStateException("stop after the call"));

        assertThatThrownBy(() -> controller.confirm(new EmailVerificationConfirmation(token, SessionKind.BROWSER), requestFrom(ADDRESS)))
                .isInstanceOf(IllegalStateException.class);

        verify(emailVerification).confirm(eq(token), any(), eq(SessionKind.BROWSER));
    }

    private static MockHttpServletRequest requestFrom(String address) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(address);
        return request;
    }
}
