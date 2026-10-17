package cz.novanadeje.fio;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

final class TokenMaskedFailure extends Exception {

    private TokenMaskedFailure(String maskedDescription, StackTraceElement[] stackTrace) {
        super(maskedDescription);
        setStackTrace(stackTrace);
    }

    static Throwable withoutToken(Throwable failure, FioToken token) {
        List<Throwable> chain = chainOf(failure);
        if (chain.stream().noneMatch(current -> token.occursIn(current.toString()))) {
            return failure;
        }
        TokenMaskedFailure first = null;
        TokenMaskedFailure last = null;
        for (Throwable current : chain) {
            TokenMaskedFailure masked = new TokenMaskedFailure(token.mask(current.toString()), current.getStackTrace());
            if (last == null) {
                first = masked;
            } else {
                last.initCause(masked);
            }
            last = masked;
        }
        return first;
    }

    private static List<Throwable> chainOf(Throwable failure) {
        List<Throwable> chain = new ArrayList<>();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable current = failure; current != null && seen.add(current); current = current.getCause()) {
            chain.add(current);
        }
        return chain;
    }
}
