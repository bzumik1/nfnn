package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.List;

record SetupCompletedResponse(List<String> changed, boolean restarting) {

    static SetupCompletedResponse of(List<Setting> changed) {
        return new SetupCompletedResponse(changed.stream().map(Enum::name).toList(), !changed.isEmpty());
    }
}
