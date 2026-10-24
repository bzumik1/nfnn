package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.FormerSlugs;
import cz.novanadeje.app.content.domain.SlugTaken;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class NewsAdminService {

    static final String CREATE_ACTION = "CREATE_NEWS";
    static final String UPDATE_ACTION = "UPDATE_NEWS";
    static final String PUBLISH_ACTION = "PUBLISH_NEWS";
    static final String UNPUBLISH_ACTION = "UNPUBLISH_NEWS";
    static final String DELETE_ACTION = "DELETE_NEWS";

    private static final Logger log = LoggerFactory.getLogger(NewsAdminService.class);

    private final NewsArticleRepository news;
    private final MediaImageRepository media;
    private final FormerSlugs formerSlugs;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public NewsAdminService(NewsArticleRepository news, MediaImageRepository media, FormerSlugs formerSlugs, ApplicationEventPublisher events,
                            Clock clock) {
        this.news = news;
        this.media = media;
        this.formerSlugs = formerSlugs;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<NewsArticleView> list() {
        LocalDate today = today(clock.instant());
        return news.findAllDraftsFirst().stream().map(article -> NewsArticleView.from(article, today)).toList();
    }

    @Transactional(readOnly = true)
    public NewsArticleView get(NewsArticleId id) {
        return NewsArticleView.from(require(id), today(clock.instant()));
    }

    public NewsArticleView create(UUID adminId, NewsArticleCommand command) {
        Instant now = clock.instant();
        NewsArticleId id = NewsArticleId.newId(now);
        NewsContent content = checked(command.toContent(), id);
        NewsArticle article = NewsArticle.create(id, content, now);
        news.save(article);
        formerSlugs.forget(content.slug());
        audit(adminId, CREATE_ACTION, article, "Aktualita " + id + " „" + content.slug() + "“ napsána", now);
        return NewsArticleView.from(article, today(now));
    }

    public NewsArticleView update(UUID adminId, NewsArticleId id, NewsArticleCommand command) {
        Instant now = clock.instant();
        NewsArticle article = require(id);
        NewsContent content = checked(command.toContent(), id);
        NewsArticle edited = article.edit(content, now);
        news.save(edited);
        rememberFormerSlug(article, edited, now);
        dropUnusedImage(article.content().coverImage(), content.coverImage());
        audit(adminId, UPDATE_ACTION, edited, "Aktualita " + id + " „" + content.slug() + "“ upravena", now);
        return NewsArticleView.from(edited, today(now));
    }

    public NewsArticleView publish(UUID adminId, NewsArticleId id, LocalDate on) {
        Instant now = clock.instant();
        NewsArticle published = require(id).publish(on, now);
        news.save(published);
        audit(adminId, PUBLISH_ACTION, published, "Aktualita " + id + " „" + published.slug() + "“ zveřejněna od " + on, now);
        return NewsArticleView.from(published, today(now));
    }

    public NewsArticleView unpublish(UUID adminId, NewsArticleId id) {
        Instant now = clock.instant();
        NewsArticle draft = require(id).unpublish(now);
        news.save(draft);
        audit(adminId, UNPUBLISH_ACTION, draft, "Aktualita " + id + " „" + draft.slug() + "“ stažena z webu", now);
        return NewsArticleView.from(draft, today(now));
    }

    public void delete(UUID adminId, NewsArticleId id) {
        Instant now = clock.instant();
        NewsArticle article = require(id);
        news.delete(id);
        dropUnusedImage(article.content().coverImage(), Optional.empty());
        audit(adminId, DELETE_ACTION, article, "Aktualita " + id + " „" + article.slug() + "“ smazána", now);
    }

    private void rememberFormerSlug(NewsArticle before, NewsArticle after, Instant now) {
        formerSlugs.forget(after.slug());
        if (!before.slug().equals(after.slug())) {
            formerSlugs.rememberNews(before.slug(), after.id(), now);
        }
    }

    private NewsContent checked(NewsContent content, NewsArticleId id) {
        if (news.isSlugTakenByAnother(content.slug(), id)) {
            throw new SlugTaken(content.slug());
        }
        content.coverImage().filter(image -> !media.exists(image)).ifPresent(image -> {
            throw new MediaNotFound(image);
        });
        return content;
    }

    private void dropUnusedImage(Optional<MediaId> previous, Optional<MediaId> current) {
        previous.filter(image -> !current.equals(previous)).ifPresent(media::deleteIfUnused);
    }

    private NewsArticle require(NewsArticleId id) {
        return news.findById(id).orElseThrow(() -> new NewsArticleNotFound(id));
    }

    private static LocalDate today(Instant now) {
        return LocalDate.ofInstant(now, FoundationZone.ZONE);
    }

    private void audit(UUID adminId, String action, NewsArticle article, String details, Instant now) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.of(article.id().value()), details, now));
        log.info("{} on news article {} by admin {}", action, article.id(), adminId);
    }
}
