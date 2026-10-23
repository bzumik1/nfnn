package cz.novanadeje.app.shared.infrastructure.mail;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class EmailTemplateColoursTest {

    private static final Path TEMPLATES = Path.of("src", "main", "resources", "templates", "email");
    private static final Path THEME = Path.of("..", "frontend", "src", "themes", "nova-nadeje", "_theme.scss");
    private static final Pattern HEX_COLOUR = Pattern.compile("#[0-9a-fA-F]{6}\\b");
    private static final Pattern THEME_TOKEN = Pattern.compile("--color-[a-z0-9-]+:\\s*(#[0-9a-fA-F]{6})\\s*;");

    @Test
    @DisplayName("Given the site theme, when every e-mail template is scanned, then each colour it uses is the value of a theme colour token")
    void should_use_theme_colours_only_when_scanned_given_email_templates() throws IOException {
        Set<String> theme = new TreeSet<>();
        Matcher tokens = THEME_TOKEN.matcher(Files.readString(THEME, StandardCharsets.UTF_8));
        while (tokens.find()) {
            theme.add(tokens.group(1).toLowerCase(Locale.ROOT));
        }
        assertThat(theme).isNotEmpty();

        Map<String, Set<String>> coloursByTemplate = new TreeMap<>();
        for (Path template : templates()) {
            Set<String> colours = new TreeSet<>();
            Matcher found = HEX_COLOUR.matcher(Files.readString(template, StandardCharsets.UTF_8));
            while (found.find()) {
                colours.add(found.group().toLowerCase(Locale.ROOT));
            }
            coloursByTemplate.put(template.getFileName().toString(), colours);
        }

        assertThat(coloursByTemplate.get("layout.html")).isNotEmpty();
        coloursByTemplate.forEach((template, colours) ->
                assertThat(colours).as("colours of %s", template).isSubsetOf(theme));
    }

    @Test
    @DisplayName("Given the e-mail templates, when they are listed, then every one but the layout is a content fragment of it")
    void should_be_content_fragments_when_listed_given_templates_beside_layout() throws IOException {
        List<Path> fragments = templates().stream().filter(path -> !path.getFileName().toString().equals("layout.html")).toList();

        assertThat(fragments).isNotEmpty();
        for (Path fragment : fragments) {
            assertThat(Files.readString(fragment, StandardCharsets.UTF_8)).as("%s", fragment).contains("th:fragment=\"content\"");
        }
        assertThat(Files.readString(TEMPLATES.resolve("layout.html"), StandardCharsets.UTF_8)).contains("th:insert=\"~{${contentTemplate} :: content}\"");
    }

    private static List<Path> templates() throws IOException {
        try (Stream<Path> files = Files.walk(TEMPLATES)) {
            return files.filter(path -> path.toString().endsWith(".html")).sorted().toList();
        }
    }
}
