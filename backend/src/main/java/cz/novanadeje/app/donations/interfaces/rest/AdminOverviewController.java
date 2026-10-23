package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.AdminOverviewService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Year;
import java.util.Optional;

@RestController
@RequestMapping("/api/admin/donations")
class AdminOverviewController {

    private static final int FIRST_FOUR_DIGIT_YEAR = 1000;
    private static final int LAST_FOUR_DIGIT_YEAR = 9999;

    private final AdminOverviewService overview;

    AdminOverviewController(AdminOverviewService overview) {
        this.overview = overview;
    }

    @GetMapping("/overview")
    AdminOverviewResponse overview(@RequestParam(required = false) @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year) {
        return AdminOverviewResponse.from(overview.overview(Optional.ofNullable(year).map(Year::of)));
    }
}
