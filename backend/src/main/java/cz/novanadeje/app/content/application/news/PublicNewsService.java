package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.PublicListPage;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.FormerNewsSlugs;
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

    private final NewsArticleRepository news;
    private final FormerNewsSlugs formerSlugs;
    private final NewsSigners signers;
    private final Clock clock;

    public PublicNewsService(NewsArticleRepository news, FormerNewsSlugs formerSlugs, NewsSigners signers, Clock clock) {
        this.news = news;
        this.formerSlugs = formerSlugs;
        this.signers = signers;
        this.clock = clock;
    }

    public NewsPage list(int page, int size) {
        PublicListPage.check(page, size);
        LocalDate today = today();
        if (beyondEveryOffset(page, size)) {
            return new NewsPage(List.of(), page, size, news.countVisible(today));
        }
        List<NewsArticleView> items = signers.views(news.findVisibleNewestFirst(today, page * size, size), today);
        return new NewsPage(items, page, size, news.countVisible(today));
    }

    public NewsArticleView bySlug(Slug slug) {
        LocalDate today = today();
        NewsArticle article = news.findBySlug(slug)
                .or(() -> formerSlugs.newsArticle(slug).flatMap(news::findById))
                .filter(found -> found.isVisibleOn(today))
                .orElseThrow(NewsArticleNotFound::new);
        return signers.view(article, today);
    }

    private static boolean beyondEveryOffset(int page, int size) {
        return (long) page * size > Integer.MAX_VALUE;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
    }
}
