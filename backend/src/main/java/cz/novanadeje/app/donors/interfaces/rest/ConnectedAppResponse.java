package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.ConnectedAppView;
import cz.novanadeje.app.donors.domain.OAuthScope;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record ConnectedAppResponse(UUID id, String client, List<String> scopes, Instant grantedAt, Instant lastUsedAt, Instant expiresAt) {

    static ConnectedAppResponse of(ConnectedAppView view) {
        return new ConnectedAppResponse(view.id(), view.client(), view.scopes().stream().map(OAuthScope::value).sorted().toList(), view.grantedAt(),
                view.lastUsedAt(), view.expiresAt());
    }
}
