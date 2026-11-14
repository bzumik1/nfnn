package cz.novanadeje.app.operations.infrastructure.github;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReleaseSourcePropertiesTest {

    private static final URI GITHUB = URI.create("https://api.github.com/repos/bzumik1/nfnn/releases/latest");

    @Test
    @DisplayName("Given the GitHub API address over https, when the settings are bound, then they are kept")
    void should_keep_source_when_bound_given_github_address() {
        assertThat(new ReleaseSourceProperties(GITHUB).source()).isEqualTo(GITHUB);
    }

    @Test
    @DisplayName("Given plain http, another host, a port, a user, a query or no address, when the settings are bound, then the backend refuses to start")
    void should_refuse_when_bound_given_other_source() {
        for (URI source : new URI[]{URI.create("http://api.github.com/repos/bzumik1/nfnn/releases/latest"), URI.create("https://github.com/bzumik1/nfnn/releases/latest"),
                URI.create("https://api.github.com.example.org/releases/latest"), URI.create("https://api.github.com:8443/repos/bzumik1/nfnn/releases/latest"),
                URI.create("https://user@api.github.com/repos/bzumik1/nfnn/releases/latest"), URI.create("https://api.github.com/repos/bzumik1/nfnn/releases/latest?per_page=1"),
                URI.create("file:///etc/passwd"), null}) {
            assertThatThrownBy(() -> new ReleaseSourceProperties(source)).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("app.operations.releases.source");
        }
    }
}
