package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

public record SettingView(Setting setting, Optional<String> value, boolean configured, boolean stored, boolean unreadable) {
}
