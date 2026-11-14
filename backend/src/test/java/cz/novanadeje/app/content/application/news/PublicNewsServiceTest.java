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
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class PublicNewsServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");

    @Mock
    private NewsArticleRepository news;
    @Mock
    private FormerNewsSlugs formerSlugs;
    @Mock
    private NewsSigners signers;

    @Test
    @DisplayName("Given a page whose first article lies beyond the largest offset, when the public list is asked for, then it is refused as the client's error before any read")
    void should_refuse_as_the_clients_error_when_listed_given_a_page_beyond_the_largest_offset() {
        PublicNewsService service = new PublicNewsService(news, formerSlugs, signers, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatThrownBy(() -> service.list(Integer.MAX_VALUE / 2 + 1, 2)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(news, signers);
    }
}
