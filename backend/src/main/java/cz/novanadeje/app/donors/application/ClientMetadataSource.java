package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;

public interface ClientMetadataSource {

    ClientMetadata fetch(ClientId clientId);
}
