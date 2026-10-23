package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.shared.domain.error.NotFound;

public class NewsArticleNotFound extends NotFound {

    public static final String CODE = "content/news-not-found";

    public NewsArticleNotFound(NewsArticleId id) {
        super(CODE, "News article " + id + " does not exist");
    }

    public NewsArticleNotFound(Slug slug) {
        this(slug.value());
    }

    public NewsArticleNotFound(String slug) {
        super(CODE, "No published news article has the slug " + slug);
    }
}
