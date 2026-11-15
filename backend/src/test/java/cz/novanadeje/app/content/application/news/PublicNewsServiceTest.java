package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.news.FormerNewsSlugs;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
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
class PublicNewsServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 15);

    @Mock
    private NewsArticleRepository news;
    @Mock
    private FormerNewsSlugs formerSlugs;
    @Mock
    private NewsSigners signers;

    private PublicNewsService service() {
        return new PublicNewsService(news, formerSlugs, signers, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a page whose first article lies beyond the largest offset, when the public list is asked for, then an empty page with the total is answered and no article is read")
    void should_answer_an_empty_page_with_the_total_when_listed_given_a_page_beyond_the_largest_offset() {
        when(news.countVisible(TODAY)).thenReturn(12L);

        NewsPage page = service().list(Integer.MAX_VALUE / 2 + 1, 2);

        assertThat(page).isEqualTo(new NewsPage(List.of(), Integer.MAX_VALUE / 2 + 1, 2, 12));
        verify(news, never()).findVisibleNewestFirst(any(), anyInt(), anyInt());
        verifyNoInteractions(signers);
    }

    @Test
    @DisplayName("Given the last page whose first article lies within the largest offset, when the public list is asked for, then it is read from that offset")
    void should_read_from_the_offset_when_listed_given_the_last_page_within_the_largest_offset() {
        int lastPage = Integer.MAX_VALUE / 2;
        when(news.findVisibleNewestFirst(TODAY, lastPage * 2, 2)).thenReturn(List.of());
        when(signers.views(List.of(), TODAY)).thenReturn(List.of());
        when(news.countVisible(TODAY)).thenReturn(12L);

        assertThat(service().list(lastPage, 2)).isEqualTo(new NewsPage(List.of(), lastPage, 2, 12));
    }
}
