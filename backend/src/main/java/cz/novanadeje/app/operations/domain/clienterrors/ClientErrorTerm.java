package cz.novanadeje.app.operations.domain.clienterrors;

import java.util.List;
import java.util.Optional;

public interface ClientErrorTerm {

    String wire();

    static <T extends ClientErrorTerm> Optional<T> parse(List<T> terms, String value) {
        return terms.stream().filter(term -> term.wire().equals(value)).findFirst();
    }
}
