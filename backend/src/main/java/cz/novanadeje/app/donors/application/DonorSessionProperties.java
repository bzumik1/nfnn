package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SessionLengths;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.session")
public record DonorSessionProperties(Duration refreshTokenTtl, Integer rememberDays) {

    public static final int DEFAULT_REMEMBER_DAYS = 14;

    public DonorSessionProperties {
        if (refreshTokenTtl == null || refreshTokenTtl.isNegative() || refreshTokenTtl.isZero()) {
            throw new IllegalArgumentException("app.donors.session.refresh-token-ttl must be a positive duration");
        }
        rememberDays = rememberDays == null ? DEFAULT_REMEMBER_DAYS : rememberDays;
        if (rememberDays < SessionLengths.MIN_REMEMBERED_DAYS || rememberDays > SessionLengths.MAX_REMEMBERED_DAYS) {
            throw new IllegalArgumentException("SESSION_REMEMBER_DAYS (app.donors.session.remember-days) must be a whole number of days from "
                    + SessionLengths.MIN_REMEMBERED_DAYS + " to " + SessionLengths.MAX_REMEMBERED_DAYS + ", but is " + rememberDays);
        }
    }

    public SessionLengths lengths() {
        return new SessionLengths(rememberDays);
    }
}
