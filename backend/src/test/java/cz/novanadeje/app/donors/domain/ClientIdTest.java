package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientIdTest {

    @Test
    @DisplayName("Given an https document address, when the client id is created, then it keeps the address and names its host")
    void should_keep_the_address_and_name_its_host_when_created_given_an_https_document_address() {
        ClientId clientId = new ClientId("https://claude.ai/.well-known/oauth-client");

        assertThat(clientId.value()).isEqualTo("https://claude.ai/.well-known/oauth-client");
        assertThat(clientId.host()).isEqualTo("claude.ai");
    }

    @Test
    @DisplayName("Given no https scheme, no host or a fragment, when the client id is created, then it is refused")
    void should_refuse_when_created_given_no_https_scheme_or_no_host_or_a_fragment() {
        assertThatThrownBy(() -> new ClientId("http://claude.ai/client")).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientId("https:///client")).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientId("https://claude.ai/client#x")).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientId("not a url")).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientId("")).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientId(null)).isInstanceOf(InvalidClient.class);
    }

    @Test
    @DisplayName("Given user information in the address, when the client id is created, then it is refused")
    void should_refuse_when_created_given_user_information_in_the_address() {
        assertThatThrownBy(() -> new ClientId("https://user@claude.ai/client")).isInstanceOf(InvalidClient.class);
    }
}
