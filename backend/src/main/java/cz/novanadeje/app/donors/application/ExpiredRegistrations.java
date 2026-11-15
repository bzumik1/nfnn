package cz.novanadeje.app.donors.application;

import java.time.Duration;

public record ExpiredRegistrations(int deleted, Duration lifetime) {
}
