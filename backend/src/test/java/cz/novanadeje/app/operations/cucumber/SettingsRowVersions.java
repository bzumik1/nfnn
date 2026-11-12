package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.operations.application.settings.SettingsVersions;
import cz.novanadeje.app.operations.application.settings.SettingsVersions.StoredSettings;
import cz.novanadeje.app.operations.application.settings.SettingsWriter;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SettingsRowVersions {

    private final SettingsWriter writer;
    private final SettingsVersions versions;

    public SettingsRowVersions(SettingsWriter writer, SettingsVersions versions) {
        this.writer = writer;
        this.versions = versions;
    }

    public String ofStored() {
        return versions.of(StoredSettings.of(writer.stored()));
    }

    public Map<String, String> ifMatchOfStored() {
        return ApiClient.ifMatch(ofStored());
    }
}
