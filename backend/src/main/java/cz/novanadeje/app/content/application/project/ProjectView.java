package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.content.domain.project.ProjectId;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public record ProjectView(ProjectId id, String slug, String title, int year, ProjectCategory category, Optional<String> tag, String perex, String body,
                          Optional<MediaId> coverImage, Optional<String> coverImageAlt, Optional<FocalPoint> coverFocalPoint, Optional<LocalDate> publishedOn,
                          boolean live, Instant createdAt, Instant updatedAt) {

    public static ProjectView of(Project project, LocalDate today, MediaImageRepository media) {
        return all(List.of(project), today, media).getFirst();
    }

    public static List<ProjectView> all(List<Project> projects, LocalDate today, MediaImageRepository media) {
        Map<MediaId, FocalPoint> focalPoints = media.findFocalPoints(projects.stream().flatMap(project -> project.content().coverImage().stream()).toList());
        return projects.stream().map(project -> from(project, today, focalPoints)).toList();
    }

    private static ProjectView from(Project project, LocalDate today, Map<MediaId, FocalPoint> focalPoints) {
        Optional<MediaId> cover = project.content().coverImage();
        return new ProjectView(project.id(), project.slug().value(), project.content().title(), project.content().year(),
                project.content().category(), project.content().tag(), project.content().perex(), project.content().body(), cover, project.content().coverImageAlt(),
                cover.map(focalPoints::get), project.publishedOn(), project.isVisibleOn(today), project.createdAt(), project.updatedAt());
    }
}
