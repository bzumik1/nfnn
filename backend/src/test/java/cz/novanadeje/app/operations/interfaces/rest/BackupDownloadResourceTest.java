package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupDownload;
import cz.novanadeje.app.operations.domain.backup.BackupFile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class BackupDownloadResourceTest {

    private static final String NAME = "nfnn-2026-10-23_0300.dump.age";

    @TempDir
    private Path folder;

    private MockMvc mvc;

    @BeforeEach
    void serveOneDumpBothWays() throws IOException {
        Path dump = Files.write(folder.resolve(NAME), "age-encryption.org/v1 dump body".getBytes(StandardCharsets.US_ASCII));
        BackupDownload download = new BackupDownload(new BackupFile(NAME, Files.size(dump), Instant.parse("2026-10-23T01:00:03Z")),
                () -> Files.newInputStream(dump));
        mvc = MockMvcBuilders.standaloneSetup(new Downloads(download, dump)).build();
    }

    @ParameterizedTest(name = "Range: {0}")
    @ValueSource(strings = {"", "bytes=4-11", "bytes=-5", "bytes=0-2,6-9", "bytes=100-"})
    @DisplayName("Given a backup served from its content handle, when it is downloaded with or without a range, then the answer is the one a file resource gave: status, headers and bytes")
    void should_answer_like_a_file_resource_when_downloaded_given_a_content_handle(String range) throws Exception {
        MockHttpServletResponse fromFile = answer(get("/file"), range);
        MockHttpServletResponse fromHandle = answer(get("/handle"), range);

        assertThat(fromHandle.getStatus()).isEqualTo(fromFile.getStatus());
        assertThat(headers(fromHandle)).isEqualTo(headers(fromFile));
        assertThat(body(fromHandle)).isEqualTo(body(fromFile)).isNotEmpty();
    }

    private MockHttpServletResponse answer(MockHttpServletRequestBuilder request, String range) throws Exception {
        if (!range.isEmpty()) {
            request.header(HttpHeaders.RANGE, range);
        }
        return mvc.perform(request).andReturn().getResponse();
    }

    private static Map<String, String> headers(MockHttpServletResponse response) {
        return response.getHeaderNames().stream()
                .collect(Collectors.toMap(Function.identity(), name -> withoutBoundary(response, String.join(", ", response.getHeaders(name)))));
    }

    private static String body(MockHttpServletResponse response) {
        return withoutBoundary(response, new String(response.getContentAsByteArray(), StandardCharsets.ISO_8859_1));
    }

    private static String withoutBoundary(MockHttpServletResponse response, String text) {
        String contentType = response.getContentType();
        if (contentType == null || !contentType.contains("boundary=")) {
            return text;
        }
        return text.replace(contentType.substring(contentType.indexOf("boundary=") + "boundary=".length()), "<boundary>");
    }

    @RestController
    static final class Downloads {

        private final BackupDownload download;
        private final Path dump;

        Downloads(BackupDownload download, Path dump) {
            this.download = download;
            this.dump = dump;
        }

        @GetMapping("/file")
        ResponseEntity<Resource> file() {
            return answer(new FileSystemResource(dump));
        }

        @GetMapping("/handle")
        ResponseEntity<Resource> handle() {
            return answer(new BackupDownloadResource(download));
        }

        private ResponseEntity<Resource> answer(Resource body) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(download.file().sizeBytes())
                    .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            ContentDisposition.attachment().filename(download.file().name(), StandardCharsets.UTF_8).build().toString())
                    .body(body);
        }
    }
}
