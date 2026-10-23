package cz.novanadeje.app.operations.interfaces.rest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

record SetupRequest(@Size(max = SetupCodeRequest.MAX_CODE_LENGTH) String code,
                    @NotNull @Size(max = SettingValueRequest.MAX_SETTINGS) List<@Valid SettingValueRequest> settings) {
}
