package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.application.ContentVersions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class StoredContentRowsTest {

    private static final Map<String, String> COMPONENTS_NAMED_AS_THE_API_NAMES_THEM = Map.of(
            "cover_media_id", "coverImage",
            "signer_person_id", "signer");

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given the migrated content_news table, when its columns are compared with the stored row of a news article, then every column is in the row a version is computed from and nothing else is")
    void should_hold_every_column_when_compared_given_the_news_table() {
        assertThat(componentsOf(ContentVersions.StoredNewsArticle.class)).isEqualTo(columnsOf("content_news"));
    }

    @Test
    @DisplayName("Given the migrated content_project table, when its columns are compared with the stored row of a project, then every column is in the row a version is computed from and nothing else is")
    void should_hold_every_column_when_compared_given_the_project_table() {
        assertThat(componentsOf(ContentVersions.StoredProject.class)).isEqualTo(columnsOf("content_project"));
    }

    private Set<String> columnsOf(String table) {
        List<String> columns = jdbc.sql("select column_name from information_schema.columns where table_schema = 'public' and table_name = ?")
                .param(table).query(String.class).list();
        assertThat(columns).isNotEmpty();
        return columns.stream().map(column -> COMPONENTS_NAMED_AS_THE_API_NAMES_THEM.getOrDefault(column, camelCase(column))).collect(Collectors.toSet());
    }

    private static Set<String> componentsOf(Class<? extends Record> row) {
        return Arrays.stream(row.getRecordComponents()).map(RecordComponent::getName).collect(Collectors.toSet());
    }

    private static String camelCase(String column) {
        String[] words = column.split("_");
        StringBuilder name = new StringBuilder(words[0]);
        for (int index = 1; index < words.length; index++) {
            name.append(Character.toUpperCase(words[index].charAt(0))).append(words[index].substring(1));
        }
        return name.toString();
    }
}
