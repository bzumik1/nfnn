package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.PublicNewsService;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.Slug;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/content/news")
class PublicNewsController {

    private static final int DEFAULT_PAGE_SIZE = 10;

    private final PublicNewsService news;

    PublicNewsController(PublicNewsService news) {
        this.news = news;
    }

    @GetMapping
    NewsPageResponse list(@RequestParam(defaultValue = "0") @Min(0) int page,
                          @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) @Min(1) @Max(PublicNewsService.MAX_PAGE_SIZE) int size) {
        return NewsPageResponse.from(news.list(page, size));
    }

    @GetMapping("/{slug}")
    NewsArticleResponse bySlug(@PathVariable String slug) {
        Slug parsed;
        try {
            parsed = new Slug(slug);
        } catch (IllegalArgumentException malformed) {
            throw new NewsArticleNotFound(slug);
        }
        return NewsArticleResponse.from(news.bySlug(parsed));
    }
}
