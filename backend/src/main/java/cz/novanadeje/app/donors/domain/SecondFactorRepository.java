package cz.novanadeje.app.donors.domain;

import java.util.Optional;

public interface SecondFactorRepository {

    void save(SecondFactor factor);

    Optional<SecondFactor> findByDonor(DonorId donorId);

    void delete(DonorId donorId);
}
