package cz.novanadeje.app.donations.interfaces.rest;

import java.time.Instant;
import java.util.List;

public record SendReportResponse(String month, List<String> recipients, Instant sentAt) {
}
