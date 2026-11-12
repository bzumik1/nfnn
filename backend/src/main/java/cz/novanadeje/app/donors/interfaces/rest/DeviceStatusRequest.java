package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record DeviceStatusRequest(
        @NotNull(message = "{problem.validation.missing-value}")
        @Size(max = DeviceStatusSecret.LENGTH, message = "{problem.validation.invalid-value}")
        @Pattern(regexp = DeviceStatusSecret.SHAPE_REGEX, message = "{problem.validation.invalid-value}")
        String deviceSecret
) {

    DeviceStatusSecret secret() {
        return new DeviceStatusSecret(deviceSecret);
    }

    @Override
    public String toString() {
        return "DeviceStatusRequest[deviceSecret=***]";
    }
}
