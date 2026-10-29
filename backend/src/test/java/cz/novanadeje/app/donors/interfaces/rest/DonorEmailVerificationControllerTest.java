package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorEmailVerificationService;
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

    private static MockHttpServletRequest requestFrom(String address) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(address);
        return request;
    }
}
