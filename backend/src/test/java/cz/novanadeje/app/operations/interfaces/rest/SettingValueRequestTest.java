package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SettingValueRequestTest {

    @Test
    @DisplayName("Given a name the site has no setting for, when the change is read, then it is refused as an unknown setting without repeating the name")
    void should_refuse_as_unknown_setting_when_read_given_unknown_name() {
        assertThatThrownBy(() -> SettingValueRequest.toChanges(List.of(new SettingValueRequest("NFNN_NO_SUCH_SETTING", "x"))))
                .isInstanceOfSatisfying(SettingsRejected.class, rejected -> assertThat(rejected.errors())
                        .containsExactly(SettingError.ofWhole(SettingProblem.UNKNOWN_SETTING)))
                .message().doesNotContain("NFNN_NO_SUCH_SETTING");
    }

    @Test
    @DisplayName("Given a known name, when the change is read, then it names that setting")
    void should_name_setting_when_read_given_known_name() {
        assertThat(SettingValueRequest.toChanges(List.of(new SettingValueRequest("PUBLIC_URL", "https://nfnn.cz"))))
                .containsExactly(new SettingChange(Setting.PUBLIC_URL, "https://nfnn.cz"));
    }
}
