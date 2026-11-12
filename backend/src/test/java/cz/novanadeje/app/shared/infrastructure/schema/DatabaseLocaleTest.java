package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.shared.infrastructure.search.CzechCollation;
import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class DatabaseLocaleTest {

    private static final List<String> BUILT_IN_LOCALE = List.of("--locale-provider=builtin", "--builtin-locale=C.UTF-8");
    private static final Path DATABASE_IMAGE = Path.of("deploy", "postgres", "Dockerfile");
    private static final Path BACKUP_SCRIPT = Path.of("deploy", "backup", "backup.sh");
    private static final Pattern INITDB_ARGS = Pattern.compile("ENV POSTGRES_INITDB_ARGS=\"(?<args>[^\"]*)\"");
    private static final Pattern CREATE_APP_DATABASE = Pattern.compile("create_app_database\\(\\) \\{\\s*createdb (?<args>[^\\n]*)");

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given the database image, the backup script and the test database, when their locale is read, then a new cluster, a restored database and the test database all take the built-in C.UTF-8 provider")
    void should_use_the_built_in_locale_everywhere_when_read_given_image_backup_script_and_test_database() throws IOException {
        assertThat(argumentsOf(DATABASE_IMAGE, INITDB_ARGS)).as("POSTGRES_INITDB_ARGS of %s", DATABASE_IMAGE).containsAll(BUILT_IN_LOCALE);
        assertThat(argumentsOf(BACKUP_SCRIPT, CREATE_APP_DATABASE)).as("createdb of create_app_database in %s", BACKUP_SCRIPT).containsAll(BUILT_IN_LOCALE);
        assertThat(List.of(TestcontainersConfiguration.INITDB_ARGS.split(" "))).containsAll(BUILT_IN_LOCALE);
        assertThat(jdbc.sql("select datlocprovider::text || ' ' || datlocale from pg_database where datname = current_database()").query(String.class).single())
                .isEqualTo("b C.UTF-8");
    }

    @Test
    @DisplayName("Given the built-in C.UTF-8 database, when Czech text is folded to lower case and names are sorted, then every Czech letter is lowered and the Czech collation is there")
    void should_lower_czech_letters_and_offer_the_czech_collation_when_asked_given_built_in_database() {
        assertThat(jdbc.sql("select lower('ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ŠTĚPÁN ŘÍHA')").query(String.class).single()).isEqualTo("áčďéěíňóřšťúůýž štěpán říha");
        assertThat(jdbc.sql("select count(*) from pg_collation where collname = ?").param(CzechCollation.NAME).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select string_agg(name, ',' order by name collate \"" + CzechCollation.NAME + "\")"
                        + " from (values ('Žák'), ('Chalupa'), ('Hrubý'), ('ambrož'), ('Čermák'), ('Cibulka')) as names (name)")
                .query(String.class).single()).isEqualTo("ambrož,Cibulka,Čermák,Hrubý,Chalupa,Žák");
    }

    private static List<String> argumentsOf(Path file, Pattern pattern) throws IOException {
        Matcher matcher = pattern.matcher(Files.readString(SharedCases.repositoryRoot().resolve(file), StandardCharsets.UTF_8));
        assertThat(matcher.find()).as("%s in %s", pattern.pattern(), file).isTrue();
        return List.of(matcher.group("args").trim().split("\\s+"));
    }
}
