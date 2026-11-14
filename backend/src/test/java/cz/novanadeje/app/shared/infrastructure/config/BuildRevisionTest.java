package cz.novanadeje.app.shared.infrastructure.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.actuate.info.Info;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BuildRevisionTest {

    @Test
    @DisplayName("Given the image revision, when the info endpoint asks, then the build section names it")
    void should_contribute_revision_when_info_is_built_given_revision() {
        BuildRevision revision = new BuildRevision(new BuildProperties("a1b2c3d", "dev"));
        Info.Builder builder = new Info.Builder();

        revision.contribute(builder);

        assertThat(builder.build().getDetails().get("build")).isInstanceOfSatisfying(Map.class,
                build -> assertThat(build).containsEntry("revision", "a1b2c3d"));
    }

    @Test
    @DisplayName("Given the image revision and release, when the info endpoint asks, then the build section names both")
    void should_contribute_revision_and_release_when_info_is_built_given_both() {
        BuildRevision revision = new BuildRevision(new BuildProperties("a1b2c3d", "2026.11.3"));
        Info.Builder builder = new Info.Builder();

        revision.contribute(builder);

        assertThat(builder.build().getDetails())
                .containsEntry("build", Map.of("revision", "a1b2c3d", "version", "2026.11.3"));
    }

    @Test
    @DisplayName("Given a blank revision, when the properties are bound, then the startup fails")
    void should_refuse_blank_revision_when_bound_given_blank() {
        assertThatThrownBy(() -> new BuildProperties(" ", "dev"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("APP_REVISION");
    }

    @Test
    @DisplayName("Given a revision with surrounding spaces, when the properties are bound, then it is trimmed")
    void should_trim_revision_when_bound_given_spaces() {
        assertThat(new BuildProperties(" dev ", "dev").revision()).isEqualTo("dev");
    }

    @Test
    @DisplayName("Given a release with surrounding spaces, when the properties are bound, then it is trimmed")
    void should_trim_release_when_bound_given_spaces() {
        assertThat(new BuildProperties("dev", " 2026.11.3 ").version()).isEqualTo("2026.11.3");
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev", "2026.1.1", "2026.12.1234"})
    @DisplayName("Given a release of the scheme or dev, when the properties are bound, then it is kept")
    void should_keep_release_when_bound_given_scheme(String version) {
        assertThat(new BuildProperties("dev", version).version()).isEqualTo(version);
    }

    @ParameterizedTest
    @ValueSource(strings = {" ", "latest", "2026.13.1", "2026.01.1", "2026.11.0", "2026.11.12345", "v2026.11.3", "2026.11.3-rc"})
    @DisplayName("Given a release outside the scheme, when the properties are bound, then the startup fails")
    void should_refuse_release_when_bound_given_outside_scheme(String version) {
        assertThatThrownBy(() -> new BuildProperties("dev", version))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("APP_VERSION");
    }
}
