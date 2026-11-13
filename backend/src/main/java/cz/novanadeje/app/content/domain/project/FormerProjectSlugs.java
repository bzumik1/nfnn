package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.content.domain.Slug;

import java.time.Instant;
import java.util.Optional;

public interface FormerProjectSlugs {

    void rememberProject(Slug slug, ProjectId project, Instant replacedAt);

    void forgetProject(Slug slug);

    Optional<ProjectId> project(Slug slug);
}
