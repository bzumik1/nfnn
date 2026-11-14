package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.push.PushSubscriptionService;
import cz.novanadeje.app.operations.domain.push.PushDeviceRequired;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.shared.application.session.CurrentDevice;
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

import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/admin/operations/push")
class AdminPushController {


    private final PushSubscriptionService push;
    private final PushTestRateLimiter testRateLimiter;

    AdminPushController(PushSubscriptionService push, PushTestRateLimiter testRateLimiter) {
        this.push = push;
        this.testRateLimiter = testRateLimiter;
    }

    @GetMapping
    PushResponse view(@AuthenticationPrincipal Jwt jwt, CurrentDevice device) {
        return PushResponse.from(push.view(admin(jwt), device.id()));
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.CREATED)
    PushResponse.Subscription subscribe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PushSubscriptionRequest request, CurrentDevice device) {
        return PushResponse.Subscription.from(push.subscribe(admin(jwt), required(device), request.toEndpoint(), request.toKeys(), request.toAlerts()));
    }

    @DeleteMapping("/subscriptions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        push.remove(admin(jwt), new PushSubscriptionId(id));
    }

    @PutMapping("/subscriptions/{id}/alerts")
    PushResponse.Subscription changeAlerts(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PushAlertsRequest request,
                                            CurrentDevice device) {
        return PushResponse.Subscription.from(push.changeAlerts(admin(jwt), new PushSubscriptionId(id), request.toAlerts(), device.id()));
    }

    @PostMapping("/test")
    PushResponse.TestDelivery test(@AuthenticationPrincipal Jwt jwt, HttpServletRequest http) {
        testRateLimiter.check(http.getRemoteAddr());
        return PushResponse.TestDelivery.from(push.sendTest(admin(jwt)));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private static UUID required(CurrentDevice device) {
        return device.id().orElseThrow(PushDeviceRequired::new);
    }
}
