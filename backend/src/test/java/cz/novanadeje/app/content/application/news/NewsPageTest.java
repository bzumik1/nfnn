package cz.novanadeje.app.content.application.news;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class NewsPageTest {

    @Test
    @DisplayName("Given the last page of an int, when asked whether more follow, then none do, however large the size")
    void should_say_none_follow_when_asked_given_the_last_page_of_an_int() {
        assertThat(new NewsPage(List.of(), Integer.MAX_VALUE, 50, 12).hasMore()).isFalse();
        assertThat(new NewsPage(List.of(), Integer.MAX_VALUE, 1, 12).hasMore()).isFalse();
    }

    @Test
    @DisplayName("Given a page before the last item, when asked whether more follow, then they do")
    void should_say_more_follow_when_asked_given_a_page_before_the_last_item() {
        assertThat(new NewsPage(List.of(), 0, 10, 12).hasMore()).isTrue();
    }
}
