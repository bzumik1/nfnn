package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.project.FormerProjectSlugs;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicProjectServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 15);

    @Mock
    private ProjectRepository projects;
    @Mock
    private ProjectOrderRepository orders;
    @Mock
    private FormerProjectSlugs formerSlugs;
    @Mock
    private ProjectViews views;

    private PublicProjectService service() {
        return new PublicProjectService(projects, orders, formerSlugs, views, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a page whose first project lies beyond the largest offset, when the public list is asked for, then an empty page with the total is answered and no project is read")
    void should_answer_an_empty_page_with_the_total_when_listed_given_a_page_beyond_the_largest_offset() {
        when(projects.countVisible(TODAY)).thenReturn(7L);

        ProjectPage page = service().list(Integer.MAX_VALUE / 3 + 1, 3);

        assertThat(page).isEqualTo(new ProjectPage(List.of(), Integer.MAX_VALUE / 3 + 1, 3, 7));
        assertThat(page.hasMore()).isFalse();
        verify(projects, never()).findVisible(any(), any(), anyInt(), anyInt());
        verifyNoInteractions(orders, views);
    }

    @Test
    @DisplayName("Given the last page whose first project lies within the largest offset, when the public list is asked for, then it is read from that offset")
    void should_read_from_the_offset_when_listed_given_the_last_page_within_the_largest_offset() {
        int lastPage = Integer.MAX_VALUE / 3;
        ProjectOrder order = ProjectOrder.DEFAULT;
        when(orders.current()).thenReturn(order);
        when(projects.findVisible(TODAY, order, lastPage * 3, 3)).thenReturn(List.of());
        when(views.of(List.of(), TODAY)).thenReturn(List.of());
        when(projects.countVisible(TODAY)).thenReturn(7L);

        assertThat(service().list(lastPage, 3)).isEqualTo(new ProjectPage(List.of(), lastPage, 3, 7));
    }
}
