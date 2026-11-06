package cz.novanadeje.app.content.domain.donateband;

import java.util.Optional;

public interface DonateBandRepository {

    Optional<DonateBand> find();

    void save(DonateBand band);
}
