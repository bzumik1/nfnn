package cz.novanadeje.app.shared.interfaces.rest;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

import java.net.URI;

public class RateLimitExceededException extends ErrorResponseException {

    public RateLimitExceededException(URI problemType) {
        super(HttpStatus.TOO_MANY_REQUESTS);
        setType(problemType);
    }
}
