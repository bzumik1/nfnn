package cz.novanadeje.app.donations.interfaces.rest;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record SendReportRequest(@NotNull @Pattern(regexp = "\\d{4}-\\d{2}") String month) {
}
