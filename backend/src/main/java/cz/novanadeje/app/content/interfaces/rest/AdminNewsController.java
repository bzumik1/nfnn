package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsAdminService;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/news")
class AdminNewsController {

    private final NewsAdminService news;

    AdminNewsController(NewsAdminService news) {
        this.news = news;
    }

    @GetMapping
    NewsListResponse list() {
        return NewsListResponse.fromVersioned(news.list());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    NewsArticleResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewsArticleRequest request) {
        return NewsArticleResponse.from(news.create(admin(jwt), request.toCommand(), request.chosenLookBackYear()));
    }

    @GetMapping("/{id}")
    NewsArticleResponse get(@PathVariable UUID id) {
        return NewsArticleResponse.from(news.get(new NewsArticleId(id)));
    }

    @PutMapping("/{id}")
    NewsArticleResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody NewsArticleRequest request,
                       ExpectedVersion expected) {
        return NewsArticleResponse.from(news.update(admin(jwt), new NewsArticleId(id), expected, request.toCommand()));
    }

    @PutMapping("/{id}/look-back-year")
    NewsArticleResponse changeLookBackYear(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody LookBackYearRequest request,
                                           ExpectedVersion expected) {
        return NewsArticleResponse.from(news.changeLookBackYear(admin(jwt), new NewsArticleId(id), expected, request.chosenYear()));
    }

    @PostMapping("/{id}/publish")
    NewsArticleResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PublishRequest request,
                        ExpectedVersion expected) {
        return NewsArticleResponse.from(news.publish(admin(jwt), new NewsArticleId(id), request.publishedOn(), expected));
    }

    @PostMapping("/{id}/unpublish")
    NewsArticleResponse unpublish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, ExpectedVersion expected) {
        return NewsArticleResponse.from(news.unpublish(admin(jwt), new NewsArticleId(id), expected));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, ExpectedVersion expected) {
        news.delete(admin(jwt), new NewsArticleId(id), expected);
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
