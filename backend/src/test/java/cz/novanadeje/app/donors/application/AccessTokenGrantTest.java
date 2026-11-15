package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

class AccessTokenGrantTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final DeviceId DEVICE = DeviceId.newId(NOW);
    private static final Set<Role> ROLES = Set.of(Role.DONOR);
    private static final Set<OAuthScope> SCOPES = Set.of(OAuthScope.ADMIN_READ);
    private static final String AUDIENCE = "https://nfnn.cz/api";

    @Test
    @DisplayName("Given a browser session, when its grant is built, then it names the device and no latest expiry or connected client")
    void should_name_only_the_device_when_built_given_browser_session() {
        AccessTokenGrant grant = new AccessTokenGrant(DONOR, ROLES, AUDIENCE, Set.of(), NOW, Optional.empty(), Optional.empty(), Optional.of(DEVICE));

        assertThat(grant.session()).contains(DEVICE);
        assertThat(grant.latestExpiry()).isEmpty();
        assertThat(grant.connectedClient()).isEmpty();
    }

    @Test
    @DisplayName("Given a token exchanged for the API, when its grant is built, then it names the latest expiry and the connected client and no device")
    void should_name_expiry_and_client_when_built_given_exchanged_token() {
        AccessTokenGrant grant = new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.of(NOW.plusSeconds(300)), Optional.of("claude.ai"),
                Optional.empty());

        assertThat(grant.latestExpiry()).contains(NOW.plusSeconds(300));
        assertThat(grant.connectedClient()).contains("claude.ai");
        assertThat(grant.session()).isEmpty();
    }

    @Test
    @DisplayName("Given a component left null, when the grant is built, then it is refused, absence being an empty optional")
    void should_refuse_when_built_given_null_component() {
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(null, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, null, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, null, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, null, NOW, Optional.empty(), Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, null, Optional.empty(), Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, null, Optional.empty(), Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), null, Optional.empty()));
        assertThatNullPointerException().isThrownBy(() -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), null));
    }
}
