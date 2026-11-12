package cz.novanadeje.app;

import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.content.application.media.UploadImageService;
import cz.novanadeje.app.content.application.media.UploadedImage;
import cz.novanadeje.app.content.application.news.NewsAdminService;
import cz.novanadeje.app.content.application.news.NewsArticleCommand;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.project.ProjectAdminService;
import cz.novanadeje.app.content.application.project.ProjectCommand;
import cz.novanadeje.app.content.application.project.ProjectView;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.donors.application.AccessTokenGrant;
import cz.novanadeje.app.donors.application.AccessTokenIssuer;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
class ServiceWorkerCachedAnswersTest {

    private static final Path NGSW_CONFIG = Path.of("..", "frontend", "ngsw-config.json");

    private static final Set<String> PUBLIC_HANDLERS = Set.of(
            "/api/content/home",
            "/api/content/news",
            "/api/content/news/x",
            "/api/content/projects",
            "/api/content/projects/x",
            "/api/content/media/x",
            "/api/donations/payment-details",
            "/api/donations/bank-logos",
            "/api/donations/bank-logos/images/x");

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlers;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private AccessTokenIssuer accessTokens;

    @Autowired
    private JwtProperties jwt;

    @Autowired
    private NewsAdminService news;

    @Autowired
    private ProjectAdminService projects;

    @Autowired
    private UploadImageService uploads;

    @Autowired
    private Clock clock;

    @BeforeEach
    void emptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void leaveTablesEmpty() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given published content and the service worker's data groups, when each cached path is asked anonymously, as a donor and as an administrator, then every answer is the same and sets no cookie")
    void should_answer_every_cached_path_alike_when_asked_with_or_without_a_token_given_published_content() throws Exception {
        List<String> paths = cachedPaths();
        List<Pattern> patterns = dataGroupPatterns();
        assertThat(patterns)
                .as("every data group URL of ngsw-config.json is probed here")
                .allSatisfy(pattern -> assertThat(paths).anyMatch(path -> pattern.matcher(path).find()));
        assertThat(paths)
                .as("every probed path is one the service worker caches")
                .allSatisfy(path -> assertThat(patterns).anyMatch(pattern -> pattern.matcher(path).find()));

        String donor = bearer(Set.of(Role.DONOR));
        String administrator = bearer(Set.of(Role.DONOR, Role.ADMIN));
        for (String path : paths) {
            Answer anonymous = answer(get(path));
            Answer asDonor = answer(get(path).header("Authorization", donor));
            Answer asAdministrator = answer(get(path).header("Authorization", administrator));

            assertThat(anonymous.status()).as(path).isIn(200, 404);
            assertThat(asDonor).as("%s for a donor", path).isEqualTo(anonymous);
            assertThat(asAdministrator).as("%s for an administrator", path).isEqualTo(anonymous);
            assertThat(anonymous.headers()).as(path).doesNotContainKey("Set-Cookie");
        }
    }

    @Test
    @DisplayName("Given every GET handler of the backend, when the service worker's data group URLs are matched against its path as Angular matches them, anywhere in the address, then they find only the public handlers this test probes")
    void should_find_only_the_probed_public_handlers_when_data_group_urls_are_matched_anywhere_given_every_get_handler() throws IOException {
        List<Pattern> patterns = dataGroupPatterns();
        Set<String> found = new TreeSet<>();
        for (RequestMappingInfo mapping : handlers.getHandlerMethods().keySet()) {
            Set<RequestMethod> methods = mapping.getMethodsCondition().getMethods();
            if (!methods.isEmpty() && !methods.contains(RequestMethod.GET)) {
                continue;
            }
            for (String template : mapping.getPathPatternsCondition().getPatternValues()) {
                String path = template.replaceAll("\\{[^}]*}", "x").replace("/**", "/x");
                if (patterns.stream().anyMatch(pattern -> pattern.matcher(path).find())) {
                    found.add(path);
                }
            }
        }

        assertThat(found).as("GET handlers a data group of ngsw-config.json would cache").isEqualTo(new TreeSet<>(PUBLIC_HANDLERS));
    }

    private List<String> cachedPaths() throws IOException {
        UploadedImage photo = uploads.upload(png());
        LocalDate today = LocalDate.now(clock);
        UUID admin = UuidV7.generate(clock.instant());
        NewsArticleView article = news.create(admin, new NewsArticleCommand("Den otevřených dveří", Optional.empty(), Optional.of("Akce"),
                "Krátký úvod", "Text článku", Optional.of(photo.id()), Optional.of("Popis fotky"), Optional.empty())).view();
        news.publish(admin, article.id(), today.minusDays(1), ExpectedVersion.none());
        ProjectView project = projects.create(admin, new ProjectCommand("Rehabilitační pomůcky", today.getYear(), ProjectCategory.CHILDREN,
                Optional.empty(), Optional.empty(), "Krátký úvod", "Text projektu", Optional.of(photo.id()), Optional.of("Popis fotky"))).view();
        projects.publish(admin, project.id(), today.minusDays(1), ExpectedVersion.none());
        NewsArticleView draftArticle = news.create(admin, new NewsArticleCommand("Připravovaný článek", Optional.empty(), Optional.of("Akce"),
                "Krátký úvod", "Text článku", Optional.empty(), Optional.empty(), Optional.empty())).view();
        ProjectView draftProject = projects.create(admin, new ProjectCommand("Připravovaný projekt", today.getYear(), ProjectCategory.ADULTS,
                Optional.empty(), Optional.empty(), "Krátký úvod", "Text projektu", Optional.empty(), Optional.empty())).view();
        String media = "/api/content/media/" + photo.id().value();
        UUID logoImage = UuidV7.generate(clock.instant());
        jdbc.sql("insert into bank_logo_image (id, sha256, webp) values (?, ?, ?)").params(logoImage, "a".repeat(64), png()).update();
        jdbc.sql("insert into bank_logo (code, source_url, image_id, fetched_at, checked_at) values ('0800', 'https://is1-ssl.mzstatic.com/a.jpg', ?, now(), now())")
                .param(logoImage).update();
        return List.of(
                "/api/content/home",
                "/api/content/news",
                "/api/content/news?page=0&size=6",
                "/api/content/news/" + article.slug(),
                "/api/content/news/zadny-takovy-clanek",
                "/api/content/news/" + draftArticle.slug(),
                "/api/content/projects",
                "/api/content/projects?page=0&size=6",
                "/api/content/projects/" + project.slug(),
                "/api/content/projects/zadny-takovy-projekt",
                "/api/content/projects/" + draftProject.slug(),
                "/api/donations/payment-details",
                "/api/donations/bank-logos",
                "/api/donations/bank-logos/images/" + logoImage,
                "/api/donations/bank-logos/images/" + UUID.randomUUID(),
                media,
                media + "?w=480",
                "/api/content/media/" + UUID.randomUUID());
    }

    private static List<Pattern> dataGroupPatterns() throws IOException {
        JsonNode config = JsonMapper.builder().build().readTree(Files.readString(NGSW_CONFIG));
        List<Pattern> patterns = new ArrayList<>();
        for (JsonNode group : config.path("dataGroups")) {
            for (JsonNode url : group.path("urls")) {
                patterns.add(globToRegex(url.asString()));
            }
        }
        assertThat(patterns).as("ngsw-config.json names data groups").isNotEmpty();
        return patterns;
    }

    private static Pattern globToRegex(String glob) {
        StringBuilder regex = new StringBuilder();
        for (int i = 0; i < glob.length(); i++) {
            char c = glob.charAt(i);
            if (c == '*' && i + 1 < glob.length() && glob.charAt(i + 1) == '*') {
                regex.append(".*");
                i++;
            } else if (c == '*') {
                regex.append("[^/]*");
            } else {
                regex.append(Pattern.quote(String.valueOf(c)));
            }
        }
        return Pattern.compile(regex.toString());
    }

    private String bearer(Set<Role> roles) {
        return "Bearer " + accessTokens.issue(new AccessTokenGrant(new DonorId(UuidV7.generate(clock.instant())), roles, jwt.audience(), Set.of(), clock.instant(), null, null)).token();
    }

    private Answer answer(MockHttpServletRequestBuilder request) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(request).andReturn().getResponse();
        Map<String, List<String>> headers = new LinkedHashMap<>();
        for (String name : response.getHeaderNames()) {
            headers.put(name, response.getHeaders(name));
        }
        return new Answer(response.getStatus(), headers, Base64.getEncoder().encodeToString(response.getContentAsByteArray()));
    }

    private static byte[] png() throws IOException {
        BufferedImage image = new BufferedImage(640, 480, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        graphics.setColor(new Color(37, 99, 235));
        graphics.fillRect(0, 0, 640, 480);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private record Answer(int status, Map<String, List<String>> headers, String body) {
    }
}
