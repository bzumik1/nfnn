package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.news.LookBackYearTaken;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleNotFound;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.application.ContentVersions;
import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.domain.ChangedMeanwhile;
import cz.novanadeje.app.content.domain.news.FormerNewsSlugs;
import cz.novanadeje.app.content.domain.SlugTaken;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
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
import java.util.stream.IntStream;

@Service
@Transactional
public class NewsAdminService {

    static final String CREATE_ACTION = "CREATE_NEWS";
    static final String UPDATE_ACTION = "UPDATE_NEWS";
    static final String PUBLISH_ACTION = "PUBLISH_NEWS";
    static final String UNPUBLISH_ACTION = "UNPUBLISH_NEWS";
    static final String DELETE_ACTION = "DELETE_NEWS";
    static final String LOOK_BACK_ACTION = "CHANGE_NEWS_LOOK_BACK_YEAR";

    private static final Logger log = LoggerFactory.getLogger(NewsAdminService.class);

    private final NewsArticleRepository news;
    private final MediaImageRepository media;
    private final FormerNewsSlugs formerSlugs;
    private final NewsSigners signers;
    private final ContentVersions versions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public NewsAdminService(NewsArticleRepository news, MediaImageRepository media, FormerNewsSlugs formerSlugs, NewsSigners signers,
                            ContentVersions versions, ApplicationEventPublisher events, Clock clock) {
        this.news = news;
        this.media = media;
        this.formerSlugs = formerSlugs;
        this.signers = signers;
        this.versions = versions;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Versioned<NewsArticleView>> list() {
        LocalDate today = today(clock.instant());
        return versioned(news.findAllDraftsFirst(), today);
    }

    @Transactional(readOnly = true)
    public Versioned<NewsArticleView> get(NewsArticleId id) {
        return versioned(require(id), today(clock.instant()));
    }

    public Versioned<NewsArticleView> create(UUID adminId, NewsArticleCommand command) {
        return create(adminId, command, Optional.empty());
    }

    public Versioned<NewsArticleView> create(UUID adminId, NewsArticleCommand command, Optional<Integer> lookBackYear) {
        Instant now = clock.instant();
        NewsArticleId id = NewsArticleId.newId(now);
        NewsContent content = checked(command.toContent(), id);
        requireFreeYear(lookBackYear, id);
        NewsArticle article = NewsArticle.create(id, content, lookBackYear, now);
        news.save(article);
        formerSlugs.forgetNews(content.slug());
        audit(adminId, CREATE_ACTION, article, "Aktualita " + id + " „" + content.slug() + "“ napsána", now);
        if (lookBackYear.isPresent()) {
            auditLookBack(adminId, article, lookBackYear, now);
        }
        return versioned(article, today(now));
    }

    public Versioned<NewsArticleView> update(UUID adminId, NewsArticleId id, ExpectedVersion expected, NewsArticleCommand command) {
        NewsArticle article = requireUnchanged(id, expected);
        Instant now = clock.instant();
        NewsContent content = checked(command.toContent(), id);
        NewsArticle edited = article.edit(content, now);
        news.save(edited);
        rememberFormerSlug(article, edited, now);
        dropUnusedImage(article.content().coverImage(), content.coverImage());
        audit(adminId, UPDATE_ACTION, edited, "Aktualita " + id + " „" + content.slug() + "“ upravena", now);
        return versioned(edited, today(now));
    }

    public Versioned<NewsArticleView> publish(UUID adminId, NewsArticleId id, LocalDate on, ExpectedVersion expected) {
        NewsArticle stored = requireUnchanged(id, expected);
        Instant now = clock.instant();
        NewsArticle published = stored.publish(on, now);
        news.save(published);
        audit(adminId, PUBLISH_ACTION, published, "Aktualita " + id + " „" + published.slug() + "“ zveřejněna od " + on, now);
        return versioned(published, today(now));
    }

    public Versioned<NewsArticleView> unpublish(UUID adminId, NewsArticleId id, ExpectedVersion expected) {
        NewsArticle stored = requireUnchanged(id, expected);
        Instant now = clock.instant();
        NewsArticle draft = stored.unpublish(now);
        news.save(draft);
        audit(adminId, UNPUBLISH_ACTION, draft, "Aktualita " + id + " „" + draft.slug() + "“ stažena z webu", now);
        return versioned(draft, today(now));
    }

    public Versioned<NewsArticleView> changeLookBackYear(UUID adminId, NewsArticleId id, ExpectedVersion expected, Optional<Integer> year) {
        NewsArticle stored = requireUnchanged(id, expected);
        Instant now = clock.instant();
        if (stored.lookBackYear().equals(year)) {
            return versioned(stored, today(now));
        }
        requireFreeYear(year, id);
        NewsArticle changed = stored.lookBackOn(year, now);
        news.save(changed);
        auditLookBack(adminId, changed, year, now);
        return versioned(changed, today(now));
    }

    private void auditLookBack(UUID adminId, NewsArticle article, Optional<Integer> year, Instant now) {
        String looking = year.map(chosen -> "se ohlíží za rokem " + chosen).orElse("se už neohlíží za žádným rokem");
        audit(adminId, LOOK_BACK_ACTION, article, "Aktualita " + article.id() + " „" + article.slug() + "“ " + looking, now);
    }

    public void delete(UUID adminId, NewsArticleId id, ExpectedVersion expected) {
        NewsArticle article = requireUnchanged(id, expected);
        Instant now = clock.instant();
        news.delete(id);
        dropUnusedImage(article.content().coverImage(), Optional.empty());
        audit(adminId, DELETE_ACTION, article, "Aktualita " + id + " „" + article.slug() + "“ smazána", now);
    }

    private void rememberFormerSlug(NewsArticle before, NewsArticle after, Instant now) {
        formerSlugs.forgetNews(after.slug());
        if (!before.slug().equals(after.slug())) {
            formerSlugs.rememberNews(before.slug(), after.id(), now);
        }
    }

    private NewsContent checked(NewsContent content, NewsArticleId id) {
        if (news.isSlugTakenByAnother(content.slug(), id)) {
            throw new SlugTaken(content.slug());
        }
        content.coverImage().ifPresent(media::lockForUse);
        content.coverImage().filter(image -> !media.exists(image)).ifPresent(image -> {
            throw new MediaNotFound(image);
        });
        signers.requireExisting(content.signer());
        return content;
    }

    private void requireFreeYear(Optional<Integer> year, NewsArticleId id) {
        year.filter(chosen -> news.isLookBackYearTakenByAnother(chosen, id)).ifPresent(chosen -> {
            throw new LookBackYearTaken(chosen);
        });
    }

    private void dropUnusedImage(Optional<MediaId> previous, Optional<MediaId> current) {
        previous.filter(image -> !current.equals(previous)).ifPresent(media::deleteIfUnused);
    }

    private List<Versioned<NewsArticleView>> versioned(List<NewsArticle> articles, LocalDate today) {
        List<NewsArticleView> views = signers.views(articles, today);
        return IntStream.range(0, articles.size())
                .mapToObj(index -> new Versioned<>(views.get(index), versions.of(articles.get(index)))).toList();
    }

    private Versioned<NewsArticleView> versioned(NewsArticle article, LocalDate today) {
        return versioned(List.of(article), today).getFirst();
    }

    private NewsArticle requireUnchanged(NewsArticleId id, ExpectedVersion expected) {
        NewsArticle current = news.findByIdForUpdate(id).orElseThrow(() -> new NewsArticleNotFound(id));
        String version = versions.of(current);
        if (!expected.admits(version)) {
            throw new ChangedMeanwhile(version, ContentVersions.StoredNewsArticle.of(current));
        }
        return current;
    }

    private NewsArticle require(NewsArticleId id) {
        return news.findById(id).orElseThrow(() -> new NewsArticleNotFound(id));
    }

    private static LocalDate today(Instant now) {
        return LocalDate.ofInstant(now, FoundationZone.ZONE);
    }

    private void audit(UUID adminId, String action, NewsArticle article, String details, Instant now) {
        String titled = details + "; titulek „" + article.content().title() + "“";
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.of(article.id().value()), titled, now));
        log.info("{} on news article {} by admin {}", action, article.id(), adminId);
    }
}
