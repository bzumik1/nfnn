package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsArticleView;

import cz.novanadeje.app.content.application.Versioned;

import java.util.List;

public record NewsListResponse(List<NewsArticleResponse> items) {

    static NewsListResponse from(List<NewsArticleView> views) {
        return new NewsListResponse(views.stream().map(NewsArticleResponse::from).toList());
    }

    static NewsListResponse fromVersioned(List<Versioned<NewsArticleView>> views) {
        return new NewsListResponse(views.stream().map(NewsArticleResponse::from).toList());
    }
}
