package cz.novanadeje.app.operations.interfaces.rest;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

final class SessionDevices {

    static final String SESSION_CLAIM = "sid";
    private static final Pattern DEVICE_ID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private SessionDevices() {
    }

    static Optional<UUID> of(Jwt jwt) {
        return Optional.ofNullable(jwt.getClaimAsString(SESSION_CLAIM)).filter(session -> DEVICE_ID.matcher(session).matches()).map(UUID::fromString);
    }
}
