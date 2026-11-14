package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.push.DonorPushService;
import cz.novanadeje.app.operations.domain.push.PushDeviceRequired;
import cz.novanadeje.app.shared.application.session.CurrentDevice;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/operations/push")
class DonorPushController {

    private final DonorPushService push;
    private final DonorPushTestRateLimiter testRateLimiter;

    DonorPushController(DonorPushService push, DonorPushTestRateLimiter testRateLimiter) {
        this.push = push;
        this.testRateLimiter = testRateLimiter;
    }

    @GetMapping
    DonorPushResponse view(@AuthenticationPrincipal Jwt jwt, CurrentDevice device) {
        return DonorPushResponse.from(push.view(donor(jwt), device.id()));
    }

    @PutMapping("/device")
    DonorPushResponse.Device subscribe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DonorPushDeviceRequest request, CurrentDevice device) {
        return DonorPushResponse.Device.from(push.subscribe(donor(jwt), required(device), request.toEndpoint(), request.toKeys(), request.toNotifications()));
    }

    @PutMapping("/device/notifications")
    DonorPushResponse.Device changeNotifications(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DonorNotificationsRequest request, CurrentDevice device) {
        return DonorPushResponse.Device.from(push.changeNotifications(donor(jwt), required(device), request.toNotifications()));
    }

    @DeleteMapping("/device")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, CurrentDevice device) {
        push.remove(donor(jwt), required(device));
    }

    @PostMapping("/test")
    PushResponse.TestDelivery test(@AuthenticationPrincipal Jwt jwt, HttpServletRequest http, CurrentDevice device) {
        UUID requested = required(device);
        testRateLimiter.check(http.getRemoteAddr());
        return PushResponse.TestDelivery.from(push.sendTest(donor(jwt), requested));
    }

    private static UUID donor(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    private static UUID required(CurrentDevice device) {
        return device.id().orElseThrow(PushDeviceRequired::new);
    }
}
