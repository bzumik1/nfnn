package cz.novanadeje.app.operations.infrastructure.github;

import cz.novanadeje.app.operations.application.release.LatestReleaseUnavailable;
import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.format.DateTimeParseException;

final class GitHubReleaseAnswer {

    private static final int MAX_TIMESTAMP_LENGTH = 32;

    private final JsonMapper mapper = JsonMapper.builder().build();

    LatestRelease parse(byte[] answer) {
        JsonNode root;
        try {
            root = mapper.readTree(answer);
        } catch (JacksonException malformed) {
            throw refused();
        }
        if (root == null || !root.isObject() || !isFalse(root.get("draft")) || !isFalse(root.get("prerelease"))) {
            throw refused();
        }
        Release release = Release.parse(text(root.get("tag_name"), Release.MAX_LENGTH)).orElseThrow(GitHubReleaseAnswer::refused);
        return new LatestRelease(release, publishedAt(root.get("published_at")));
    }

    private static Instant publishedAt(JsonNode node) {
        try {
            return Instant.parse(text(node, MAX_TIMESTAMP_LENGTH));
        } catch (DateTimeParseException unreadable) {
            throw refused();
        }
    }

    private static String text(JsonNode node, int maxLength) {
        if (node == null || !node.isString() || node.asString().length() > maxLength) {
            throw refused();
        }
        return node.asString();
    }

    private static boolean isFalse(JsonNode node) {
        return node != null && node.isBoolean() && !node.asBoolean();
    }

    private static LatestReleaseUnavailable refused() {
        return new LatestReleaseUnavailable(ReleaseCheckFailure.REFUSED_ANSWER);
    }
}
