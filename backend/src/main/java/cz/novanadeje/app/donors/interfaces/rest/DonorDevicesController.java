package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorDevicesService;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.application.session.CurrentDevice;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/donors/me/devices")
class DonorDevicesController {

    private final DonorDevicesService devices;

    DonorDevicesController(DonorDevicesService devices) {
        this.devices = devices;
    }

    @GetMapping
    DeviceListResponse list(@AuthenticationPrincipal Jwt jwt, CurrentDevice device) {
        return DeviceListResponse.of(devices.list(DonorId.of(jwt.getSubject()), SessionDevices.current(device)));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void signOut(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        devices.signOut(DonorId.of(jwt.getSubject()), new DeviceId(id));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void signOutOthers(@AuthenticationPrincipal Jwt jwt, CurrentDevice device) {
        devices.signOutOthers(DonorId.of(jwt.getSubject()), SessionDevices.current(device));
    }
}
