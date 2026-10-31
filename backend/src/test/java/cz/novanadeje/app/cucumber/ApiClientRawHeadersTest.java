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

    @Test
    @DisplayName("Given a chunked raw answer, when its body is read for the transcript, then the chunk framing is gone")
    void should_drop_the_chunk_framing_when_the_body_of_a_chunked_raw_answer_is_read() {
        assertThat(ApiClient.unchunked("6\r\n{\"a\":1\r\n3;x=y\r\n,\"b\r\n4\r\n\":2}\r\n0\r\n\r\n")).isEqualTo("{\"a\":1,\"b\":2}");
    }
}
