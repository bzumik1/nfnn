package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.live.LiveOpening;
import cz.novanadeje.app.shared.infrastructure.live.LiveStreamHub;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.ErrorResponseException;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LiveControllerTest {

    private static final Instant NOW = Instant.parse("2026-11-05T09:00:00Z");

    @Test
    @DisplayName("Given a hub that is starting or stopping, when a stream is asked for, then the answer is 503, so the app retries later instead of refreshing a session that did not end")
    void should_answer_503_when_stream_requested_given_hub_not_running() {
        LiveStreamHub hub = mock(LiveStreamHub.class);
        when(hub.open(any(), any())).thenReturn(new LiveOpening.Unavailable<>());
        Jwt token = Jwt.withTokenValue("token").header("alg", "HS256").subject(UUID.randomUUID().toString())
                .issuedAt(NOW).expiresAt(NOW.plusSeconds(900)).build();

        ErrorResponseException refused = catchThrowableOfType(ErrorResponseException.class, () -> new LiveController(hub).stream(token));

        assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(refused.getBody().getType()).hasToString("https://nfnn.cz/problems/live-unavailable");
    }
}
