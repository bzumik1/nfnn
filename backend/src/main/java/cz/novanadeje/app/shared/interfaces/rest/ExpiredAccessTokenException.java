package cz.novanadeje.app.shared.interfaces.rest;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

public class ExpiredAccessTokenException extends ErrorResponseException {

    public ExpiredAccessTokenException() {
        super(HttpStatus.UNAUTHORIZED);
        setType(ProblemTypes.EXPIRED_TOKEN);
    }
}
