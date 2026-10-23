package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectPage;

import java.util.List;

public record ProjectPageResponse(List<ProjectResponse> items, int page, int size, long total, boolean hasMore) {

    static ProjectPageResponse from(ProjectPage page) {
        return new ProjectPageResponse(page.items().stream().map(ProjectResponse::from).toList(), page.page(), page.size(), page.total(), page.hasMore());
    }
}
