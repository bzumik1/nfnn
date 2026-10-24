package cz.novanadeje.app.donors.domain;

import java.util.List;
import java.util.Optional;

public interface PasskeyRepository {

    void save(Passkey passkey);

    Optional<Passkey> findById(PasskeyId id);

    Optional<Passkey> findByCredentialId(String credentialId);

    List<Passkey> findByDonor(DonorId donorId);

    int countByDonor(DonorId donorId);

    void delete(PasskeyId id);

    int deleteAllOf(DonorId donorId);

    int adoptUnmarked(String relyingPartyId);

    List<DonorId> deleteOfOtherSites(String relyingPartyId);
}
