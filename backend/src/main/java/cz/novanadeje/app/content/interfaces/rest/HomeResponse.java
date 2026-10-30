package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.home.HomeContent;

import java.util.List;

public record HomeResponse(List<NewsArticleResponse> news, List<ProjectResponse> projects, AboutResponse about) {

    static HomeResponse from(HomeContent content) {
        return new HomeResponse(content.news().stream().map(NewsArticleResponse::from).toList(),
                content.projects().stream().map(ProjectResponse::from).toList(), AboutResponse.from(content.about()));
    }
}
