package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthScopeTest {

    @Test
    void should_parse_space_separated_scopes_when_parsed_given_known_values() {
        assertThat(OAuthScope.parse("admin:read")).containsExactly(OAuthScope.ADMIN_READ);
        assertThat(OAuthScope.parse("  admin:read   admin:read ")).containsExactly(OAuthScope.ADMIN_READ);
        assertThat(OAuthScope.parse("admin:write admin:read")).containsExactlyInAnyOrder(OAuthScope.ADMIN_READ, OAuthScope.ADMIN_WRITE);
    }

    @Test
    void should_refuse_when_parsed_given_an_unknown_or_empty_scope() {
        assertThatThrownBy(() -> OAuthScope.parse("admin:delete")).isInstanceOf(InvalidAuthorizationRequest.class);
        assertThatThrownBy(() -> OAuthScope.parse("")).isInstanceOf(InvalidAuthorizationRequest.class);
        assertThatThrownBy(() -> OAuthScope.parse(null)).isInstanceOf(InvalidAuthorizationRequest.class);
    }

    @Test
    void should_format_scopes_in_their_declared_order_when_formatted() {
        assertThat(OAuthScope.format(Set.of(OAuthScope.ADMIN_READ))).isEqualTo("admin:read");
        assertThat(OAuthScope.format(Set.of(OAuthScope.ADMIN_WRITE, OAuthScope.ADMIN_READ))).isEqualTo("admin:read admin:write");
        assertThat(OAuthScope.format(Set.of())).isEmpty();
    }
}
