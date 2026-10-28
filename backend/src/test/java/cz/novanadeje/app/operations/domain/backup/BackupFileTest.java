package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupFileTest {

    private static final Instant CREATED = Instant.parse("2026-10-23T01:00:00Z");

    @ParameterizedTest
    @CsvSource({
            "nfnn-2026-10-23_0300.dump.age, DAILY",
            "nfnn-2026-10-23_0633-rucni.dump.age, REQUESTED",
            "nfnn-2026-10-23_0634-pred-obnovou.dump.age, BEFORE_RESTORE",
            "nfnn-2026-10-23_0634-test.dump.age, OTHER"
    })
    @DisplayName("Given a dump name written by the backup script, when the kind is asked for, then the suffix decides it")
    void should_tell_kind_when_asked_given_a_script_name(String name, BackupKind kind) {
        assertThat(new BackupFile(name, 1024, CREATED).kind()).isEqualTo(kind);
    }

    @ParameterizedTest
    @ValueSource(strings = {"../../etc/passwd", "nfnn.dump.age.part", "nfnn-2026-10-23_0300.dump.age/../x", "backup", "nfnn-2026-10-23_0300.DUMP.AGE",
            "nfnn-2026-10-23_0300-Příliš.dump.age", "nfnn-2026-10-23_0300.dump", ""})
    @DisplayName("Given a name the script never writes, when it is checked, then it is not a backup name")
    void should_refuse_name_when_checked_given_not_a_script_name(String name) {
        assertThat(BackupFile.isValidName(name)).isFalse();
        assertThatThrownBy(() -> new BackupFile(name, 1, CREATED)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a null name, when it is checked, then it is not a backup name")
    void should_refuse_null_when_checked() {
        assertThat(BackupFile.isValidName(null)).isFalse();
    }
}
