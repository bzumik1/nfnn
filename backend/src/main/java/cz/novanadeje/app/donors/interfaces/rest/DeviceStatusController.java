package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DeviceStatusService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donors/devices/status")
class DeviceStatusController {

    private final DeviceStatusService statuses;
    private final DeviceStatusRateLimiter rateLimiter;

    DeviceStatusController(DeviceStatusService statuses, DeviceStatusRateLimiter rateLimiter) {
        this.statuses = statuses;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    ResponseEntity<DeviceStatusResponse> status(@Valid @RequestBody DeviceStatusRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(DeviceStatusResponse.of(statuses.statusOf(request.secret())));
    }
}
