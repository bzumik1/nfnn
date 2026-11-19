package cz.novanadeje.app.support;

import cz.novanadeje.app.shared.application.transaction.AfterCommitWork;

import java.util.ArrayList;
import java.util.List;

public final class HeldAfterCommitWork implements AfterCommitWork {

    private final List<Runnable> held = new ArrayList<>();

    @Override
    public synchronized void run(Runnable work) {
        held.add(work);
    }

    public synchronized void commit() {
        List<Runnable> due = List.copyOf(held);
        held.clear();
        due.forEach(Runnable::run);
    }

    public synchronized void rollBack() {
        held.clear();
    }
}
