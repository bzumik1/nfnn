package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.FormerSlugs;
import cz.novanadeje.app.content.domain.SlugTaken;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
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
public class ProjectAdminService {

    static final String CREATE_ACTION = "CREATE_PROJECT";
    static final String UPDATE_ACTION = "UPDATE_PROJECT";
    static final String PUBLISH_ACTION = "PUBLISH_PROJECT";
    static final String UNPUBLISH_ACTION = "UNPUBLISH_PROJECT";
    static final String DELETE_ACTION = "DELETE_PROJECT";

    private static final Logger log = LoggerFactory.getLogger(ProjectAdminService.class);

    private final ProjectRepository projects;
    private final MediaImageRepository media;
    private final FormerSlugs formerSlugs;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ProjectAdminService(ProjectRepository projects, MediaImageRepository media, FormerSlugs formerSlugs, ApplicationEventPublisher events,
                               Clock clock) {
        this.projects = projects;
        this.media = media;
        this.formerSlugs = formerSlugs;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ProjectView> list() {
        return projects.findAllDraftsFirst().stream().map(ProjectView::from).toList();
    }

    @Transactional(readOnly = true)
    public ProjectView get(ProjectId id) {
        return ProjectView.from(require(id));
    }

    public ProjectView create(UUID adminId, ProjectCommand command) {
        Instant now = clock.instant();
        ProjectId id = ProjectId.newId(now);
        ProjectContent content = checked(command.toContent(), id);
        Project article = Project.create(id, content, now);
        projects.save(article);
        formerSlugs.forget(content.slug());
        audit(adminId, CREATE_ACTION, article, "Projekt " + id + " „" + content.slug() + "“ napsán", now);
        return ProjectView.from(article);
    }

    public ProjectView update(UUID adminId, ProjectId id, ProjectCommand command) {
        Instant now = clock.instant();
        Project article = require(id);
        ProjectContent content = checked(command.toContent(), id);
        Project edited = article.edit(content, now);
        projects.save(edited);
        rememberFormerSlug(article, edited, now);
        dropUnusedImage(article.content().coverImage(), content.coverImage());
        audit(adminId, UPDATE_ACTION, edited, "Projekt " + id + " „" + content.slug() + "“ upraven", now);
        return ProjectView.from(edited);
    }

    public ProjectView publish(UUID adminId, ProjectId id, LocalDate on) {
        Instant now = clock.instant();
        Project published = require(id).publish(on, now);
        projects.save(published);
        audit(adminId, PUBLISH_ACTION, published, "Projekt " + id + " „" + published.slug() + "“ zveřejněn od " + on, now);
        return ProjectView.from(published);
    }

    public ProjectView unpublish(UUID adminId, ProjectId id) {
        Instant now = clock.instant();
        Project draft = require(id).unpublish(now);
        projects.save(draft);
        audit(adminId, UNPUBLISH_ACTION, draft, "Projekt " + id + " „" + draft.slug() + "“ stažen z webu", now);
        return ProjectView.from(draft);
    }

    public void delete(UUID adminId, ProjectId id) {
        Instant now = clock.instant();
        Project article = require(id);
        projects.delete(id);
        dropUnusedImage(article.content().coverImage(), Optional.empty());
        audit(adminId, DELETE_ACTION, article, "Projekt " + id + " „" + article.slug() + "“ smazán", now);
    }

    private void rememberFormerSlug(Project before, Project after, Instant now) {
        formerSlugs.forget(after.slug());
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

    private Project require(ProjectId id) {
        return projects.findById(id).orElseThrow(() -> new ProjectNotFound(id));
    }

    private void audit(UUID adminId, String action, Project article, String details, Instant now) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.of(article.id().value()), details, now));
        log.info("{} on project {} by admin {}", action, article.id(), adminId);
    }
}
