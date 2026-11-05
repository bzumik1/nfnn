package cz.novanadeje.app.donors.domain;

import java.util.Optional;
import java.util.Set;

public interface SecondFactorRepository {

    void save(SecondFactor factor);

    boolean recordUse(SecondFactor factor);

    Optional<SecondFactor> findByDonor(DonorId donorId);

    Set<DonorId> findDonorsWithEnabledFactor();

    void delete(DonorId donorId);
}
