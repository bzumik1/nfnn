package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.lang.reflect.Method;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class AdministrationChannelArgumentResolverTest {

    private final AdministrationChannelArgumentResolver resolver = new AdministrationChannelArgumentResolver();

    @AfterEach
    void forgetTheSession() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Given a token with a scope claim, when the channel is resolved, then it is a connected application")
    void should_resolve_a_connected_application_when_resolved_given_a_token_with_a_scope() {
        signIn(token().claim("scope", "admin:read"));

        assertThat(resolve()).isEqualTo(AdministrationChannel.CONNECTED_APPLICATION);
    }

    @Test
    @DisplayName("Given a browser token without a scope claim, when the channel is resolved, then it is a browser session")
    void should_resolve_a_browser_session_when_resolved_given_a_token_without_a_scope() {
        signIn(token());

        assertThat(resolve()).isEqualTo(AdministrationChannel.BROWSER);
    }

    @Test
    @DisplayName("Given a handler parameter, when the resolver is asked, then it resolves the channel and nothing else")
    void should_support_only_the_channel_when_asked_given_handler_parameters() throws NoSuchMethodException {
        Method handler = Handlers.class.getDeclaredMethod("handle", AdministrationChannel.class, String.class);

        assertThat(resolver.supportsParameter(new MethodParameter(handler, 0))).isTrue();
        assertThat(resolver.supportsParameter(new MethodParameter(handler, 1))).isFalse();
    }

    private AdministrationChannel resolve() {
        return resolver.resolveArgument(null, null, null, null);
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("token").header("alg", "HS256").subject("admin").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
    }

    private static void signIn(Jwt.Builder token) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token.build()));
    }

    static final class Handlers {

        void handle(AdministrationChannel channel, String other) {
        }
    }
}
