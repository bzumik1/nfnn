package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ConcurrentWrites;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class StaleContentWritesStepDefinitions {

    private static final Pattern EDIT = Pattern.compile("changes the (news article|project) ([a-z0-9-]+) to the title (.+)");
    private static final Pattern PUBLISH = Pattern.compile("publishes the (news article|project) ([a-z0-9-]+) on (\\d{4}-\\d{2}-\\d{2})");
    private static final Pattern UNPUBLISH = Pattern.compile("withdraws the (news article|project) ([a-z0-9-]+)");
    private static final Pattern DELETE = Pattern.compile("deletes the (news article|project) ([a-z0-9-]+)");
    private static final String NEWS = "news article";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;
    private final ContentRowVersions versions;
    private final ConcurrentWrites concurrentWrites;
    private final Map<String, String> readVersions = new HashMap<>();

    public StaleContentWritesStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc, ContentRowVersions versions,
                                             ConcurrentWrites concurrentWrites) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.versions = versions;
        this.concurrentWrites = concurrentWrites;
    }

    @When("these writes start one after another from the versions read before them, while the row of the news article {word} is held:")
    public void theseWritesStartWhileTheArticleRowIsHeld(String slug, DataTable table) {
        sendWhileRowHeld(NEWS, slug, table);
    }

    @When("these writes start one after another from the versions read before them, while the row of the project {word} is held:")
    public void theseWritesStartWhileTheProjectRowIsHeld(String slug, DataTable table) {
        sendWhileRowHeld("project", slug, table);
    }

    private void sendWhileRowHeld(String noun, String slug, DataTable table) {
        List<ConcurrentWrites.Write> writes = table.asMaps().stream().map(row -> write(row.get("who"), row.get("write"))).toList();
        concurrentWrites.sendWhileHeld("select id from " + table(noun) + " where id = ? for update", idOf(noun, slug), writes);
    }

    @When("{string} reads the news article {string}")
    public void readsTheNewsArticle(String alias, String slug) {
        readVersions.put(alias + "/" + slug, versions.ofArticle(idOf(NEWS, slug).toString()));
    }

    @When("{string} changes the news article {string} to the title {string} from the version read before")
    public void changesTheNewsArticleFromTheVersionReadBefore(String alias, String slug, String title) {
        sessions.actAs(alias);
        api.put("/api/admin/content/news/" + idOf(NEWS, slug), body(NEWS, slug, title), ApiClient.ifMatch(readVersions.get(alias + "/" + slug)));
    }

    @When("{string} changes the news article {string} to the title {string} from the version in the refusal")
    public void changesTheNewsArticleFromTheVersionInTheRefusal(String alias, String slug, String title) {
        String version = api.lastResponseJson().get("version").asString();
        sessions.actAs(alias);
        api.put("/api/admin/content/news/" + idOf(NEWS, slug), body(NEWS, slug, title), ApiClient.ifMatch(version));
    }

    @When("{string} withdraws the news article {string} naming no version")
    public void withdrawsTheNewsArticleNamingNoVersion(String alias, String slug) {
        sessions.actAs(alias);
        api.post("/api/admin/content/news/" + idOf(NEWS, slug) + "/unpublish", Map.of());
    }

    private ConcurrentWrites.Write write(String alias, String phrase) {
        String bearer = sessions.bearerOf(alias);
        Matcher matched;
        if ((matched = EDIT.matcher(phrase)).matches()) {
            return write(bearer, HttpMethod.PUT, matched, "", body(matched.group(1), matched.group(2), matched.group(3)));
        }
        if ((matched = PUBLISH.matcher(phrase)).matches()) {
            return write(bearer, HttpMethod.POST, matched, "/publish", Map.of("publishedOn", matched.group(3)));
        }
        if ((matched = UNPUBLISH.matcher(phrase)).matches()) {
            return write(bearer, HttpMethod.POST, matched, "/unpublish", Map.of());
        }
        if ((matched = DELETE.matcher(phrase)).matches()) {
            return write(bearer, HttpMethod.DELETE, matched, "", null);
        }
        throw new IllegalArgumentException("No such content write: " + phrase);
    }

    private ConcurrentWrites.Write write(String bearer, HttpMethod method, Matcher matched, String action, Map<String, ?> body) {
        String noun = matched.group(1);
        UUID id = idOf(noun, matched.group(2));
        Supplier<String> versionNow = NEWS.equals(noun) ? () -> versions.ofArticle(id.toString()) : () -> versions.ofProject(id.toString());
        String read = versionNow.get();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.AUTHORIZATION, bearer);
        headers.putAll(ApiClient.ifMatch(read));
        String path = (NEWS.equals(noun) ? "/api/admin/content/news/" : "/api/admin/content/projects/") + id + action;
        return new ConcurrentWrites.Write(new ApiClient.PreparedRequest(method, path, body, headers), read, versionNow);
    }

    private static Map<String, Object> body(String noun, String slug, String title) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("slug", slug);
        body.put("perex", "Perex.");
        body.put("body", "Text.");
        if (!NEWS.equals(noun)) {
            body.put("year", 2026);
        }
        return body;
    }

    private UUID idOf(String noun, String slug) {
        return jdbc.sql("select id from " + table(noun) + " where slug = ?").param(slug).query(UUID.class).single();
    }

    private static String table(String noun) {
        return NEWS.equals(noun) ? "content_news" : "content_project";
    }
}
