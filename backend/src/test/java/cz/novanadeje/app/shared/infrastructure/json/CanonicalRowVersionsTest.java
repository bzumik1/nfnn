package cz.novanadeje.app.shared.infrastructure.json;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CanonicalRowVersionsTest {

    private final CanonicalRowVersions versions = new CanonicalRowVersions(JsonMapper.builder().build());

    record Row(String id, String title, String version) {
    }

    record Other(String id, String title) {
    }

    @Test
    @DisplayName("Given rows, when their version is computed, then it is the first 16 lowercase hex digits of the SHA-256 of their canonical JSON")
    void should_be_the_canonical_digest_prefix_when_computed_given_rows() {
        ArrayNode canonical = JsonNodeFactory.instance.arrayNode().add(JsonNodeFactory.instance.objectNode().put("title", "Dominik").put("id", "a"));

        String version = versions.versionOf(List.of(new Other("a", "Dominik")));

        assertThat(version).matches("[0-9a-f]{16}").isEqualTo(CanonicalRows.sha256(canonical).substring(0, 16));
    }

    @Test
    @DisplayName("Given a row that carries a version, when its version is computed, then the carried version is left out")
    void should_leave_out_the_carried_version_when_computed_given_a_versioned_row() {
        assertThat(versions.versionOf(List.of(new Row("a", "Dominik", "0123456789abcdef"))))
                .isEqualTo(versions.versionOf(List.of(new Row("a", "Dominik", "fedcba9876543210"))))
                .isEqualTo(versions.versionOf(List.of(new Other("a", "Dominik"))));
    }

    @Test
    @DisplayName("Given two rows that differ in one stored field, when their versions are computed, then they differ")
    void should_differ_when_computed_given_a_changed_field() {
        assertThat(versions.versionOf(List.of(new Other("a", "Dominik")))).isNotEqualTo(versions.versionOf(List.of(new Other("a", "Dominik."))));
    }

    @Test
    @DisplayName("Given a row and a missing second row, when the version is computed, then it differs from the row with a present second row and from the row alone")
    void should_count_a_missing_row_when_computed_given_null() {
        String withNothing = versions.versionOf(Arrays.asList(new Other("a", "Dominik"), null));

        assertThat(withNothing).isNotEqualTo(versions.versionOf(List.of(new Other("a", "Dominik"), new Other("b", "Dar"))))
                .isNotEqualTo(versions.versionOf(List.of(new Other("a", "Dominik"))));
    }
}
