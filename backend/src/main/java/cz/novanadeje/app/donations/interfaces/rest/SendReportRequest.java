package cz.novanadeje.app.donations.interfaces.rest;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SendReportRequest(@NotNull @Size(max = 7) @Pattern(regexp = "\\d{4}-(0[1-9]|1[0-2])", message = "{donations.report.month.invalid}") String month) {
}
