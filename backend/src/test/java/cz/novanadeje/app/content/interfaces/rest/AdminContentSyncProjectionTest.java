package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.donateband.DonateBandView;
import cz.novanadeje.app.content.application.sync.AdminContent;
import cz.novanadeje.app.content.application.sync.AdminContentSyncSnapshot;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AdminContentSyncProjectionTest {

    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-0000000000aa");

    private final JsonMapper json = JsonMapper.builder().build();
    private final AdminContentSyncProjection projection = new AdminContentSyncProjection(json);

    @Test
    @DisplayName("Given a site without news or projects, when its content is projected, then only the sections that always exist come, each as its page reads it")
    void should_project_only_the_sections_when_projected_given_no_news_or_projects() {
        Versioned<Optional<String>> note = new Versioned<>(Optional.of("Pomáháme dětem."), "0123456789abcdef");
        Versioned<Optional<String>> footnote = new Versioned<>(Optional.empty(), "fedcba9876543210");
        AdminContent content = new AdminContent(List.of(), List.of(), ProjectOrder.CATEGORY_THEN_YEAR, new AboutView(Optional.empty()),
                new DonateBandView(Optional.empty()), List.of(), note, footnote);

        List<SyncChunk> chunks = projection.chunksOf(new AdminContentSyncSnapshot(SUBJECT, Optional.of(content)));

        assertThat(chunks).extracting(SyncChunk::id).containsExactly("about", "donate-band", "people", "project-order");
        assertThat(chunks).allSatisfy(chunk -> {
            assertThat(chunk.count()).isEqualTo(1);
            assertThat(chunk.rowsSha256()).isEqualTo(CanonicalRows.sha256(chunk.rows()));
        });
        assertThat(rowOf(chunks, "project-order")).isEqualTo(json.valueToTree(ProjectOrderResponse.from(ProjectOrder.CATEGORY_THEN_YEAR)).toString());
        assertThat(rowOf(chunks, "people")).isEqualTo(json.valueToTree(PeopleResponse.from(List.of(), note, footnote)).toString());
        assertThat(rowOf(chunks, "about")).isEqualTo("{\"photo\":null}");
    }

    @Test
    @DisplayName("Given an account without the administration, when its snapshot is projected, then no chunk comes")
    void should_project_no_chunk_when_projected_given_no_administration() {
        assertThat(projection.chunksOf(new AdminContentSyncSnapshot(SUBJECT, Optional.empty()))).isEmpty();
    }

    private static String rowOf(List<SyncChunk> chunks, String id) {
        return chunks.stream().filter(chunk -> chunk.id().equals(id)).findFirst().orElseThrow().rows().get(0).toString();
    }
}
