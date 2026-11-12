package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.donors.application.ProfileVersions;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class ProfileRowVersions {

    private static final String MATCHING_NOTHING = "0000000000000000";

    private final DonorRepository donors;
    private final ProfileVersions versions;

    public ProfileRowVersions(DonorRepository donors, ProfileVersions versions) {
        this.donors = donors;
        this.versions = versions;
    }

    public String of(UUID donor) {
        return donors.findById(new DonorId(donor)).map(versions::of).orElse(MATCHING_NOTHING);
    }

    public Map<String, String> ifMatchOfSignedIn(ApiClient api) {
        String version = api.authorizedSubject()
                .flatMap(subject -> donors.findById(DonorId.of(subject)))
                .map(versions::of)
                .orElse(MATCHING_NOTHING);
        return ApiClient.ifMatch(version);
    }
}
