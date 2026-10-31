package cz.novanadeje.app.content.domain.project;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectCategoryTest {

    @Test
    @DisplayName("Given the categories of a project, when they are listed, then children come first, then adults, animals and the others")
    void should_list_children_first_when_listed() {
        assertThat(ProjectCategory.values()).containsExactly(ProjectCategory.CHILDREN, ProjectCategory.ADULTS, ProjectCategory.ANIMALS, ProjectCategory.OTHER);
    }

    @Test
    @DisplayName("Given the pattern of category names, when it is compared with the categories, then it names every one and nothing else")
    void should_name_every_category_when_the_pattern_is_read() {
        assertThat(ProjectCategory.NAMES_PATTERN).isEqualTo(Arrays.stream(ProjectCategory.values()).map(Enum::name).collect(Collectors.joining("|")));
    }
}
