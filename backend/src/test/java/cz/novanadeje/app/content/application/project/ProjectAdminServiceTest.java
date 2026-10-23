package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.SlugTaken;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectAdminServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final MediaId IMAGE = MediaId.newId(NOW);

    @Mock
    private ProjectRepository projects;
    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;

    private ProjectAdminService service() {
        return new ProjectAdminService(projects, media, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a command without a slug, when a project is created, then the slug comes from the title, it is a draft and the creation is audited")
    void should_create_a_draft_with_a_slug_from_the_title_when_created_given_no_slug() {
        when(projects.isSlugTakenByAnother(any(), any())).thenReturn(false);

        ProjectView view = service().create(ADMIN, command("Pomohli jsme Dominikovi", Optional.empty(), Optional.empty()));

        assertThat(view.slug()).isEqualTo("pomohli-jsme-dominikovi");
        assertThat(view.publishedOn()).isEmpty();
        ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
        verify(projects).save(saved.capture());
        assertThat(saved.getValue().id()).isEqualTo(view.id());
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("CREATE_PROJECT");
        assertThat(audit.getValue().subjectId()).contains(view.id().value());
        assertThat(audit.getValue().details()).contains("'pomohli-jsme-dominikovi' created");
    }

    @Test
    @DisplayName("Given another project with the slug, when a project is created, then it is refused as a conflict and nothing is saved")
    void should_refuse_when_created_given_a_taken_slug() {
        when(projects.isSlugTakenByAnother(any(), any())).thenReturn(true);

        assertThatThrownBy(() -> service().create(ADMIN, command("Dominik", Optional.of("dominik"), Optional.empty())))
                .isInstanceOf(SlugTaken.class);

        verify(projects, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a cover image that was never uploaded, when a project is created, then it is refused")
    void should_refuse_when_created_given_an_unknown_image() {
        when(projects.isSlugTakenByAnother(any(), any())).thenReturn(false);
        when(media.exists(IMAGE)).thenReturn(false);

        assertThatThrownBy(() -> service().create(ADMIN, command("Dominik", Optional.empty(), Optional.of(IMAGE))))
                .isInstanceOf(MediaNotFound.class);
    }

    @Test
    @DisplayName("Given a published project, when it is updated with another image, then the old image is deleted when nothing else uses it and the change is audited")
    void should_drop_the_old_image_when_updated_given_a_new_cover() {
        MediaId newImage = MediaId.newId(NOW.plusSeconds(1));
        Project project = Project.create(ProjectId.newId(NOW), content("dominik", Optional.of(IMAGE)), NOW).publish(LocalDate.parse("2026-10-20"), NOW);
        when(projects.findById(project.id())).thenReturn(Optional.of(project));
        when(projects.isSlugTakenByAnother(any(), any())).thenReturn(false);
        when(media.exists(newImage)).thenReturn(true);
        when(projects.isImageUsed(IMAGE)).thenReturn(false);

        ProjectView view = service().update(ADMIN, project.id(), command("Dominik znovu", Optional.of("dominik"), Optional.of(newImage)));

        assertThat(view.title()).isEqualTo("Dominik znovu");
        assertThat(view.publishedOn()).contains(LocalDate.parse("2026-10-20"));
        verify(media).delete(IMAGE);
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("UPDATE_PROJECT");
    }

    @Test
    @DisplayName("Given a draft, when it is published on a day, then the day is stored and audited")
    void should_publish_on_the_day_when_published_given_a_draft() {
        Project project = Project.create(ProjectId.newId(NOW), content("dominik", Optional.empty()), NOW);
        when(projects.findById(project.id())).thenReturn(Optional.of(project));

        ProjectView view = service().publish(ADMIN, project.id(), LocalDate.parse("2026-10-23"));

        assertThat(view.publishedOn()).contains(LocalDate.parse("2026-10-23"));
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("PUBLISH_PROJECT");
        assertThat(audit.getValue().details()).endsWith("published on 2026-10-23");
    }

    @Test
    @DisplayName("Given a project with an image nothing else uses, when it is deleted, then the project and the image go and the deletion is audited")
    void should_delete_with_its_image_when_deleted() {
        Project project = Project.create(ProjectId.newId(NOW), content("dominik", Optional.of(IMAGE)), NOW);
        when(projects.findById(project.id())).thenReturn(Optional.of(project));
        when(projects.isImageUsed(IMAGE)).thenReturn(false);

        service().delete(ADMIN, project.id());

        verify(projects).delete(project.id());
        verify(media).delete(IMAGE);
        ArgumentCaptor<AdminActionPerformed> audit = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(audit.capture());
        assertThat(audit.getValue().action()).isEqualTo("DELETE_PROJECT");
    }

    @Test
    @DisplayName("Given no such project, when it is unpublished, then it is not found")
    void should_fail_when_unpublished_given_no_project() {
        ProjectId id = ProjectId.newId(NOW);
        when(projects.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().unpublish(ADMIN, id)).isInstanceOf(ProjectNotFound.class);
    }

    private static ProjectCommand command(String title, Optional<String> slug, Optional<MediaId> image) {
        return new ProjectCommand(title, 2024, slug, Optional.of("Projekt"), "Perex", "Text", image);
    }

    private static ProjectContent content(String slug, Optional<MediaId> image) {
        return new ProjectContent(new Slug(slug), "Dominik", 2024, Optional.of("Projekt"), "Perex", "Text", image);
    }
}
