package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.ConnectedAppsService;
import cz.novanadeje.app.donors.domain.DonorId;
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
@RequestMapping("/api/donors/me/connections")
class ConnectedAppsController {

    private final ConnectedAppsService connections;

    ConnectedAppsController(ConnectedAppsService connections) {
        this.connections = connections;
    }

    @GetMapping
    ConnectedAppListResponse list(@AuthenticationPrincipal Jwt jwt) {
        return ConnectedAppListResponse.of(connections.list(DonorId.of(jwt.getSubject())));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        connections.disconnect(DonorId.of(jwt.getSubject()), id);
    }
}
