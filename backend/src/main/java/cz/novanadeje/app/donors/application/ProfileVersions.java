package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ProfileVersions {

    private final RowVersions versions;

    public ProfileVersions(RowVersions versions) {
        this.versions = versions;
    }

    public String of(Donor donor) {
        return versions.versionOf(List.of(StoredProfile.of(donor)));
    }

    public record StoredProfile(String name, String street, String city, String postalCode, String preferredLocale) {

        public static StoredProfile of(Donor donor) {
            return new StoredProfile(donor.name(), donor.address().street(), donor.address().city(), donor.address().postalCode(),
                    donor.preferredLocale().tag());
        }
    }
}
