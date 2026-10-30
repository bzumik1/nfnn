package cz.novanadeje.app.cucumber;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ApiClientRawHeadersTest {

    @Test
    @DisplayName("Given a raw HTTP answer, when its headers are read for the transcript, then their names are lowercase")
    void should_lowercase_header_names_when_the_headers_of_a_raw_answer_are_read() {
        String raw = "HTTP/1.1 400 \r\nContent-Type: application/problem+json\r\nX-Content-Type-Options: nosniff\r\n\r\n{}";

        assertThat(ApiClient.rawHeaders(raw, raw.indexOf("\r\n\r\n")).headerNames()).containsExactlyInAnyOrder("content-type", "x-content-type-options");
    }
}
