package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class BankLogoVersions {

    private final RowVersions versions;

    public BankLogoVersions(RowVersions versions) {
        this.versions = versions;
    }

    public String of(BankLogo logo) {
        return versions.versionOf(List.of(new VersionedFields(logo.code().value(), logo.source().url())));
    }

    private record VersionedFields(String code, String sourceUrl) {
    }
}
