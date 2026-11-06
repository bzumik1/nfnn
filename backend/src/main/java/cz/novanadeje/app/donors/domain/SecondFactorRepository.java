package cz.novanadeje.app.donors.domain;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;

public interface SecondFactorRepository {

    void save(SecondFactor factor);

    boolean recordUse(SecondFactor factor);

    Optional<SecondFactor> findByDonor(DonorId donorId);

    Set<DonorId> findDonorsWithEnabledFactor();

    Set<DonorId> findDonorsWithEnabledFactorAmong(Collection<DonorId> donorIds);

    void delete(DonorId donorId);
}
