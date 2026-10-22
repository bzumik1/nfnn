package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DonorRepository {

    void save(Donor donor);

    void delete(DonorId id);

    Optional<Donor> findById(DonorId id);

    Optional<Donor> findByEmail(EmailAddress email);

    boolean existsByEmail(EmailAddress email);

    boolean existsByVariableSymbol(VariableSymbol variableSymbol);

    List<Donor> findAdministrators();

    List<Donor> findByIds(Collection<DonorId> ids);
}
