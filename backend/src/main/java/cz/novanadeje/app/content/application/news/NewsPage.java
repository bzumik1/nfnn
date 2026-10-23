package cz.novanadeje.app.content.application.news;

import java.util.List;

public record NewsPage(List<NewsArticleView> items, int page, int size, long total) {

    public NewsPage {
        items = List.copyOf(items);
    }

    public boolean hasMore() {
        return (long) (page + 1) * size < total;
    }
}
