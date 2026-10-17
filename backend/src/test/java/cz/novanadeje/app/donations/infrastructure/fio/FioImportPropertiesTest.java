package cz.novanadeje.app.donations.infrastructure.fio;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class FioImportPropertiesTest {

    private static final URI BASE_URI = URI.create("https://fioapi.fio.cz/v1/rest");

    @Test
    @DisplayName("Given a token, when the properties are printed, then the token is masked and the rest is shown")
    void should_mask_token_when_printed_given_token() {
        FioImportProperties properties = properties("s3cr3t-T0ken_value");

        assertThat(properties.toString())
                .doesNotContain("s3cr3t-T0ken_value")
                .isEqualTo("FioImportProperties[token=***, baseUri=https://fioapi.fio.cz/v1/rest, interval=PT1H, "
                        + "initialDelay=PT30S, requestTimeout=PT2M]");
    }

    @Test
    void should_have_token_when_asked_given_text() {
        assertThat(properties("abc").hasToken()).isTrue();
    }

    @Test
    void should_have_no_token_when_asked_given_empty_or_blank_or_missing_token() {
        assertThat(properties("").hasToken()).isFalse();
        assertThat(properties("   ").hasToken()).isFalse();
        assertThat(properties(null).hasToken()).isFalse();
    }

    private static FioImportProperties properties(String token) {
        return new FioImportProperties(token, BASE_URI, Duration.ofHours(1), Duration.ofSeconds(30), Duration.ofMinutes(2));
    }
}
