package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.clienterrors.ClientAppVersion;
import cz.novanadeje.app.operations.domain.clienterrors.ClientBrowser;
import cz.novanadeje.app.operations.domain.clienterrors.ClientDisplayMode;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorName;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorPlace;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorReport;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorTerm;
import cz.novanadeje.app.operations.domain.clienterrors.ClientOperatingSystem;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Optional;

record ClientErrorReportRequest(
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientErrorKind.class) String kind,
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientErrorPlace.class) String place,
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientErrorName.class) String name,
        @NotNull @Size(max = ClientAppVersion.MAX_LENGTH) @Pattern(regexp = "[0-9a-f]{7,40}|dev") String appVersion,
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientBrowser.class) String browser,
        @Min(1) @Max(ClientErrorReport.MAX_BROWSER_MAJOR) Integer browserMajor,
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientOperatingSystem.class) String os,
        @NotNull @Size(max = TERM_LENGTH) @ClientErrorTermOf(ClientDisplayMode.class) String display,
        @NotNull @Min(1) @Max(ClientErrorReport.MAX_COUNT) Integer count) {

    static final int TERM_LENGTH = 40;

    ClientErrorReport toReport() {
        return new ClientErrorReport(term(ClientErrorKind.values(), kind), term(ClientErrorPlace.values(), place), term(ClientErrorName.values(), name),
                new ClientAppVersion(appVersion), term(ClientBrowser.values(), browser), Optional.ofNullable(browserMajor),
                term(ClientOperatingSystem.values(), os), term(ClientDisplayMode.values(), display), count);
    }

    private static <T extends ClientErrorTerm> T term(T[] terms, String value) {
        return ClientErrorTerm.parse(List.of(terms), value).orElseThrow(() -> new IllegalArgumentException("Unknown browser error term"));
    }
}
