package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class RestoreFileStateTest {

    @ParameterizedTest
    @CsvSource({
            "zaloha.dump.age, PENDING",
            "zaloha.force.dump.age, PENDING",
            "zaloha.dump, PENDING",
            "zaloha.dump.age.done, DONE",
            "zaloha.dump.done, DONE",
            "zaloha.dump.age.failed, FAILED",
            "zaloha.dump.age.skipped, SKIPPED"
    })
    @DisplayName("Given a file in the restore folder, encrypted or not, when its state is read, then the backup script's suffix decides it")
    void should_tell_state_when_read_given_a_restore_folder_file(String name, RestoreFileState state) {
        assertThat(RestoreFileState.ofFileName(name)).contains(state);
    }

    @ParameterizedTest
    @ValueSource(strings = {"019a.upload", "019a.key", "backup-key.adopt", "notes.txt", "zaloha.age"})
    @DisplayName("Given a file the restore folder holds for other reasons, when its state is read, then it is no restore file")
    void should_tell_no_state_when_read_given_another_file(String name) {
        assertThat(RestoreFileState.ofFileName(name)).isEmpty();
    }
}
