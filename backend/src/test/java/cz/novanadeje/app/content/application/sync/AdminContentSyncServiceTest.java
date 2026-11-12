package cz.novanadeje.app.content.application.sync;

import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.application.about.AboutService;
import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.donateband.DonateBandService;
import cz.novanadeje.app.content.application.donateband.DonateBandView;
import cz.novanadeje.app.content.application.news.NewsAdminService;
import cz.novanadeje.app.content.application.people.FoundersNoteService;
import cz.novanadeje.app.content.application.people.PeopleAdminService;
import cz.novanadeje.app.content.application.people.PeopleFootnoteService;
import cz.novanadeje.app.content.application.project.ProjectAdminService;
import cz.novanadeje.app.content.application.project.ProjectOrderService;
import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminContentSyncServiceTest {

    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-0000000000aa");

    @Mock
    private AdministrationHolders administrationHolders;
    @Mock
    private NewsAdminService news;
    @Mock
    private ProjectAdminService projects;
    @Mock
    private ProjectOrderService projectOrder;
    @Mock
    private AboutService about;
    @Mock
    private DonateBandService donateBand;
    @Mock
    private PeopleAdminService people;
    @Mock
    private FoundersNoteService foundersNote;
    @Mock
    private PeopleFootnoteService peopleFootnote;

    private AdminContentSyncService service;

    @BeforeEach
    void setUp() {
        service = new AdminContentSyncService(administrationHolders, news, projects, projectOrder, about, donateBand, people, foundersNote, peopleFootnote);
    }

    @Test
    @DisplayName("Given an account without the administration, when its content snapshot is taken, then it holds nothing and no content is read")
    void should_hold_nothing_when_snapshot_taken_given_account_without_administration() {
        when(administrationHolders.holdsAdministration(SUBJECT)).thenReturn(false);

        AdminContentSyncSnapshot snapshot = service.snapshotFor(SUBJECT);

        assertThat(snapshot.administrator()).isFalse();
        assertThat(snapshot.content()).isEmpty();
        verifyNoInteractions(news, projects, projectOrder, about, donateBand, people, foundersNote, peopleFootnote);
    }

    @Test
    @DisplayName("Given an administrator, when the content snapshot is taken, then it holds what each administration page reads")
    void should_hold_what_each_page_reads_when_snapshot_taken_given_administrator() {
        Versioned<Optional<String>> note = new Versioned<>(Optional.of("Pomáháme dětem."), "0123456789abcdef");
        Versioned<Optional<String>> footnote = new Versioned<>(Optional.empty(), "fedcba9876543210");
        when(administrationHolders.holdsAdministration(SUBJECT)).thenReturn(true);
        when(news.list()).thenReturn(List.of());
        when(projects.list()).thenReturn(List.of());
        when(projectOrder.current()).thenReturn(ProjectOrder.YEAR);
        when(about.read()).thenReturn(new AboutView(Optional.empty()));
        when(donateBand.read()).thenReturn(new DonateBandView(Optional.empty()));
        when(people.list()).thenReturn(List.of());
        when(foundersNote.current()).thenReturn(note);
        when(peopleFootnote.current()).thenReturn(footnote);

        AdminContentSyncSnapshot snapshot = service.snapshotFor(SUBJECT);

        assertThat(snapshot.subject()).isEqualTo(SUBJECT);
        assertThat(snapshot.content()).contains(new AdminContent(List.of(), List.of(), ProjectOrder.YEAR, new AboutView(Optional.empty()),
                new DonateBandView(Optional.empty()), List.of(), note, footnote));
    }
}
