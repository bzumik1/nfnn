package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.application.ContentVersions;
import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.domain.ChangedMeanwhile;
import cz.novanadeje.app.content.domain.FormerSlugs;
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
public class ProjectAdminService {

    static final String CREATE_ACTION = "CREATE_PROJECT";
    static final String UPDATE_ACTION = "UPDATE_PROJECT";
    static final String PUBLISH_ACTION = "PUBLISH_PROJECT";
    static final String UNPUBLISH_ACTION = "UNPUBLISH_PROJECT";
    static final String DELETE_ACTION = "DELETE_PROJECT";

    private static final Logger log = LoggerFactory.getLogger(ProjectAdminService.class);

    private final ProjectRepository projects;
    private final ProjectOrderRepository orders;
    private final MediaImageRepository media;
    private final FormerSlugs formerSlugs;
    private final ContentVersions versions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ProjectAdminService(ProjectRepository projects, ProjectOrderRepository orders, MediaImageRepository media, FormerSlugs formerSlugs,
                               ContentVersions versions, ApplicationEventPublisher events, Clock clock) {
        this.projects = projects;
        this.orders = orders;
        this.media = media;
        this.formerSlugs = formerSlugs;
        this.versions = versions;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Versioned<ProjectView>> list() {
        LocalDate today = today(clock.instant());
        List<Project> all = projects.findAllDraftsFirst(orders.current());
        List<ProjectView> views = ProjectView.all(all, today, media);
        return IntStream.range(0, all.size()).mapToObj(index -> new Versioned<>(views.get(index), versions.of(all.get(index)))).toList();
    }

    @Transactional(readOnly = true)
    public Versioned<ProjectView> get(ProjectId id) {
        return versioned(require(id), today(clock.instant()));
    }

    public Versioned<ProjectView> create(UUID adminId, ProjectCommand command) {
        Instant now = clock.instant();
        ProjectId id = ProjectId.newId(now);
        ProjectContent content = checked(command.toContent(), id);
        Project article = Project.create(id, content, now);
        projects.save(article);
        formerSlugs.forgetProject(content.slug());
        audit(adminId, CREATE_ACTION, article, "Projekt " + id + " „" + content.slug() + "“ napsán", now);
        return versioned(article, today(now));
    }

    public Versioned<ProjectView> update(UUID adminId, ProjectId id, ExpectedVersion expected, ProjectCommand command) {
        Project article = requireUnchanged(id, expected);
        Instant now = clock.instant();
        ProjectContent content = checked(command.toContent(), id);
        Project edited = article.edit(content, now);
        projects.save(edited);
        rememberFormerSlug(article, edited, now);
        dropUnusedImage(article.content().coverImage(), content.coverImage());
        audit(adminId, UPDATE_ACTION, edited, "Projekt " + id + " „" + content.slug() + "“ upraven", now);
        return versioned(edited, today(now));
    }

    public Versioned<ProjectView> publish(UUID adminId, ProjectId id, LocalDate on, ExpectedVersion expected) {
        Project stored = requireUnchanged(id, expected);
        Instant now = clock.instant();
        Project published = stored.publish(on, now);
        projects.save(published);
        audit(adminId, PUBLISH_ACTION, published, "Projekt " + id + " „" + published.slug() + "“ zveřejněn od " + on, now);
        return versioned(published, today(now));
    }

    public Versioned<ProjectView> unpublish(UUID adminId, ProjectId id, ExpectedVersion expected) {
        Project stored = requireUnchanged(id, expected);
        Instant now = clock.instant();
        Project draft = stored.unpublish(now);
        projects.save(draft);
        audit(adminId, UNPUBLISH_ACTION, draft, "Projekt " + id + " „" + draft.slug() + "“ stažen z webu", now);
        return versioned(draft, today(now));
    }

    public void delete(UUID adminId, ProjectId id, ExpectedVersion expected) {
        Project article = requireUnchanged(id, expected);
        Instant now = clock.instant();
        projects.delete(id);
        dropUnusedImage(article.content().coverImage(), Optional.empty());
        audit(adminId, DELETE_ACTION, article, "Projekt " + id + " „" + article.slug() + "“ smazán", now);
    }

    private void rememberFormerSlug(Project before, Project after, Instant now) {
        formerSlugs.forgetProject(after.slug());
        if (!before.slug().equals(after.slug())) {
            formerSlugs.rememberProject(before.slug(), after.id(), now);
        }
    }

    private ProjectContent checked(ProjectContent content, ProjectId id) {
        if (projects.isSlugTakenByAnother(content.slug(), id)) {
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

    private Versioned<ProjectView> versioned(Project project, LocalDate today) {
        return new Versioned<>(ProjectView.of(project, today, media), versions.of(project));
    }

    private Project requireUnchanged(ProjectId id, ExpectedVersion expected) {
        Project current = projects.findByIdForUpdate(id).orElseThrow(() -> new ProjectNotFound(id));
        String version = versions.of(current);
        if (!expected.admits(version)) {
            throw new ChangedMeanwhile(version, ContentVersions.StoredProject.of(current));
        }
        return current;
    }

    private Project require(ProjectId id) {
        return projects.findById(id).orElseThrow(() -> new ProjectNotFound(id));
    }

    private static LocalDate today(Instant now) {
        return LocalDate.ofInstant(now, FoundationZone.ZONE);
    }

    private void audit(UUID adminId, String action, Project article, String details, Instant now) {
        String titled = details + "; titulek „" + article.content().title() + "“";
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.of(article.id().value()), titled, now));
        log.info("{} on project {} by admin {}", action, article.id(), adminId);
    }
}
