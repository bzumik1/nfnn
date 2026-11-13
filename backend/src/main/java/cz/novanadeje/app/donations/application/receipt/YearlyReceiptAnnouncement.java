package cz.novanadeje.app.donations.application.receipt;

import java.time.Year;

public record YearlyReceiptAnnouncement(Year year, int donors) {
}
