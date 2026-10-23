package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SettingView;
import cz.novanadeje.app.operations.application.settings.SettingsView;

import java.util.List;

record SettingsResponse(List<Item> settings, boolean secretsCanBeStored) {

    static SettingsResponse from(SettingsView view) {
        return new SettingsResponse(view.settings().stream().map(Item::from).toList(), view.secretsCanBeStored());
    }

    record Item(String name, String group, boolean secret, String value, boolean configured, boolean stored, boolean unreadable) {

        static Item from(SettingView view) {
            return new Item(view.setting().name(), view.setting().group().name(), view.setting().secret(), view.value().orElse(null),
                    view.configured(), view.stored(), view.unreadable());
        }
    }
}
