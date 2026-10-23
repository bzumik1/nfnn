package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class PublicNewsService {

    public static final int MAX_PAGE_SIZE = 50;

    private final NewsArticleRepository news;
    private final Clock clock;

    public PublicNewsService(NewsArticleRepository news, Clock clock) {
        this.news = news;
        this.clock = clock;
    }

    public NewsPage list(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("The page is 0 or more and the size 1 to " + MAX_PAGE_SIZE);
        }
        LocalDate today = today();
        List<NewsArticleView> items = news.findVisibleNewestFirst(today, page * size, size).stream().map(NewsArticleView::from).toList();
        return new NewsPage(items, page, size, news.countVisible(today));
    }

    public NewsArticleView bySlug(Slug slug) {
        NewsArticle article = news.findBySlug(slug)
                .filter(found -> found.isVisibleOn(today()))
                .orElseThrow(() -> new NewsArticleNotFound(slug));
        return NewsArticleView.from(article);
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
    }
}
