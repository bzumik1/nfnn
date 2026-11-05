package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ApiGenerationTest {

    private static final Path APP_GENERATION = Path.of("..", "frontend", "src", "app", "core", "version", "api-generation.json");

    @Test
    @DisplayName("Given the API generation the browser app is built for, when the server's generation is compared, then both name the same generation")
    void should_name_the_same_generation_when_compared_given_the_generation_the_app_is_built_for() {
        JsonNode generation = JsonMapper.builder().build().readTree(APP_GENERATION.toFile()).get("generation");

        assertThat(generation).withFailMessage("%s names no generation", APP_GENERATION).isNotNull();
        assertThat(generation.isInt()).withFailMessage("%s names no whole number", APP_GENERATION).isTrue();
        assertThat(generation.asInt()).isEqualTo(VersionHeadersFilter.API_GENERATION);
    }

    @Test
    @DisplayName("Given the writes the browser app sends across generations, when the server's list is compared, then both pass the same writes")
    void should_pass_the_same_writes_when_compared_given_the_writes_the_app_sends_across_generations() {
        JsonNode posts = JsonMapper.builder().build().readTree(APP_GENERATION.toFile()).get("postsAcrossGenerations");

        assertThat(posts).withFailMessage("%s names no postsAcrossGenerations", APP_GENERATION).isNotNull();
        assertThat(posts.valueStream().map(JsonNode::asString).toList())
                .containsExactlyInAnyOrderElementsOf(VersionHeadersFilter.POSTS_ACROSS_GENERATIONS);
    }

    @Test
    @DisplayName("Given the server's API generation, when it is read, then it is a positive whole number the app can compare")
    void should_be_positive_when_read_given_the_server_generation() {
        assertThat(VersionHeadersFilter.API_GENERATION).isPositive();
    }
}
