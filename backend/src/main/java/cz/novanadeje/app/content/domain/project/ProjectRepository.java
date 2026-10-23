package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ProjectRepository {

    void save(Project article);

    Optional<Project> findById(ProjectId id);

    Optional<Project> findBySlug(Slug slug);

    boolean isSlugTakenByAnother(Slug slug, ProjectId except);

    boolean isImageUsed(MediaId image);

    List<Project> findAllDraftsFirst();

    List<Project> findVisibleNewestFirst(LocalDate today, int offset, int limit);

    long countVisible(LocalDate today);

    void delete(ProjectId id);
}
