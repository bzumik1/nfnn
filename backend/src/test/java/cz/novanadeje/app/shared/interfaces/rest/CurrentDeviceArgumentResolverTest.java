package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.session.CurrentDevice;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

class CurrentDeviceArgumentResolverTest {

    private static final UUID DEVICE = UUID.fromString("0190f5a3-7c4e-7d21-9b3a-5e6f7a8b9c0d");

    private final CurrentDeviceArgumentResolver resolver = new CurrentDeviceArgumentResolver();

    @AfterEach
    void forgetTheSession() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Given a browser token that names its device, when the device is resolved, then it is that device")
    void should_resolve_the_named_device_when_resolved_given_a_browser_token_with_a_session() {
        signIn(token().claim(JwtProperties.SESSION_CLAIM, DEVICE.toString()));

        assertThat(resolve()).isEqualTo(new CurrentDevice(Optional.of(DEVICE)));
    }

    @Test
    @DisplayName("Given a connection's token without a session claim, when the device is resolved, then there is none")
    void should_resolve_no_device_when_resolved_given_a_connection_token() {
        signIn(token().claim(JwtProperties.SCOPE_CLAIM, "admin:read"));

        assertThat(resolve()).isEqualTo(CurrentDevice.none());
    }

    @Test
    @DisplayName("Given a browser token from before devices existed, when the device is resolved, then there is none")
    void should_resolve_no_device_when_resolved_given_a_browser_token_without_a_session() {
        signIn(token());

        assertThat(resolve()).isEqualTo(CurrentDevice.none());
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-device", "0190F5A3-7C4E-7D21-9B3A-5E6F7A8B9C0D", "1-1-1-1-1", "0190f5a3-7c4e-7d21-9b3a-5e6f7a8b9c0d ", ""})
    @DisplayName("Given a session claim that is not a device id in the form the server issues, when the device is resolved, then there is none")
    void should_resolve_no_device_when_resolved_given_a_malformed_session(String session) {
        signIn(token().claim(JwtProperties.SESSION_CLAIM, session));

        assertThat(resolve()).isEqualTo(CurrentDevice.none());
    }

    @Test
    @DisplayName("Given no authentication, when the device is resolved, then there is none")
    void should_resolve_no_device_when_resolved_given_no_authentication() {
        assertThat(resolve()).isEqualTo(CurrentDevice.none());
    }

    @Test
    @DisplayName("Given an anonymous authentication, when the device is resolved, then there is none")
    void should_resolve_no_device_when_resolved_given_an_anonymous_authentication() {
        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken("key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

        assertThat(resolve()).isEqualTo(CurrentDevice.none());
    }

    @Test
    @DisplayName("Given a browser token that names its device and a query naming another, when a handler takes the device, then it gets the one its token names")
    void should_ignore_a_device_in_the_query_when_handled_given_a_browser_token() throws Exception {
        signIn(token().claim(JwtProperties.SESSION_CLAIM, DEVICE.toString()));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new DeviceController()).setCustomArgumentResolvers(resolver).build();

        mvc.perform(get("/device").param("id", UUID.randomUUID().toString()))
                .andExpect(content().string(DEVICE.toString()));
    }

    @Test
    @DisplayName("Given a handler parameter, when the resolver is asked, then it resolves the current device and nothing else")
    void should_support_only_the_current_device_when_asked_given_handler_parameters() throws NoSuchMethodException {
        Method handler = Handlers.class.getDeclaredMethod("handle", CurrentDevice.class, String.class);

        assertThat(resolver.supportsParameter(new MethodParameter(handler, 0))).isTrue();
        assertThat(resolver.supportsParameter(new MethodParameter(handler, 1))).isFalse();
    }

    private CurrentDevice resolve() {
        return resolver.resolveArgument(null, null, null, null);
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("token").header("alg", "HS256").subject("donor").issuedAt(Instant.EPOCH).expiresAt(Instant.EPOCH.plusSeconds(60));
    }

    private static void signIn(Jwt.Builder token) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token.build()));
    }

    @RestController
    static final class DeviceController {

        @GetMapping("/device")
        String device(CurrentDevice device) {
            return device.id().map(UUID::toString).orElse("none");
        }
    }

    static final class Handlers {

        void handle(CurrentDevice device, String other) {
        }
    }
}
