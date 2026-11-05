package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.RequestingDevice;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;

final class SessionDevices {

    private SessionDevices() {
    }

    static Optional<DeviceId> current(Jwt jwt) {
        return Optional.ofNullable(jwt.getClaimAsString(JwtProperties.SESSION_CLAIM)).map(UUID::fromString).map(DeviceId::new);
    }

    static RequestingDevice requesting(Jwt jwt, HttpServletRequest http) {
        return new RequestingDevice(current(jwt), UserAgentDevice.of(http));
    }
}
