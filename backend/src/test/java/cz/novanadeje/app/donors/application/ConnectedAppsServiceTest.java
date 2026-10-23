package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ConnectedAppNotFound;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectedAppsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW);
    private static final DonorId PETR = DonorId.newId(NOW.plusSeconds(1));
    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    @Mock
    private RefreshTokenRepository refreshTokens;

    private final RefreshToken connection = RefreshToken.issueForClient(RefreshTokenSecret.generate(), JANA, CLAUDE,
            Set.of(OAuthScope.ADMIN_READ), NOW.minus(Duration.ofDays(3)), NOW.minus(Duration.ofHours(2)), Duration.ofDays(14));

    private ConnectedAppsService service() {
        return new ConnectedAppsService(refreshTokens, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a usable connector token, when the donor lists connections, then the client host, scopes and dates are shown")
    void should_list_connections_when_listed_given_usable_client_token() {
        when(refreshTokens.findUsableClientTokensOf(JANA, NOW)).thenReturn(List.of(connection));

        List<ConnectedAppView> views = service().list(JANA);

        assertThat(views).containsExactly(new ConnectedAppView(connection.id(), "claude.ai", Set.of(OAuthScope.ADMIN_READ), NOW.minus(Duration.ofDays(3)),
                NOW.minus(Duration.ofHours(2)), connection.expiresAt()));
    }

    @Test
    @DisplayName("Given the donor's own connection, when it is disconnected, then the token is revoked")
    void should_revoke_when_disconnected_given_own_connection() {
        when(refreshTokens.findById(connection.id())).thenReturn(Optional.of(connection));

        service().disconnect(JANA, connection.id());

        assertThat(connection.isRevoked()).isTrue();
        verify(refreshTokens).save(connection);
    }

    @Test
    @DisplayName("Given another donor's connection, when it is disconnected, then it is not found")
    void should_not_find_when_disconnected_given_other_donors_connection() {
        when(refreshTokens.findById(connection.id())).thenReturn(Optional.of(connection));

        assertThatThrownBy(() -> service().disconnect(PETR, connection.id())).isInstanceOf(ConnectedAppNotFound.class);

        verify(refreshTokens, never()).save(any());
    }

    @Test
    @DisplayName("Given a browser session token, when it is disconnected as a connection, then it is not found")
    void should_not_find_when_disconnected_given_browser_token() {
        RefreshToken browser = RefreshToken.issue(RefreshTokenSecret.generate(), JANA, NOW, Duration.ofDays(14), true);
        when(refreshTokens.findById(browser.id())).thenReturn(Optional.of(browser));

        assertThatThrownBy(() -> service().disconnect(JANA, browser.id())).isInstanceOf(ConnectedAppNotFound.class);
    }
}
