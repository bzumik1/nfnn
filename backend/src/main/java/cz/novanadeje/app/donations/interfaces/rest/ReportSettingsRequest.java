package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ReportSettingsRequest(
        @NotNull @Size(min = 1, max = ReportRecipients.MAX_RECIPIENTS) List<@NotBlank @Size(max = MAX_ADDRESS_LENGTH) String> recipients,
        @Min(ReportSettings.FIRST_SEND_DAY) @Max(ReportSettings.LAST_SEND_DAY) int sendDay,
        @NotNull @Min(ReportSettings.FIRST_SEND_HOUR) @Max(ReportSettings.LAST_SEND_HOUR) Integer sendHour,
        @NotNull @Valid Sections sections) {

    static final int MAX_ADDRESS_LENGTH = 254;

    public record Sections(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {
    }
}
