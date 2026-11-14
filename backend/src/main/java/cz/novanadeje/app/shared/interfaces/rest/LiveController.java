package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.session.CurrentDevice;
import cz.novanadeje.app.shared.domain.ExpiredAccessToken;
import cz.novanadeje.app.shared.infrastructure.live.LiveOpening;
import cz.novanadeje.app.shared.infrastructure.live.LiveStreamHub;
import cz.novanadeje.app.shared.infrastructure.live.LiveSubscriber;
import cz.novanadeje.app.shared.infrastructure.live.SseLiveConnection;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/live")
class LiveController {

    static final String ACCEL_BUFFERING = "X-Accel-Buffering";
    private static final String ADMIN_ROLE = "ADMIN";

    private final LiveStreamHub hub;

    LiveController(LiveStreamHub hub) {
        this.hub = hub;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    ResponseEntity<SseEmitter> stream(@AuthenticationPrincipal Jwt token, CurrentDevice device) {
        LiveSubscriber subscriber = new LiveSubscriber(UUID.fromString(token.getSubject()), administrator(token),
                device.id(), token.getIssuedAt(), token.getExpiresAt());
        return switch (hub.open(subscriber, SseLiveConnection::new)) {
            case LiveOpening.Opened<SseLiveConnection> opened -> ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .header(ACCEL_BUFFERING, "no")
                    .contentType(MediaType.TEXT_EVENT_STREAM)
                    .body(opened.connection().emitter());
            case LiveOpening.SessionEnded<SseLiveConnection> ended -> throw new ExpiredAccessToken();
            case LiveOpening.Full<SseLiveConnection> full -> throw new RateLimitExceededException(ProblemTypes.of("live-streams-full"));
            case LiveOpening.Unavailable<SseLiveConnection> unavailable -> throw new LiveUnavailableException();
        };
    }

    private static boolean administrator(Jwt token) {
        List<String> roles = token.getClaimAsStringList(JwtProperties.ROLES_CLAIM);
        return roles != null && roles.contains(ADMIN_ROLE);
    }
}
