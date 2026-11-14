package cz.novanadeje.app.shared.infrastructure.busy;

public class CpuSlotsFull extends RuntimeException {

    private final CpuWork work;

    public CpuSlotsFull(CpuWork work) {
        super("CPU slots of " + work.label() + " full");
        this.work = work;
    }

    public CpuWork work() {
        return work;
    }
}
