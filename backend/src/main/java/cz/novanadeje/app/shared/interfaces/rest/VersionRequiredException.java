package cz.novanadeje.app.shared.interfaces.rest;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

import java.net.URI;

public class VersionRequiredException extends ErrorResponseException {

    static final URI TYPE = ProblemTypes.of("shared", "version-required");

    public VersionRequiredException() {
        super(HttpStatus.PRECONDITION_REQUIRED);
        setType(TYPE);
    }
}
