package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.project.ProjectId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class ProjectViewsTest {

    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");
    private static final LocalDate TODAY = LocalDate.parse("2026-10-23");
    private static final MediaId COVER = MediaId.newId(NOW);

    private final MediaImageRepository media = mock(MediaImageRepository.class);
    private final ProjectViews views = new ProjectViews(media);

    @Test
    @DisplayName("Given projects with and without a cover photo, when their views are built, then the focal points of the covers are read in one query and each view carries its cover's")
    void should_read_the_focal_points_once_when_views_are_built_given_projects_with_and_without_a_cover() {
        Project covered = project("dominik", Optional.of(COVER));
        Project bare = project("anna", Optional.empty());
        when(media.findFocalPoints(List.of(COVER))).thenReturn(Map.of(COVER, new FocalPoint(30, 70)));

        List<ProjectView> built = views.of(List.of(covered, bare), TODAY);

        assertThat(built).extracting(ProjectView::slug).containsExactly("dominik", "anna");
        assertThat(built).extracting(ProjectView::coverFocalPoint).containsExactly(Optional.of(new FocalPoint(30, 70)), Optional.empty());
        verify(media).findFocalPoints(List.of(COVER));
        verifyNoMoreInteractions(media);
    }

    @Test
    @DisplayName("Given a project with a cover photo, when its view is built, then it carries the cover's focal point")
    void should_carry_the_focal_point_when_one_view_is_built_given_a_project_with_a_cover() {
        when(media.findFocalPoints(List.of(COVER))).thenReturn(Map.of(COVER, new FocalPoint(10, 20)));

        assertThat(views.of(project("dominik", Optional.of(COVER)), TODAY).coverFocalPoint()).contains(new FocalPoint(10, 20));
    }

    private static Project project(String slug, Optional<MediaId> cover) {
        return Project.create(ProjectId.newId(NOW), new ProjectContent(new Slug(slug), "Dominik", 2024, Optional.of("Projekt"), "Perex", "Text", cover), NOW);
    }
}
