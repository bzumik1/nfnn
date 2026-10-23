package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectView;

import java.util.List;

public record ProjectListResponse(List<ProjectResponse> items) {

    static ProjectListResponse from(List<ProjectView> views) {
        return new ProjectListResponse(views.stream().map(ProjectResponse::from).toList());
    }
}
