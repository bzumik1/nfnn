package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.domain.PostalAddress;

public record DonorProfileChanged(DonorId donorId, String name, PostalAddress address) {
}
