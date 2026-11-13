package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

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
    @DisplayName("Given no authentication, when the channel is resolved, then it is a browser session, as the security chain sees it")
    void should_resolve_a_browser_session_when_resolved_given_no_authentication() {
        assertThat(resolve()).isEqualTo(AdministrationChannel.BROWSER);
    }

    @Test
    @DisplayName("Given an anonymous authentication, when the channel is resolved, then it is a browser session, as the security chain sees it")
    void should_resolve_a_browser_session_when_resolved_given_an_anonymous_authentication() {
        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken("key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

        assertThat(resolve()).isEqualTo(AdministrationChannel.BROWSER);
    }

    @Test
    @DisplayName("Given a connected application that names another channel in the query, when a handler takes the channel, then it gets the one its token proves")
    void should_ignore_a_channel_in_the_query_when_handled_given_a_connected_application() throws Exception {
        signIn(token().claim("scope", "admin:write"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ChannelController()).setCustomArgumentResolvers(resolver).build();

        mvc.perform(get("/channel").param("channel", AdministrationChannel.BROWSER.name()))
                .andExpect(content().string(AdministrationChannel.CONNECTED_APPLICATION.name()));
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

    @RestController
    static final class ChannelController {

        @GetMapping("/channel")
        String channel(AdministrationChannel channel) {
            return channel.name();
        }
    }

    static final class Handlers {

        void handle(AdministrationChannel channel, String other) {
        }
    }
}
