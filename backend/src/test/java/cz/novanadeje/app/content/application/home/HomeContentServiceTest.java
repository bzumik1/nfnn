package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.about.AboutPhotoView;
import cz.novanadeje.app.content.application.about.AboutService;
import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.people.BoardMemberView;
import cz.novanadeje.app.content.application.people.PublicPeopleService;
import cz.novanadeje.app.content.application.people.PublicPeopleView;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.Slug;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HomeContentServiceTest {

    private static final Instant LATE_EVENING_UTC = Instant.parse("2026-10-23T22:30:00Z");
    private static final LocalDate PRAGUE_DAY = LocalDate.of(2026, 10, 24);

    private final NewsArticleRepository news = mock(NewsArticleRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ProjectOrderRepository projectOrders = mock(ProjectOrderRepository.class);
    private final AboutService about = mock(AboutService.class);
    private final PublicPeopleService people = mock(PublicPeopleService.class);
    private final HomeContentService service = new HomeContentService(news, projects, projectOrders, about, people,
            Clock.fixed(LATE_EVENING_UTC, ZoneOffset.UTC));

    @Test
    @DisplayName("Given published news and projects, when the home content is read, then it asks for the three newest news articles and the first three projects in the chosen order visible on the Prague day")
    void should_carry_three_news_and_three_projects_when_read_given_published_content() {
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(LATE_EVENING_UTC), new NewsContent(new Slug("zprava"), "Zpráva", Optional.empty(), "Perex", "Text", Optional.empty()), LATE_EVENING_UTC);
        Project project = Project.create(ProjectId.newId(LATE_EVENING_UTC), new ProjectContent(new Slug("dominik"), "Dominik", 2024, Optional.empty(), "Perex", "Text", Optional.empty()), LATE_EVENING_UTC);
        when(news.findVisibleNewestFirst(eq(PRAGUE_DAY), eq(0), anyInt())).thenReturn(List.of(article));
        when(projectOrders.current()).thenReturn(ProjectOrder.CATEGORY_THEN_YEAR);
        when(projects.findVisible(eq(PRAGUE_DAY), any(), eq(0), anyInt())).thenReturn(List.of(project));
        when(about.read()).thenReturn(new AboutView(Optional.empty()));

        HomeContent content = service.read();

        assertThat(content.news()).singleElement().satisfies(view -> assertThat(view.title()).isEqualTo("Zpráva"));
        assertThat(content.projects()).singleElement().satisfies(view -> assertThat(view.year()).isEqualTo(2024));
        verify(news).findVisibleNewestFirst(PRAGUE_DAY, 0, 3);
        verify(projects).findVisible(PRAGUE_DAY, ProjectOrder.CATEGORY_THEN_YEAR, 0, 3);
    }

    @Test
    @DisplayName("Given nothing published, when the home content is read, then both lists are empty")
    void should_be_empty_when_read_given_nothing_published() {
        when(news.findVisibleNewestFirst(eq(PRAGUE_DAY), eq(0), anyInt())).thenReturn(List.of());
        when(projects.findVisible(eq(PRAGUE_DAY), any(), eq(0), anyInt())).thenReturn(List.of());
        when(about.read()).thenReturn(new AboutView(Optional.empty()));

        HomeContent content = service.read();

        assertThat(content.news()).isEmpty();
        assertThat(content.projects()).isEmpty();
    }

    @Test
    @DisplayName("Given a photo in the About section, when the home content is read, then it carries the photo with its size and texts")
    void should_carry_the_about_photo_when_read_given_a_photo_in_the_about_section() {
        AboutPhotoView photo = new AboutPhotoView(MediaId.newId(LATE_EVENING_UTC), 1413, 1884, Optional.of("Chlapec v náručí"), Optional.of("Kde to začalo"));
        when(news.findVisibleNewestFirst(eq(PRAGUE_DAY), eq(0), anyInt())).thenReturn(List.of());
        when(projects.findVisible(eq(PRAGUE_DAY), any(), eq(0), anyInt())).thenReturn(List.of());
        when(about.read()).thenReturn(new AboutView(Optional.of(photo)));

        HomeContent content = service.read();

        assertThat(content.about().photo()).contains(photo);
    }

    @Test
    @DisplayName("Given the people of the foundation, when the home content is read, then it carries them, and without people it carries none")
    void should_carry_the_people_when_read_given_people_of_the_foundation() {
        PublicPeopleView shown = new PublicPeopleView(List.of(), List.of(new BoardMemberView("Eva Vzorová", Optional.empty())), Optional.empty());
        when(news.findVisibleNewestFirst(eq(PRAGUE_DAY), eq(0), anyInt())).thenReturn(List.of());
        when(projects.findVisibleNewestFirst(eq(PRAGUE_DAY), eq(0), anyInt())).thenReturn(List.of());
        when(about.read()).thenReturn(new AboutView(Optional.empty()));
        when(people.read()).thenReturn(Optional.of(shown), Optional.empty());

        assertThat(service.read().people()).contains(shown);
        assertThat(service.read().people()).isEmpty();
    }
}
