package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.ConnectedClient;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

class ConnectedClientArgumentResolverTest {

    private final ConnectedClientArgumentResolver resolver = new ConnectedClientArgumentResolver();

    @AfterEach
    void forgetTheSession() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Given a connection's token that names its client, when the connected client is resolved, then it is that client")
    void should_resolve_the_named_client_when_resolved_given_a_connection_token() {
        signIn(token().claim(JwtProperties.SCOPE_CLAIM, "admin:write").claim(JwtProperties.CLIENT_CLAIM, "claude.ai"));

        assertThat(resolve()).isEqualTo(new ConnectedClient(Optional.of("claude.ai")));
    }

    @Test
    @DisplayName("Given a browser token without a client claim, when the connected client is resolved, then there is none")
    void should_resolve_no_client_when_resolved_given_a_browser_token() {
        signIn(token());

        assertThat(resolve()).isEqualTo(ConnectedClient.none());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t"})
    @DisplayName("Given a blank client claim, when the connected client is resolved, then there is none")
    void should_resolve_no_client_when_resolved_given_a_blank_client(String client) {
        signIn(token().claim(JwtProperties.SCOPE_CLAIM, "admin:write").claim(JwtProperties.CLIENT_CLAIM, client));

        assertThat(resolve()).isEqualTo(ConnectedClient.none());
    }

    @Test
    @DisplayName("Given no authentication, when the connected client is resolved, then there is none")
    void should_resolve_no_client_when_resolved_given_no_authentication() {
        assertThat(resolve()).isEqualTo(ConnectedClient.none());
    }

    @Test
    @DisplayName("Given an anonymous authentication, when the connected client is resolved, then there is none")
    void should_resolve_no_client_when_resolved_given_an_anonymous_authentication() {
        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken("key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

        assertThat(resolve()).isEqualTo(ConnectedClient.none());
    }

    @Test
    @DisplayName("Given a connection whose token names its client and a query naming another, when a handler takes the client, then it gets the one its token names")
    void should_ignore_a_client_in_the_query_when_handled_given_a_connection_token() throws Exception {
        signIn(token().claim(JwtProperties.SCOPE_CLAIM, "admin:write").claim(JwtProperties.CLIENT_CLAIM, "claude.ai"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ClientController()).setCustomArgumentResolvers(resolver).build();

        mvc.perform(get("/client").param("name", "another.example"))
                .andExpect(content().string("claude.ai"));
    }

    @Test
    @DisplayName("Given a handler parameter, when the resolver is asked, then it resolves the connected client and nothing else")
    void should_support_only_the_connected_client_when_asked_given_handler_parameters() throws NoSuchMethodException {
        Method handler = Handlers.class.getDeclaredMethod("handle", ConnectedClient.class, String.class);

        assertThat(resolver.supportsParameter(new MethodParameter(handler, 0))).isTrue();
        assertThat(resolver.supportsParameter(new MethodParameter(handler, 1))).isFalse();
    }

    private ConnectedClient resolve() {
        return resolver.resolveArgument(null, null, null, null);
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("token").header("alg", "HS256").subject("admin").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
    }

    private static void signIn(Jwt.Builder token) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token.build()));
    }

    @RestController
    static final class ClientController {

        @GetMapping("/client")
        String client(ConnectedClient client) {
            return client.name().orElse("none");
        }
    }

    static final class Handlers {

        void handle(ConnectedClient client, String other) {
        }
    }
}
