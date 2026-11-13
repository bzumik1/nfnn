package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

record SetupRequest(@Size(max = SetupCodeRequest.MAX_CODE_LENGTH) String code,
                    @NotNull @Size(max = SettingValueRequest.MAX_SETTINGS) List<@Valid SettingValueRequest> settings,
                    @Size(max = BackupKeyWordPositions.ASKED) List<@Valid @NotNull BackupKeyWordRequest> backupKeyWords) {

    @Override
    public String toString() {
        return "SetupRequest[code=" + (code == null ? "none" : "***") + ", settings=" + (settings == null ? "none" : settings.size())
                + ", backupKeyWords=" + (backupKeyWords == null ? "none" : backupKeyWords.size()) + "]";
    }
}
