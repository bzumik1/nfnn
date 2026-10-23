package cz.novanadeje.app.operations.application.logs;

import cz.novanadeje.app.operations.domain.logs.InvalidLogPattern;
import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogFileNotFound;
import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogSearchResult;
import cz.novanadeje.app.operations.domain.logs.LogsUnavailable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LogReadingServiceTest {

    private static final LogFile BACKEND = new LogFile("backend.log", 100, Instant.parse("2026-10-23T10:00:00Z"), false);

    @Mock
    private LogStore store;

    private LogReadingService service;

    @BeforeEach
    void setUp() {
        service = new LogReadingService(store);
    }

    @Test
    @DisplayName("Given the folder is not mounted, when the files are asked, then the view says unavailable and a read answers 409")
    void should_say_unavailable_when_asked_given_no_folder() {
        when(store.isAvailable()).thenReturn(false);

        assertThat(service.files().available()).isFalse();
        assertThatThrownBy(() -> service.read("backend.log", Optional.empty(), null)).isInstanceOf(LogsUnavailable.class);
    }

    @Test
    @DisplayName("Given an unknown or odd name, when a log is read, then it is not found")
    void should_not_find_when_read_given_unknown_or_odd_name() {
        when(store.isAvailable()).thenReturn(true);
        when(store.file("missing.log")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("missing.log", Optional.empty(), null)).isInstanceOf(LogFileNotFound.class);
        assertThatThrownBy(() -> service.read("../etc/passwd", Optional.empty(), null)).isInstanceOf(LogFileNotFound.class);
    }

    @Test
    @DisplayName("Given a broken pattern, when a log is searched, then the pattern is refused before any read")
    void should_refuse_pattern_when_searched_given_broken_regex() {
        when(store.isAvailable()).thenReturn(true);
        when(store.file("backend.log")).thenReturn(Optional.of(BACKEND));

        assertThatThrownBy(() -> service.search("backend.log", "(", null, Optional.empty())).isInstanceOf(InvalidLogPattern.class);
        assertThatThrownBy(() -> service.search("backend.log", " ", null, Optional.empty())).isInstanceOf(InvalidLogPattern.class);
    }

    @Test
    @DisplayName("Given more matches than the limit, when a log is searched, then the limit is kept and older matches are announced")
    void should_announce_older_matches_when_searched_given_more_than_limit() {
        when(store.isAvailable()).thenReturn(true);
        when(store.file("backend.log")).thenReturn(Optional.of(BACKEND));
        when(store.search(eq(BACKEND), any(Pattern.class), eq(3), eq(Optional.empty())))
                .thenReturn(List.of(new LogMatch(80, "c"), new LogMatch(40, "b"), new LogMatch(0, "a")));

        LogSearchResult result = service.search("backend.log", "line", 2, Optional.empty());

        assertThat(result.matches()).extracting(LogMatch::line).containsExactly("c", "b");
        assertThat(result.moreOlder()).isTrue();
        assertThat(result.scannedFrom()).isEqualTo(40);
    }
}
