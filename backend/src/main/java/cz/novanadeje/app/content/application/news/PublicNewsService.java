package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.FormerSlugs;
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
    private final FormerSlugs formerSlugs;
    private final NewsSigners signers;
    private final Clock clock;

    public PublicNewsService(NewsArticleRepository news, FormerSlugs formerSlugs, NewsSigners signers, Clock clock) {
        this.news = news;
        this.formerSlugs = formerSlugs;
        this.signers = signers;
        this.clock = clock;
    }

    public NewsPage list(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("The page is 0 or more and the size 1 to " + MAX_PAGE_SIZE);
        }
        LocalDate today = today();
        List<NewsArticleView> items = signers.views(news.findVisibleNewestFirst(today, page * size, size), today);
        return new NewsPage(items, page, size, news.countVisible(today));
    }

    public NewsArticleView bySlug(Slug slug) {
        LocalDate today = today();
        NewsArticle article = news.findBySlug(slug)
                .or(() -> formerSlugs.newsArticle(slug).flatMap(news::findById))
                .filter(found -> found.isVisibleOn(today))
                .orElseThrow(() -> new NewsArticleNotFound(slug));
        return signers.view(article, today);
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
    }
}
