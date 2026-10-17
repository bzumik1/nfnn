package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.Role;

import java.time.Instant;
import java.util.Set;

public interface AccessTokenIssuer {

    IssuedAccessToken issue(DonorId donorId, Set<Role> roles, Instant issuedAt);
}
