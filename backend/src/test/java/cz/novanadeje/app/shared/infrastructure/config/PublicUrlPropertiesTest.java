package cz.novanadeje.app.shared.infrastructure.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PublicUrlPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given the default dev profile, when the context starts, then links point at the Angular dev server")
    void should_point_at_dev_server_when_started_given_dev_profile() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(PublicUrlProperties.class).publicUrl()).isEqualTo("http://localhost:4200");
        });
    }

    @Test
    @DisplayName("Given the prod profile without PUBLIC_URL, when the context starts, then links point at the staging host")
    void should_point_at_staging_host_when_started_given_prod_profile() {
        contexts.withPropertyValues("spring.profiles.active=prod").run(context ->
                assertThat(context.getBean(PublicUrlProperties.class).publicUrl()).isEqualTo("https://nfnn.znamenacek.duckdns.org"));
    }

    @Test
    @DisplayName("Given PUBLIC_URL with a trailing slash, when the context starts, then it is used without the slash")
    void should_use_public_url_without_slash_when_started_given_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod", "PUBLIC_URL=https://novanadeje.cz/").run(context ->
                assertThat(context.getBean(PublicUrlProperties.class).publicUrl()).isEqualTo("https://novanadeje.cz"));
    }

    @Test
    @DisplayName("Given an empty PUBLIC_URL, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_empty_public_url() {
        contexts.withPropertyValues("PUBLIC_URL=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("PUBLIC_URL (app.site.public-url)");
        });
    }

    @Test
    @DisplayName("Given an https address with a path, when a link is made, then the path follows the address")
    void should_append_path_when_link_made_given_valid_address() {
        PublicUrlProperties properties = new PublicUrlProperties(" https://novanadeje.cz/ ");

        assertThat(properties.publicUrl()).isEqualTo("https://novanadeje.cz");
        assertThat(properties.link("/obnova-hesla#token=abc")).isEqualTo(URI.create("https://novanadeje.cz/obnova-hesla#token=abc"));
    }

    @Test
    @DisplayName("Given an http address with a port, when the properties are made, then it is kept")
    void should_keep_port_when_made_given_http_address_with_port() {
        assertThat(new PublicUrlProperties("http://localhost:8080").link("/x")).isEqualTo(URI.create("http://localhost:8080/x"));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "  ", "ftp://novanadeje.cz", "novanadeje.cz", "/obnova-hesla", "https://", "https://novanadeje.cz/a b",
            "https://novanadeje.cz/?x=1", "https://novanadeje.cz/#x", "https://novanadeje.cz#"})
    @DisplayName("Given something that is not a plain absolute http(s) address, when the properties are made, then they fail naming the environment variable")
    void should_fail_naming_env_var_when_made_given_invalid_address(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> new PublicUrlProperties(value))
                .withMessageContaining("PUBLIC_URL (app.site.public-url)");
    }

    @Test
    @DisplayName("Given a path without a leading slash, when a link is made, then it is refused")
    void should_refuse_when_link_made_given_relative_path() {
        PublicUrlProperties properties = new PublicUrlProperties("https://novanadeje.cz");

        assertThatIllegalArgumentException().isThrownBy(() -> properties.link("obnova-hesla"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(PublicUrlProperties.class)
    static class Support {
    }
}
