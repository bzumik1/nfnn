package cz.novanadeje.app.content.application.sync;

import cz.novanadeje.app.content.application.about.AboutService;
import cz.novanadeje.app.content.application.donateband.DonateBandService;
import cz.novanadeje.app.content.application.news.NewsAdminService;
import cz.novanadeje.app.content.application.people.FoundersNoteService;
import cz.novanadeje.app.content.application.people.PeopleAdminService;
import cz.novanadeje.app.content.application.people.PeopleFootnoteService;
import cz.novanadeje.app.content.application.project.ProjectAdminService;
import cz.novanadeje.app.content.application.project.ProjectOrderService;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class AdminContentSyncService {

    private final AdministrationHolders administrationHolders;
    private final NewsAdminService news;
    private final ProjectAdminService projects;
    private final ProjectOrderService projectOrder;
    private final AboutService about;
    private final DonateBandService donateBand;
    private final PeopleAdminService people;
    private final FoundersNoteService foundersNote;
    private final PeopleFootnoteService peopleFootnote;

    public AdminContentSyncService(AdministrationHolders administrationHolders, NewsAdminService news, ProjectAdminService projects,
                                   ProjectOrderService projectOrder, AboutService about, DonateBandService donateBand, PeopleAdminService people,
                                   FoundersNoteService foundersNote, PeopleFootnoteService peopleFootnote) {
        this.administrationHolders = administrationHolders;
        this.news = news;
        this.projects = projects;
        this.projectOrder = projectOrder;
        this.about = about;
        this.donateBand = donateBand;
        this.people = people;
        this.foundersNote = foundersNote;
        this.peopleFootnote = peopleFootnote;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminContentSyncSnapshot snapshotFor(UUID subject) {
        if (!administrationHolders.holdsAdministration(subject)) {
            return new AdminContentSyncSnapshot(subject, Optional.empty());
        }
        return new AdminContentSyncSnapshot(subject, Optional.of(new AdminContent(news.list(), projects.list(), projectOrder.current(), about.read(),
                donateBand.read(), people.list(), foundersNote.current(), peopleFootnote.current())));
    }
}
