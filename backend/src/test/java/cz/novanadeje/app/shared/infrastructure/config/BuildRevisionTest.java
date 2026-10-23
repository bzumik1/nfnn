package cz.novanadeje.app.shared.infrastructure.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BuildRevisionTest {

    @Test
    @DisplayName("Given the image revision, when the info endpoint asks, then the build section names it")
    void should_contribute_revision_when_info_is_built_given_revision() {
        BuildRevision revision = new BuildRevision(new BuildProperties("a1b2c3d"));
        Info.Builder builder = new Info.Builder();

        revision.contribute(builder);

        assertThat(builder.build().getDetails()).containsEntry("build", java.util.Map.of("revision", "a1b2c3d"));
    }

    @Test
    @DisplayName("Given a blank revision, when the properties are bound, then the startup fails")
    void should_refuse_blank_revision_when_bound_given_blank() {
        assertThatThrownBy(() -> new BuildProperties(" "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("APP_REVISION");
    }

    @Test
    @DisplayName("Given a revision with surrounding spaces, when the properties are bound, then it is trimmed")
    void should_trim_revision_when_bound_given_spaces() {
        assertThat(new BuildProperties(" dev ").revision()).isEqualTo("dev");
    }
}
