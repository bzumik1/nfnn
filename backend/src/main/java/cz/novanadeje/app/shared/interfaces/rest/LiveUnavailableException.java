package cz.novanadeje.app.shared.interfaces.rest;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

public class LiveUnavailableException extends ErrorResponseException {

    public LiveUnavailableException() {
        super(HttpStatus.SERVICE_UNAVAILABLE);
        setType(ProblemTypes.of("live-unavailable"));
    }
}
