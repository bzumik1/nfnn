package cz.novanadeje.app.donors.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.session")
public record DonorSessionProperties(Duration refreshTokenTtl) {
}
