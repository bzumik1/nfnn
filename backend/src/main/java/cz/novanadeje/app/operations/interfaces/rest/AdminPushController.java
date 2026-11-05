package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.push.PushSubscriptionService;
import cz.novanadeje.app.operations.domain.push.PushDeviceRequired;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@Validated
@RequestMapping("/api/admin/operations/push")
class AdminPushController {

    static final String SESSION_CLAIM = "sid";
    private static final Pattern DEVICE_ID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private final PushSubscriptionService push;
    private final PushTestRateLimiter testRateLimiter;

    AdminPushController(PushSubscriptionService push, PushTestRateLimiter testRateLimiter) {
        this.push = push;
        this.testRateLimiter = testRateLimiter;
    }

    @GetMapping
    PushResponse view(@AuthenticationPrincipal Jwt jwt) {
        return PushResponse.from(push.view(admin(jwt), sessionDevice(jwt)));
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.CREATED)
    PushResponse.Subscription subscribe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PushSubscriptionRequest request) {
        return PushResponse.Subscription.from(push.subscribe(admin(jwt), device(jwt), request.toEndpoint(), request.toKeys(), request.toAlerts()));
    }

    @DeleteMapping("/subscriptions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        push.remove(admin(jwt), new PushSubscriptionId(id));
    }

    @PutMapping("/subscriptions/{id}/alerts")
    PushResponse.Subscription changeAlerts(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PushAlertsRequest request) {
        return PushResponse.Subscription.from(push.changeAlerts(admin(jwt), new PushSubscriptionId(id), request.toAlerts(), sessionDevice(jwt)));
    }

    @PostMapping("/test")
    PushResponse.TestDelivery test(@AuthenticationPrincipal Jwt jwt, HttpServletRequest http) {
        testRateLimiter.check(http.getRemoteAddr());
        return PushResponse.TestDelivery.from(push.sendTest(admin(jwt)));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private static UUID device(Jwt jwt) {
        return sessionDevice(jwt).orElseThrow(PushDeviceRequired::new);
    }

    private static Optional<UUID> sessionDevice(Jwt jwt) {
        return Optional.ofNullable(jwt.getClaimAsString(SESSION_CLAIM)).filter(session -> DEVICE_ID.matcher(session).matches()).map(UUID::fromString);
    }
}
