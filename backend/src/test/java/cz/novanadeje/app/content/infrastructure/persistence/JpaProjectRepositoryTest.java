package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaProjectRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.parse("2026-10-23");

    @Autowired
    private ProjectRepository projects;
    @Autowired
    private MediaImageRepository media;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given a project with a cover image, when it is saved and read, then every field comes back")
    void should_round_trip_when_saved_given_a_cover_image() {
        MediaImage image = image();
        media.save(image);
        Project project = Project.create(ProjectId.newId(NOW),
                new ProjectContent(new Slug("dominik"), "Dominik", 2024, ProjectCategory.CHILDREN, Optional.of("Projekt"), "Perex", "Text\n\nDruhý odstavec", Optional.of(image.id()), Optional.of("Dominik na novém vozíku")), NOW);

        projects.save(project);
        flushAndClear();

        assertThat(projects.findById(project.id())).contains(project);
        assertThat(projects.findBySlug(new Slug("dominik"))).contains(project);
        assertThat(projects.isSlugTakenByAnother(new Slug("dominik"), project.id())).isFalse();
        assertThat(projects.isSlugTakenByAnother(new Slug("dominik"), ProjectId.newId(NOW))).isTrue();
    }

    @Test
    @DisplayName("Given drafts and published projects, when the administration list is read, then drafts come first and the rest newest first")
    void should_list_drafts_first_when_all_are_read() {
        Project draft = save(project("koncept", NOW.plusSeconds(10)), Optional.empty());
        Project older = save(project("starsi", NOW), Optional.of(LocalDate.parse("2026-09-01")));
        Project newer = save(project("novejsi", NOW), Optional.of(LocalDate.parse("2026-10-20")));
        Project scheduled = save(project("planovana", NOW), Optional.of(LocalDate.parse("2026-11-05")));
        flushAndClear();

        assertThat(projects.findAllDraftsFirst(ProjectOrder.YEAR_THEN_CATEGORY)).extracting(Project::slug)
                .containsExactly(draft.slug(), scheduled.slug(), newer.slug(), older.slug());
    }

    @Test
    @DisplayName("Given projects published on several days, when the visible page is read, then only those published by today come newest first in pages")
    void should_page_visible_newest_first_when_read_given_today() {
        save(project("koncept", NOW), Optional.empty());
        save(project("planovana", NOW), Optional.of(LocalDate.parse("2026-11-05")));
        save(project("dnes", NOW), Optional.of(TODAY));
        save(project("vcera", NOW), Optional.of(TODAY.minusDays(1)));
        save(project("loni", NOW), Optional.of(LocalDate.parse("2025-12-24")));
        flushAndClear();

        assertThat(projects.countVisible(TODAY)).isEqualTo(3);
        assertThat(projects.findVisible(TODAY, ProjectOrder.YEAR_THEN_CATEGORY, 0, 2)).extracting(Project::slug).containsExactly(new Slug("dnes"), new Slug("vcera"));
        assertThat(projects.findVisible(TODAY, ProjectOrder.YEAR_THEN_CATEGORY, 2, 2)).extracting(Project::slug).containsExactly(new Slug("loni"));
        assertThat(projects.findVisible(TODAY.minusDays(1), ProjectOrder.YEAR_THEN_CATEGORY, 0, 10)).extracting(Project::slug).containsExactly(new Slug("vcera"), new Slug("loni"));
    }

    @Test
    @DisplayName("Given projects of several years, when they are listed, then a newer year comes first whatever the publication day")
    void should_order_by_year_before_publication_day_when_listed() {
        save(project("loni", 2025, NOW), Optional.of(LocalDate.parse("2026-10-20")));
        save(project("letos", 2026, NOW), Optional.of(LocalDate.parse("2026-01-05")));
        save(project("koncept-loni", 2025, NOW), Optional.empty());
        flushAndClear();

        assertThat(projects.findVisible(TODAY, ProjectOrder.YEAR_THEN_CATEGORY, 0, 10)).extracting(Project::slug).containsExactly(new Slug("letos"), new Slug("loni"));
        assertThat(projects.findAllDraftsFirst(ProjectOrder.YEAR_THEN_CATEGORY)).extracting(Project::slug).containsExactly(new Slug("koncept-loni"), new Slug("letos"), new Slug("loni"));
    }

    @Test
    @DisplayName("Given projects of two years in every category, when they are listed, then within a year children come first, then adults, animals and the others")
    void should_order_by_category_within_a_year_when_listed() {
        LocalDate published = LocalDate.parse("2026-10-01");
        save(project("zvirata", 2025, ProjectCategory.ANIMALS, NOW.minusSeconds(4)), Optional.of(published));
        save(project("ostatni", 2025, ProjectCategory.OTHER, NOW.minusSeconds(3)), Optional.of(published));
        save(project("dospeli", 2025, ProjectCategory.ADULTS, NOW.minusSeconds(2)), Optional.of(published));
        save(project("deti", 2025, ProjectCategory.CHILDREN, NOW.minusSeconds(5)), Optional.of(published));
        save(project("deti-novejsi", 2025, ProjectCategory.CHILDREN, NOW.minusSeconds(1)), Optional.of(published));
        save(project("zvirata-letos", 2026, ProjectCategory.ANIMALS, NOW), Optional.of(published));
        save(project("koncept-deti", 2024, ProjectCategory.CHILDREN, NOW), Optional.empty());
        flushAndClear();

        assertThat(projects.findVisible(TODAY, ProjectOrder.YEAR_THEN_CATEGORY, 0, 10)).extracting(project -> project.slug().value())
                .containsExactly("zvirata-letos", "deti-novejsi", "deti", "dospeli", "zvirata", "ostatni");
        assertThat(projects.findAllDraftsFirst(ProjectOrder.YEAR_THEN_CATEGORY)).extracting(project -> project.slug().value())
                .containsExactly("koncept-deti", "zvirata-letos", "deti-novejsi", "deti", "dospeli", "zvirata", "ostatni");
    }

    @Test
    @DisplayName("Given projects of two years in several categories, when they are listed by year alone, then a year lists its projects from the one published last whatever their category")
    void should_order_by_year_and_publication_day_when_listed_by_year() {
        save(project("deti", 2025, ProjectCategory.CHILDREN, NOW.minusSeconds(3)), Optional.of(LocalDate.parse("2026-10-01")));
        save(project("zvirata", 2025, ProjectCategory.ANIMALS, NOW.minusSeconds(2)), Optional.of(LocalDate.parse("2026-10-03")));
        save(project("dospeli", 2025, ProjectCategory.ADULTS, NOW.minusSeconds(1)), Optional.of(LocalDate.parse("2026-10-02")));
        save(project("ostatni-letos", 2026, ProjectCategory.OTHER, NOW), Optional.of(LocalDate.parse("2026-09-01")));
        save(project("koncept", 2024, ProjectCategory.CHILDREN, NOW), Optional.empty());
        flushAndClear();

        assertThat(projects.findVisible(TODAY, ProjectOrder.YEAR, 0, 10)).extracting(project -> project.slug().value())
                .containsExactly("ostatni-letos", "zvirata", "dospeli", "deti");
        assertThat(projects.findAllDraftsFirst(ProjectOrder.YEAR)).extracting(project -> project.slug().value())
                .containsExactly("koncept", "ostatni-letos", "zvirata", "dospeli", "deti");
    }

    @Test
    @DisplayName("Given projects of three years in every category, when they are listed by category first, then every project for children leads, each category from the newest year")
    void should_order_by_category_before_year_when_listed_by_category_first() {
        LocalDate published = LocalDate.parse("2026-10-01");
        save(project("ostatni-letos", 2026, ProjectCategory.OTHER, NOW), Optional.of(published));
        save(project("dospeli-loni", 2025, ProjectCategory.ADULTS, NOW.minusSeconds(1)), Optional.of(published));
        save(project("deti-predloni", 2024, ProjectCategory.CHILDREN, NOW.minusSeconds(2)), Optional.of(published));
        save(project("deti-loni", 2025, ProjectCategory.CHILDREN, NOW.minusSeconds(3)), Optional.of(published));
        save(project("zvirata-letos", 2026, ProjectCategory.ANIMALS, NOW.minusSeconds(4)), Optional.of(published));
        save(project("deti-loni-novejsi", 2025, ProjectCategory.CHILDREN, NOW.minusSeconds(5)), Optional.of(LocalDate.parse("2026-10-02")));
        flushAndClear();

        assertThat(projects.findVisible(TODAY, ProjectOrder.CATEGORY_THEN_YEAR, 0, 10)).extracting(project -> project.slug().value())
                .containsExactly("deti-loni-novejsi", "deti-loni", "deti-predloni", "dospeli-loni", "zvirata-letos", "ostatni-letos");
        assertThat(projects.findVisible(TODAY, ProjectOrder.CATEGORY_THEN_YEAR, 2, 2)).extracting(project -> project.slug().value())
                .containsExactly("deti-predloni", "dospeli-loni");
    }

    @Test
    @DisplayName("Given a saved project, when it is deleted, then it is gone")
    void should_delete_when_deleted_given_a_saved_project() {
        Project project = save(project("smazat", NOW), Optional.empty());
        flushAndClear();

        projects.delete(project.id());
        flushAndClear();

        assertThat(projects.findById(project.id())).isEmpty();
    }

    private Project save(Project project, Optional<LocalDate> publishedOn) {
        Project saved = publishedOn.map(day -> project.publish(day, NOW)).orElse(project);
        projects.save(saved);
        return saved;
    }

    private static Project project(String slug, Instant at) {
        return project(slug, 2024, at);
    }

    private static Project project(String slug, int year, Instant at) {
        return project(slug, year, ProjectCategory.OTHER, at);
    }

    private static Project project(String slug, int year, ProjectCategory category, Instant at) {
        return Project.create(ProjectId.newId(at), new ProjectContent(new Slug(slug), slug, year, category, Optional.empty(), "Perex", "Text", Optional.empty(),
                Optional.empty()), at);
    }

    private static MediaImage image() {
        return new MediaImage(MediaId.newId(NOW), 700, 500, List.of(new MediaVariant(480, 343, "webp".getBytes())), NOW);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
