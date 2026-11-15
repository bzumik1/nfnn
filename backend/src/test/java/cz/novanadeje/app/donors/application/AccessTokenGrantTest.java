package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

class AccessTokenGrantTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final DeviceId DEVICE = DeviceId.newId(NOW);
    private static final Set<Role> ROLES = Set.of(Role.DONOR);
    private static final Set<OAuthScope> SCOPES = Set.of(OAuthScope.ADMIN_READ);
    private static final String AUDIENCE = "https://nfnn.cz/api";

    @Test
    @DisplayName("Given a browser session, a connected application's token and one exchanged for the API, when their grants are built, then each is accepted")
    void should_accept_each_kind_when_built_given_its_components() {
        assertThat(new AccessTokenGrant(DONOR, ROLES, AUDIENCE, Set.of(), NOW, Optional.empty(), Optional.empty(), Optional.of(DEVICE)).session())
                .contains(DEVICE);
        assertThat(new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.of("claude.ai"), Optional.empty())
                .connectedClient()).contains("claude.ai");
        assertThat(new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.of(NOW.plusSeconds(300)), Optional.of("claude.ai"),
                Optional.empty()).latestExpiry()).contains(NOW.plusSeconds(300));
    }

    @Test
    @DisplayName("Given scopes without a connected client, when the grant is built, then it is refused, as only a connected application's token carries scopes")
    void should_refuse_when_built_given_scopes_without_a_client() {
        assertThatIllegalStateException().isThrownBy(
                () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty()));
    }

    @Test
    @DisplayName("Given a connected client without scopes, when the grant is built, then it is refused, as a connected application's token always carries scopes")
    void should_refuse_when_built_given_a_client_without_scopes() {
        assertThatIllegalStateException().isThrownBy(
                () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, Set.of(), NOW, Optional.empty(), Optional.of("claude.ai"), Optional.empty()));
    }

    @Test
    @DisplayName("Given a device and a connected client together, when the grant is built, then it is refused, as a token is either a browser session's or a connected application's")
    void should_refuse_when_built_given_a_device_and_a_client() {
        assertThatIllegalStateException().isThrownBy(
                () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.of("claude.ai"), Optional.of(DEVICE)));
    }

    @Test
    @DisplayName("Given a latest expiry without a connected client, when the grant is built, then it is refused, as only an exchanged connector token is capped")
    void should_refuse_when_built_given_a_latest_expiry_without_a_client() {
        assertThatIllegalStateException().isThrownBy(
                () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, Set.of(), NOW, Optional.of(NOW.plusSeconds(300)), Optional.empty(), Optional.of(DEVICE)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("grantsWithANullComponent")
    @DisplayName("Given a component left null, when the grant is built, then it is refused, absence being an empty optional")
    void should_refuse_when_built_given_null_component(String component, ThrowingCallable built) {
        assertThatNullPointerException().isThrownBy(built).withMessage(component);
    }

    static Stream<Arguments> grantsWithANullComponent() {
        return Stream.of(
                Arguments.of("donorId", (ThrowingCallable) () -> new AccessTokenGrant(null, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty())),
                Arguments.of("roles", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, null, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty())),
                Arguments.of("audience", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, null, SCOPES, NOW, Optional.empty(), Optional.empty(), Optional.empty())),
                Arguments.of("scopes", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, null, NOW, Optional.empty(), Optional.empty(), Optional.empty())),
                Arguments.of("issuedAt", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, null, Optional.empty(), Optional.empty(), Optional.empty())),
                Arguments.of("latestExpiry", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, null, Optional.empty(), Optional.empty())),
                Arguments.of("connectedClient", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), null, Optional.empty())),
                Arguments.of("session", (ThrowingCallable) () -> new AccessTokenGrant(DONOR, ROLES, AUDIENCE, SCOPES, NOW, Optional.empty(), Optional.empty(), null)));
    }
}
