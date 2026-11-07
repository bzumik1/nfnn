package cz.novanadeje.app.donations.infrastructure.cnb;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodePropertiesTest {

    private static final URI CNB = URI.create("https://www.cnb.cz/cs/platebni-styk/.galleries/ucty_kody_bank/download/kody_bank_CR.csv");

    @Test
    @DisplayName("Given the ČNB address over https, when the settings are bound, then they are kept")
    void should_keep_source_when_bound_given_https_address() {
        assertThat(new BankCodeProperties(CNB).source()).isEqualTo(CNB);
    }

    @Test
    @DisplayName("Given a plain http address, an address without a host or none, when the settings are bound, then the backend refuses to start")
    void should_refuse_when_bound_given_unsafe_source() {
        for (URI source : new URI[]{URI.create("http://www.cnb.cz/kody.csv"), URI.create("https:///kody.csv"), URI.create("file:///etc/passwd"), null}) {
            assertThatThrownBy(() -> new BankCodeProperties(source)).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("app.donations.bank-codes.source");
        }
    }
}
