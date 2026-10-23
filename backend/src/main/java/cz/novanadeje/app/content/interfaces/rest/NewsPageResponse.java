package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsPage;

import java.util.List;

public record NewsPageResponse(List<NewsArticleResponse> items, int page, int size, long total, boolean hasMore) {

    static NewsPageResponse from(NewsPage page) {
        return new NewsPageResponse(page.items().stream().map(NewsArticleResponse::from).toList(), page.page(), page.size(), page.total(), page.hasMore());
    }
}
