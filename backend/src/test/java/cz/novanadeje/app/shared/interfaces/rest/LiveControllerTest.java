package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.infrastructure.live.LiveOpening;
import cz.novanadeje.app.shared.infrastructure.live.LiveStreamHub;
import cz.novanadeje.app.shared.infrastructure.live.LiveSubscriber;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.ErrorResponseException;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
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

    @Test
    @DisplayName("Given a hub that is starting or stopping, when the refusal is rendered, then it carries a Czech and an English title and detail like every other problem")
    void should_carry_czech_and_english_texts_when_refusal_rendered_given_hub_not_running() {
        LiveStreamHub hub = mock(LiveStreamHub.class);
        when(hub.open(any(), any())).thenReturn(new LiveOpening.Unavailable<>());
        Jwt token = Jwt.withTokenValue("token").header("alg", "HS256").subject(UUID.randomUUID().toString())
                .issuedAt(NOW).expiresAt(NOW.plusSeconds(900)).build();
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);

        ErrorResponseException refused = catchThrowableOfType(ErrorResponseException.class, () -> new LiveController(hub).stream(token));

        assertThat(refused.updateAndGetBody(messages, Locale.forLanguageTag("cs")).getTitle()).isEqualTo("Živé změny teď nejdou");
        assertThat(refused.updateAndGetBody(messages, Locale.forLanguageTag("cs")).getDetail()).isEqualTo("Server se právě spouští nebo zastavuje. Stránka se připojí znovu sama.");
        assertThat(refused.updateAndGetBody(messages, Locale.ENGLISH).getTitle()).isEqualTo("Live updates are unavailable");
        assertThat(refused.updateAndGetBody(messages, Locale.ENGLISH).getDetail()).isEqualTo("The server is starting or stopping. The page reconnects by itself.");
    }

    @Test
    @DisplayName("Given a browser token of a signed-in device, when a stream is asked for, then the hub is handed the donor, the device and the token's times, so signing that device out closes the stream")
    void should_hand_device_to_hub_when_stream_requested_given_token_with_session() {
        LiveStreamHub hub = mock(LiveStreamHub.class);
        when(hub.open(any(), any())).thenReturn(new LiveOpening.Unavailable<>());
        UUID donor = UUID.randomUUID();
        UUID device = UUID.randomUUID();
        Jwt token = Jwt.withTokenValue("token").header("alg", "HS256").subject(donor.toString())
                .claim(JwtProperties.ROLES_CLAIM, List.of()).claim(JwtProperties.SESSION_CLAIM, device.toString())
                .issuedAt(NOW).expiresAt(NOW.plusSeconds(900)).build();
        ArgumentCaptor<LiveSubscriber> subscriber = ArgumentCaptor.forClass(LiveSubscriber.class);

        catchThrowableOfType(ErrorResponseException.class, () -> new LiveController(hub).stream(token));

        verify(hub).open(subscriber.capture(), any());
        assertThat(subscriber.getValue()).isEqualTo(new LiveSubscriber(donor, false, Optional.of(device), NOW, NOW.plusSeconds(900)));
    }
}
