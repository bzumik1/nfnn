package cz.novanadeje.app.shared.application.administration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ConnectedClientTest {

    @Test
    @DisplayName("Given a present blank name or no optional at all, when a connected client is made, then it is refused, while a name or its absence is kept")
    void should_refuse_a_blank_name_when_made_given_blank_or_missing_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ConnectedClient(Optional.of(" ")));
        assertThatIllegalArgumentException().isThrownBy(() -> new ConnectedClient(null));

        assertThat(new ConnectedClient(Optional.of("claude.ai")).name()).contains("claude.ai");
        assertThat(ConnectedClient.none().name()).isEmpty();
    }
}
