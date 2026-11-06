package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdministrationDeviceService;
import cz.novanadeje.app.donors.domain.DonorId;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/donors/devices/current")
class AdminCurrentDeviceController {

    private final AdministrationDeviceService devices;
    private final AdministrationUnlockRateLimiter unlockRateLimiter;

    AdminCurrentDeviceController(AdministrationDeviceService devices, AdministrationUnlockRateLimiter unlockRateLimiter) {
        this.devices = devices;
        this.unlockRateLimiter = unlockRateLimiter;
    }

    @PostMapping("/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unlock(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AdministrationUnlockRequest request, HttpServletRequest http) {
        unlockRateLimiter.check(http.getRemoteAddr());
        devices.unlock(DonorId.of(jwt.getSubject()), request.password(), request.secondFactorCode());
    }

    @PostMapping("/administration-copy")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void storedAdministrationCopy(@AuthenticationPrincipal Jwt jwt, HttpServletRequest http) {
        devices.storedCopy(DonorId.of(jwt.getSubject()), SessionDevices.requesting(jwt, http));
    }
}
