package cz.novanadeje.app.donations.domain.importing;

public sealed interface ImportAlert permits ImportOutage, ImportRecovery {
}
