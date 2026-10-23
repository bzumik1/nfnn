package cz.novanadeje.app.cucumber;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class FeatureContextTagsTest {

    @Test
    @DisplayName("Given the acceptance features, when their tags are read, then each carries the tag of the context folder it lives in")
    void should_carry_context_tag_when_tags_read_given_every_feature() throws IOException, URISyntaxException {
        Path features = Path.of(Objects.requireNonNull(getClass().getResource("/features")).toURI());
        List<Path> files;
        try (Stream<Path> walk = Files.walk(features)) {
            files = walk.filter(file -> file.toString().endsWith(".feature")).toList();
        }

        assertThat(files).isNotEmpty().allSatisfy(file -> {
            String context = features.relativize(file).getName(0).toString();
            List<String> tags = Files.readAllLines(file).stream()
                    .takeWhile(line -> !line.startsWith("Feature:"))
                    .filter(line -> line.startsWith("@"))
                    .flatMap(line -> Arrays.stream(line.trim().split("\\s+")))
                    .toList();
            assertThat(tags).as(features.relativize(file).toString()).contains("@" + context);
        });
    }
}
