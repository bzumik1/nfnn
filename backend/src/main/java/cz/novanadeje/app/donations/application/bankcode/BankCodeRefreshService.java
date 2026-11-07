package cz.novanadeje.app.donations.application.bankcode;

import org.springframework.stereotype.Service;

import java.time.Clock;

@Service
public class BankCodeRefreshService {

    private final BankCodeSource source;
    private final BankCodeListRecorder recorder;
    private final Clock clock;

    public BankCodeRefreshService(BankCodeSource source, BankCodeListRecorder recorder, Clock clock) {
        this.source = source;
        this.recorder = recorder;
        this.clock = clock;
    }

    public BankCodeRefresh refresh() {
        return switch (source.fetch(recorder.state())) {
            case BankCodeFetch.Fetched fetched -> recorder.recordFetched(fetched);
            case BankCodeFetch.Unchanged ignored -> recorder.recordUnchanged();
        };
    }

    public boolean isDue() {
        return recorder.state().isDue(clock.instant());
    }
}
