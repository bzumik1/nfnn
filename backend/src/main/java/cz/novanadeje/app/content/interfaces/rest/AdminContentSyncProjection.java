package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.sync.AdminContent;
import cz.novanadeje.app.content.application.sync.AdminContentSyncSnapshot;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
class AdminContentSyncProjection {

    static final String NEWS = "news";
    static final String PROJECTS = "projects";
    static final String PROJECT_ORDER = "project-order";
    static final String ABOUT = "about";
    static final String DONATE_BAND = "donate-band";
    static final String PEOPLE = "people";

    private final JsonMapper json;

    AdminContentSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(AdminContentSyncSnapshot snapshot) {
        SortedMap<String, List<?>> chunks = new TreeMap<>();
        snapshot.content().ifPresent(content -> rowsOf(content, chunks));
        return SyncChunk.allOf(chunks, json);
    }

    private static void rowsOf(AdminContent content, SortedMap<String, List<?>> chunks) {
        List<NewsArticleResponse> news = NewsListResponse.fromVersioned(content.news()).items();
        if (!news.isEmpty()) {
            chunks.put(NEWS, news);
        }
        List<ProjectResponse> projects = ProjectListResponse.fromVersioned(content.projects()).items();
        if (!projects.isEmpty()) {
            chunks.put(PROJECTS, projects);
        }
        chunks.put(PROJECT_ORDER, List.of(ProjectOrderResponse.from(content.projectOrder())));
        chunks.put(ABOUT, List.of(AboutResponse.from(content.about())));
        chunks.put(DONATE_BAND, List.of(DonateBandResponse.from(content.donateBand())));
        chunks.put(PEOPLE, List.of(PeopleResponse.from(content.people(), content.foundersNote(), content.peopleFootnote())));
    }
}
